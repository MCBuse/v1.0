import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { StripeClient } from '../../stripe/stripe.client';
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

export function mapStripeCryptoOnrampStatus(raw: string): NormalizedOnrampStatus {
  switch (raw) {
    case 'fulfillment_complete':
      return 'completed';
    case 'fulfillment_processing':
      return 'processing';
    case 'rejected':
      return 'cancelled';
    case 'initialized':
    case 'requires_payment':
    default:
      return 'pending';
  }
}

@Injectable()
export class StripeOnrampProvider implements OnrampWidgetProvider {
  readonly providerName = 'stripe';
  private readonly logger = new Logger(StripeOnrampProvider.name);

  constructor(
    private readonly client: StripeClient,
    private readonly config: ConfigService,
  ) { }

  private get stripe(): Stripe.Stripe {
    return this.client.stripe;
  }

  private cryptoOnrampEnabled(): boolean {
    return (this.config.get<string>('STRIPE_CRYPTO_ONRAMP_ENABLED') ?? 'false').toLowerCase() === 'true';
  }

  async createWidgetSession(
    params: CreateWidgetSessionParams,
  ): Promise<CreateWidgetSessionResult> {
    if (this.cryptoOnrampEnabled()) {
      try {
        const session = await this.createCryptoOnrampSession(params);
        return { widgetUrl: session.redirectUrl, internalReference: params.internalReference };
      } catch (err) {
        this.logger.warn(
          `Stripe Crypto Onramp unavailable, falling back to Checkout: ${(err as Error).message}`,
        );
      }
    }
    try {
      const url = await this.createCheckoutSession(params);
      return { widgetUrl: url, internalReference: params.internalReference };
    } catch (err) {
      const error = err as Error;
      if (error.message?.includes('Invalid API Key') || error.message?.includes('authentication')) {
        this.logger.error(
          'Stripe API authentication failed. STRIPE_SECRET_KEY may be invalid. ' +
          'Get a real test key from https://dashboard.stripe.com/test/apikeys'
        );
        throw new Error(
          'Payment provider is not configured. Please contact support or set STRIPE_SECRET_KEY to a valid test key.'
        );
      }
      throw err;
    }
  }

  private async createCryptoOnrampSession(
    params: CreateWidgetSessionParams,
  ): Promise<{ redirectUrl: string; sessionId: string }> {
    const body = {
      'wallet_addresses[solana]': params.walletAddress,
      source_currency: params.fiatCurrency.toLowerCase(),
      source_amount: params.fiatAmount,
      destination_currency: 'usdc',
      destination_network: 'solana',
      lock_wallet_address: true,
      'metadata[internalReference]': params.internalReference,
      'metadata[walletId]': params.walletId,
      'metadata[userId]': params.userId,
    };
    const result = (await this.stripe.rawRequest(
      'POST',
      '/v1/crypto/onramp_sessions',
      body,
      { apiVersion: '2026-04-22.preview' },
    )) as { id?: string; redirect_url?: string; client_secret?: string };
    if (!result?.id || !result?.redirect_url) {
      throw new Error('Stripe Crypto Onramp returned no redirect_url');
    }
    return { redirectUrl: result.redirect_url, sessionId: result.id };
  }

