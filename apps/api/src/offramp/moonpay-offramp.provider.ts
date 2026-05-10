import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type {
  MoonpaySellTransaction,
  NormalizedMoonpaySellEvent,
  NormalizedOfframpStatus,
} from './moonpay-offramp.types';

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function asString(x: unknown): string | undefined {
  return typeof x === 'string' ? x : undefined;
}

function asNullableString(x: unknown): string | null | undefined {
  return x === null ? null : asString(x);
}

function asNumberOrString(x: unknown): string | undefined {
  if (typeof x === 'number' && Number.isFinite(x)) return String(x);
  return asString(x);
}

function currencyCode(x: unknown): string | undefined {
  if (typeof x === 'string') return x.toUpperCase();
  if (isRecord(x)) return asString(x['code'])?.toUpperCase();
  return undefined;
}

export function mapMoonPaySellStatus(raw: string): NormalizedOfframpStatus {
  const s = raw.toLowerCase();
  if (s === 'completed') return 'completed';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'requote_required' || s === 'requote-required' || s === 'requoterequired') {
    return 'requote_required';
  }
  if (s === 'waitingfordeposit' || s === 'waiting_for_deposit') {
    return 'waiting_for_deposit';
  }
  if (s === 'failed' || s === 'rejected' || s === 'declined') return 'failed';
  if (s === 'frozen') return 'refund_pending';
  if (s === 'pending' || s === 'processing' || s === 'depositreceived') {
    return 'processing';
  }
  return 'processing';
}

@Injectable()
export class MoonpayOfframpProvider {
  private readonly logger = new Logger(MoonpayOfframpProvider.name);

  constructor(private readonly config: ConfigService) {}

  get publicKey(): string {
    const apiKey =
      this.config.get<string>('MOONPAY_PUBLIC_KEY') ??
      this.config.get<string>('MOONPAY_API_KEY');
    if (!apiKey) {
      throw new Error('MOONPAY_PUBLIC_KEY is required for MoonPay off-ramp sessions');
    }
    return apiKey;
  }

  get usdcCurrencyCode(): string {
    return this.config.get<string>('MOONPAY_USDC_CURRENCY_CODE') ?? 'usdc_sol';
  }

  get environment(): 'sandbox' | 'production' {
    const configured = this.config.get<string>('MOONPAY_ENVIRONMENT')?.toLowerCase();
    if (configured === 'production') return 'production';
    if (configured === 'sandbox') return 'sandbox';
    return this.publicKey.startsWith('pk_live') ? 'production' : 'sandbox';
  }

  signUrl(url: string, expected: {
    internalReference: string;
    refundWalletAddress: string;
    cryptoAmount: string;
  }): string {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Invalid MoonPay URL');
    }

    if (!this.allowedWidgetHosts().has(parsed.host)) {
      throw new BadRequestException('MoonPay URL host is not allowed');
    }

    const apiKey = parsed.searchParams.get('apiKey');
    if (apiKey !== this.publicKey) {
      throw new BadRequestException('MoonPay URL apiKey does not match server configuration');
    }

    const externalTransactionId = parsed.searchParams.get('externalTransactionId');
    if (externalTransactionId !== expected.internalReference) {
      throw new BadRequestException('MoonPay URL transaction reference mismatch');
    }

    const refundWalletAddress = parsed.searchParams.get('refundWalletAddress');
    if (refundWalletAddress !== expected.refundWalletAddress) {
      throw new BadRequestException('MoonPay URL refund wallet mismatch');
    }

    const currencyCode =
      parsed.searchParams.get('baseCurrencyCode') ??
      parsed.searchParams.get('defaultBaseCurrencyCode');
    if (currencyCode !== this.usdcCurrencyCode) {
      throw new BadRequestException('MoonPay URL currency mismatch');
    }

    const baseCurrencyAmount = parsed.searchParams.get('baseCurrencyAmount');
    if (baseCurrencyAmount && baseCurrencyAmount !== expected.cryptoAmount) {
      throw new BadRequestException('MoonPay URL amount mismatch');
    }

