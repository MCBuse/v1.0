import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { OnrampWidgetProvider } from './onramp-widget-provider.interface';
import type {
  CreateWidgetSessionParams,
  CreateWidgetSessionResult,
  NormalizedOnrampEvent,
  NormalizedOnrampStatus,
} from './onramp-widget.types';

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function asString(x: unknown): string | undefined {
  return typeof x === 'string' ? x : undefined;
}

function asNumber(x: unknown): number | undefined {
  return typeof x === 'number' && Number.isFinite(x) ? x : undefined;
}

/** Map MoonPay buy `data.status` to normalized lifecycle */
export function mapMoonPayBuyStatus(raw: string): NormalizedOnrampStatus {
  const s = raw.toLowerCase();
  if (s === 'completed') return 'completed';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (
    s === 'failed' ||
    s === 'rejected' ||
    s === 'declined' ||
    s === 'refunded'
  ) {
    return 'failed';
  }
  if (
    s === 'pending' ||
    s === 'waitingpayment' ||
    s === 'waiting_payment' ||
    s === 'waitingauthorization' ||
    s === 'waiting_authorization' ||
    s === 'waitingreview' ||
    s === 'waiting_review'
  ) {
    return 'pending';
  }
  if (
    s === 'processing' ||
    s === 'pendingdelivery' ||
    s === 'pending_delivery' ||
    s === 'sending' ||
    s === 'confirming'
  ) {
    return 'processing';
  }
  return 'processing';
}

@Injectable()
export class MoonpayWidgetProvider implements OnrampWidgetProvider {
  readonly providerName = 'moonpay';
  private readonly logger = new Logger(MoonpayWidgetProvider.name);

  constructor(private readonly config: ConfigService) {}

  async createWidgetSession(
    params: CreateWidgetSessionParams,
  ): Promise<CreateWidgetSessionResult> {
    const apiKey =
      this.config.get<string>('MOONPAY_PUBLIC_KEY') ??
      this.config.get<string>('MOONPAY_API_KEY');
    if (!apiKey) {
      throw new Error(
        'MOONPAY_PUBLIC_KEY is required for MoonPay widget sessions',
      );
    }
    const secretKey = this.config.getOrThrow<string>('MOONPAY_SECRET_KEY');
    const baseUrl =
      this.config.get<string>('MOONPAY_BASE_URL')?.replace(/\/$/, '') ??
      'https://buy-sandbox.moonpay.com';

    const usdcOverride = this.config.get<string>('MOONPAY_USDC_CURRENCY_CODE');
    const currencyCode =
      params.cryptoCurrency.toUpperCase() === 'USDC'
        ? (usdcOverride ?? 'usdc_sol')
        : params.cryptoCurrency.toLowerCase();

    const pairs: [string, string][] = [
      ['apiKey', apiKey],
      ['baseCurrencyAmount', params.fiatAmount],
      ['baseCurrencyCode', params.fiatCurrency.toLowerCase()],
      ['currencyCode', currencyCode],
      ['externalTransactionId', params.internalReference],
      ['redirectURL', params.redirectUrl],
      ['walletAddress', params.walletAddress],
    ];
    pairs.sort((a, b) => a[0].localeCompare(b[0]));

    const search =
      '?' +
      pairs
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');

    const signature = createHmac('sha256', secretKey)
      .update(search)
      .digest('base64');
    const widgetUrl = `${baseUrl}${search}&signature=${encodeURIComponent(signature)}`;

    return { widgetUrl, internalReference: params.internalReference };
  }

  verifyWebhook(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    const webhookSecret = this.config.get<string>('MOONPAY_WEBHOOK_SECRET');
    if (!webhookSecret) {
      this.logger.error(
        'MOONPAY_WEBHOOK_SECRET not set — rejecting MoonPay webhook',
      );
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

  parseWebhook(payload: unknown): NormalizedOnrampEvent {
    if (!isRecord(payload)) {
      throw new Error('Invalid webhook payload');
    }
    const data = payload['data'];
    if (!isRecord(data)) {
      throw new Error('Invalid webhook payload: missing data');
    }

    const moonpayTxId = asString(data['id']);
    if (!moonpayTxId) {
      throw new Error('Invalid webhook payload: missing data.id');
    }

    const providerRawStatus = asString(data['status']) ?? 'unknown';
    const status = mapMoonPayBuyStatus(providerRawStatus);
    const walletAddress = asString(data['walletAddress']) ?? '';
    const internalRef = asString(data['externalTransactionId']) ?? undefined;
    const cryptoTx = asString(data['cryptoTransactionId']) ?? undefined;

    const quote = asNumber(data['quoteCurrencyAmount']);
    const cryptoAmount = quote !== undefined ? String(quote) : undefined;

    const baseAmt = asNumber(data['baseCurrencyAmount']);
    const fiatAmount = baseAmt !== undefined ? String(baseAmt) : undefined;

    const baseCur = isRecord(data['baseCurrency'])
      ? asString(data['baseCurrency']['code'])
      : undefined;
    const fiatCurrency = baseCur?.toUpperCase();

    const quoteCur = isRecord(data['currency'])
      ? asString(data['currency']['code'])
      : undefined;
    const cryptoCurrency = quoteCur?.toUpperCase();

    return {
      externalTransactionId: moonpayTxId,
      moonpayTransactionId: moonpayTxId,
      internalReference: internalRef,
      status,
      cryptoAmount,
      cryptoCurrency,
      fiatAmount,
      fiatCurrency,
      txHash: cryptoTx,
      walletAddress,
      providerRawStatus,
    };
  }
}