  private async createCheckoutSession(params: CreateWidgetSessionParams): Promise<string> {
    const successUrl =
      this.config.get<string>('STRIPE_CHECKOUT_SUCCESS_URL') ??
      `${params.redirectUrl}?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl =
      this.config.get<string>('STRIPE_CHECKOUT_CANCEL_URL') ??
      `${params.redirectUrl}?cancelled=1`;

    const unitAmount = Math.round(Number(params.fiatAmount) * 100);
    if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
      throw new Error(`Invalid fiatAmount for Stripe Checkout: ${params.fiatAmount}`);
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: params.internalReference,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: params.fiatCurrency.toLowerCase(),
            unit_amount: unitAmount,
            product_data: {
              name: 'Add USDC to MCBuse',
              description: `Top up your savings wallet with ${params.fiatAmount} ${params.fiatCurrency.toUpperCase()} of USDC on Solana.`,
            },
          },
        },
      ],
      metadata: {
        internalReference: params.internalReference,
        walletId: params.walletId,
        walletAddress: params.walletAddress,
        userId: params.userId,
        cryptoCurrency: params.cryptoCurrency,
        network: params.network,
        mcb_settlement: 'treasury_usdc',
      },
    });
    if (!session.url) {
      throw new Error('Stripe Checkout session has no url');
    }
    return session.url;
  }

  isOnrampEvent(eventType: string): boolean {
    return (
      eventType.startsWith('crypto.onramp_session.') ||
      eventType.startsWith('crypto_onramp_session.') ||
      eventType.startsWith('checkout.session.') ||
      eventType.startsWith('payment_intent.')
    );
  }

  verifyWebhook(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET not set — rejecting Stripe webhook');
      return false;
    }
    if (!signatureHeader) return false;
    try {
      this.stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
      return true;
    } catch (err) {
      this.logger.warn(`Stripe webhook signature verification failed: ${(err as Error).message}`);
      return false;
    }
  }

  parseWebhook(payload: unknown): NormalizedOnrampEvent {
    if (!isRecord(payload)) throw new Error('Invalid webhook payload');
    const eventType = asString(payload['type']) ?? 'unknown';
    const data = isRecord(payload['data']) ? (payload['data']['object'] as unknown) : undefined;
    if (!isRecord(data)) throw new Error('Invalid webhook payload: missing data.object');

    if (eventType.startsWith('crypto.onramp_session.') || eventType.startsWith('crypto_onramp_session.')) {
      return this.parseCryptoOnrampEvent(eventType, data);
    }
    if (eventType.startsWith('checkout.session.') || eventType.startsWith('payment_intent.')) {
      return this.parseCheckoutEvent(eventType, data);
    }
    throw new Error(`Unsupported Stripe onramp event type: ${eventType}`);
  }

  private parseCryptoOnrampEvent(
    eventType: string,
    data: Record<string, unknown>,
  ): NormalizedOnrampEvent {
    const id = asString(data['id']) ?? '';
    if (!id) throw new Error('Crypto onramp session missing id');

    const rawStatus = asString(data['status']) ?? eventType.split('.').pop() ?? 'pending';
    const transactionDetails = isRecord(data['transaction_details']) ? data['transaction_details'] : undefined;
    const metadata = isRecord(data['metadata']) ? data['metadata'] : undefined;

    const cryptoAmount = transactionDetails
      ? asString(transactionDetails['destination_amount'])
      : undefined;
    const cryptoCurrency = transactionDetails
      ? asString(transactionDetails['destination_currency'])?.toUpperCase()
      : undefined;
    const fiatAmount = transactionDetails
      ? asString(transactionDetails['source_amount'])
      : undefined;
    const fiatCurrency = transactionDetails
      ? asString(transactionDetails['source_currency'])?.toUpperCase()
      : undefined;
    const txHash = transactionDetails ? asString(transactionDetails['transaction_id']) : undefined;
    const walletAddresses =
      transactionDetails && isRecord(transactionDetails['wallet_addresses'])
        ? transactionDetails['wallet_addresses']
        : undefined;
    const walletAddress =
      (walletAddresses ? asString(walletAddresses['solana']) : undefined) ??
      (transactionDetails ? asString(transactionDetails['wallet_address']) : undefined) ??
      '';

    return {
      externalTransactionId: id,
      internalReference: metadata ? asString(metadata['internalReference']) : undefined,
      status: mapStripeCryptoOnrampStatus(rawStatus),
      cryptoAmount,
      cryptoCurrency,
      fiatAmount,
      fiatCurrency,
      txHash,
      walletAddress,
      providerRawStatus: rawStatus,
    };
  }

  private parseCheckoutEvent(
    eventType: string,
    data: Record<string, unknown>,
  ): NormalizedOnrampEvent {
    const id = asString(data['id']) ?? '';
    if (!id) throw new Error('Checkout/PaymentIntent event missing id');
    const metadata = isRecord(data['metadata']) ? data['metadata'] : undefined;
    const internalReference = metadata ? asString(metadata['internalReference']) : undefined;
    const walletAddress = (metadata ? asString(metadata['walletAddress']) : undefined) ?? '';
    const fiatCurrency = asString(data['currency'])?.toUpperCase();

    const amountTotal = data['amount_total'] ?? data['amount_received'] ?? data['amount'];
    const fiatAmount =
      typeof amountTotal === 'number' && Number.isFinite(amountTotal)
        ? (amountTotal / 100).toString()
        : undefined;

    let providerRawStatus = asString(data['payment_status']) ?? asString(data['status']) ?? 'unknown';
    let status: NormalizedOnrampStatus;
    if (eventType === 'checkout.session.completed') {
      // payment_status: paid | unpaid | no_payment_required
      status = providerRawStatus === 'paid' ? 'completed' : 'pending';
    } else if (eventType === 'checkout.session.expired') {
      status = 'expired';
      providerRawStatus = 'expired';
    } else if (eventType === 'payment_intent.succeeded') {
      status = 'completed';
      providerRawStatus = 'succeeded';
    } else if (eventType === 'payment_intent.payment_failed') {
      status = 'failed';
      providerRawStatus = 'failed';
    } else if (eventType === 'payment_intent.canceled') {
      status = 'cancelled';
      providerRawStatus = 'canceled';
    } else {
      status = 'pending';
    }

    // Treasury settlement model: 1 USDC = 1 USD. The fiat we just collected equals
    // the USDC we owe the user, so credit at the same magnitude when payment clears.
    const cryptoAmount = status === 'completed' ? fiatAmount : undefined;
    const cryptoCurrency = status === 'completed' ? 'USDC' : undefined;

    return {
      externalTransactionId: id,
      internalReference,
      status,
      cryptoAmount,
      cryptoCurrency,
      fiatAmount,
      fiatCurrency,
      walletAddress,
      providerRawStatus,
    };
  }
}