    const secretKey = this.config.getOrThrow<string>('MOONPAY_SECRET_KEY');
    return createHmac('sha256', secretKey).update(parsed.search).digest('base64');
  }

  private allowedWidgetHosts(): Set<string> {
    const hosts = new Set(['sell.moonpay.com', 'sell-sandbox.moonpay.com']);
    const configured = this.config.get<string>('MOONPAY_SELL_BASE_URL');
    if (configured) {
      try {
        hosts.add(new URL(configured).host);
      } catch {
        this.logger.warn('Ignoring invalid MOONPAY_SELL_BASE_URL host');
      }
    }
    return hosts;
  }

  verifyWebhook(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    const webhookSecret = this.config.get<string>('MOONPAY_WEBHOOK_SECRET');
    if (!webhookSecret) {
      this.logger.error('MOONPAY_WEBHOOK_SECRET not set — rejecting MoonPay webhook');
      return false;
    }
    if (!signatureHeader) return false;

    const parts = signatureHeader.split(',').map((p) => p.trim());
    let t = '';
    let s = '';
    for (const part of parts) {
      const [k, v] = part.split('=');
      if (k === 't') t = v ?? '';
      if (k === 's') s = v ?? '';
    }
    if (!t || !s) return false;

    const toleranceSeconds = Number(
      this.config.get<string>('MOONPAY_WEBHOOK_TOLERANCE_SECONDS') ?? '300',
    );
    const timestampSeconds = Number(t);
    if (
      Number.isFinite(toleranceSeconds) &&
      toleranceSeconds > 0 &&
      (!Number.isFinite(timestampSeconds) ||
        Math.abs(Date.now() / 1000 - timestampSeconds) > toleranceSeconds)
    ) {
      return false;
    }

    const signedPayload = `${t}.${rawBody.toString('utf8')}`;
    const expectedHex = createHmac('sha256', webhookSecret)
      .update(signedPayload)
      .digest('hex');
    try {
      const a = Buffer.from(expectedHex, 'hex');
      const b = Buffer.from(s, 'hex');
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  parseWebhook(payload: unknown): NormalizedMoonpaySellEvent {
    if (!isRecord(payload)) throw new Error('Invalid webhook payload');
    const data = payload['data'];
    if (!isRecord(data)) throw new Error('Invalid webhook payload: missing data');

    const moonpayTxId = asString(data['id']);
    if (!moonpayTxId) throw new Error('Invalid webhook payload: missing data.id');

    const rawStatus = asString(data['status']) ?? 'unknown';
    const type = asString(payload['type']);
    const status =
      type === 'sell_transaction_requote_required'
        ? 'requote_required'
        : mapMoonPaySellStatus(rawStatus);

    const depositWallet = isRecord(data['depositWallet'])
      ? data['depositWallet']
      : undefined;
    const quoteCurrency = data['quoteCurrency'];
    const baseCurrency = data['baseCurrency'];

    return {
      externalTransactionId: moonpayTxId,
      internalReference: asString(data['externalTransactionId']),
      status,
      providerRawStatus: rawStatus,
      cryptoAmount: asNumberOrString(data['baseCurrencyAmount']),
      cryptoCurrency: currencyCode(baseCurrency),
      fiatAmount: asNumberOrString(data['quoteCurrencyAmount']),
      fiatCurrency: currencyCode(quoteCurrency),
      depositWalletAddress:
        asString(data['depositWalletAddress']) ??
        (depositWallet ? asString(depositWallet['walletAddress']) : undefined),
      depositWalletAddressTag:
        asNullableString(data['depositWalletAddressTag']) ??
        (depositWallet ? asNullableString(depositWallet['walletAddressTag']) : undefined),
      depositTxHash: asNullableString(data['depositHash']) ?? undefined,
      refundTxHash: asNullableString(data['refundHash']) ?? undefined,
      trackerUrl: asNullableString(data['returnUrl']) ?? undefined,
    };
  }

  async getSellTransaction(transactionId: string): Promise<MoonpaySellTransaction> {
    const apiBaseUrl =
      this.config.get<string>('MOONPAY_API_BASE_URL')?.replace(/\/$/, '') ??
      'https://api.moonpay.com';
    const url = new URL(`/v3/sell_transactions/${encodeURIComponent(transactionId)}`, apiBaseUrl);
    url.searchParams.set('apiKey', this.publicKey);

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      throw new BadRequestException(`MoonPay sell transaction lookup failed (${response.status})`);
    }
    const body = (await response.json()) as unknown;
    if (!isRecord(body)) throw new BadRequestException('Invalid MoonPay sell transaction response');
    return body as MoonpaySellTransaction;
  }
}
