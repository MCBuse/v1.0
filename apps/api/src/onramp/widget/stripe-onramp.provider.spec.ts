import { ConfigService } from '@nestjs/config';
import {
  StripeOnrampProvider,
  mapStripeCryptoOnrampStatus,
} from './stripe-onramp.provider';
import type { StripeClient } from '../../stripe/stripe.client';

describe('mapStripeCryptoOnrampStatus', () => {
  it('maps lifecycle statuses', () => {
    expect(mapStripeCryptoOnrampStatus('fulfillment_complete')).toBe('completed');
    expect(mapStripeCryptoOnrampStatus('fulfillment_processing')).toBe('processing');
    expect(mapStripeCryptoOnrampStatus('rejected')).toBe('cancelled');
    expect(mapStripeCryptoOnrampStatus('initialized')).toBe('pending');
    expect(mapStripeCryptoOnrampStatus('requires_payment')).toBe('pending');
  });
});

describe('StripeOnrampProvider', () => {
  const mkConfig = (overrides: Record<string, string> = {}) =>
    ({
      get: (k: string) => overrides[k],
      getOrThrow: (k: string) => {
        const v = overrides[k];
        if (v === undefined) throw new Error(`missing ${k}`);
        return v;
      },
    }) as unknown as ConfigService;

  function buildProvider(stripeMock: Record<string, unknown>) {
    const client = { stripe: stripeMock } as unknown as StripeClient;
    return new StripeOnrampProvider(client, mkConfig({ STRIPE_WEBHOOK_SECRET: 'whsec_x' }));
  }

  it('falls back to Checkout when Crypto Onramp is disabled', async () => {
    const checkoutCreate = jest
      .fn()
      .mockResolvedValue({ id: 'cs_test_123', url: 'https://checkout.stripe.com/c/pay/cs_test_123' });
    const provider = buildProvider({
      checkout: { sessions: { create: checkoutCreate } },
    });

    const { widgetUrl, internalReference } = await provider.createWidgetSession({
      userId: 'u1',
      walletId: 'w1',
      walletAddress: 'SoLana11111111111111111111111111111111111112',
      fiatAmount: '25.00',
      fiatCurrency: 'USD',
      cryptoCurrency: 'USDC',
      network: 'solana',
      redirectUrl: 'mcbuse://onramp/complete',
      internalReference: 'ref-1',
    });

    expect(widgetUrl).toBe('https://checkout.stripe.com/c/pay/cs_test_123');
    expect(internalReference).toBe('ref-1');
    const args = checkoutCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(args.mode).toBe('payment');
    expect(args.client_reference_id).toBe('ref-1');
    expect(args.payment_method_types).toBeUndefined();
  });

  it('parses checkout.session.completed (paid) as completed and credits USDC 1:1', () => {
    const provider = buildProvider({});
    const event = provider.parseWebhook({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          payment_status: 'paid',
          currency: 'usd',
          amount_total: 2500,
          metadata: { internalReference: 'ref-1', walletAddress: 'wallet-x' },
        },
      },
    });
    expect(event.status).toBe('completed');
    expect(event.internalReference).toBe('ref-1');
    expect(event.fiatAmount).toBe('25');
    expect(event.fiatCurrency).toBe('USD');
    expect(event.cryptoAmount).toBe('25');
    expect(event.cryptoCurrency).toBe('USDC');
  });

  it('parses crypto onramp completed events', () => {
    const provider = buildProvider({});
    const event = provider.parseWebhook({
      type: 'crypto.onramp_session.fulfillment_completed',
      data: {
        object: {
          id: 'cos_test_1',
          status: 'fulfillment_complete',
          transaction_details: {
            destination_amount: '24.95',
            destination_currency: 'usdc',
            destination_network: 'solana',
            source_amount: '25.00',
            source_currency: 'usd',
            transaction_id: 'sigxyz',
            wallet_addresses: { solana: 'wallet-x' },
          },
          metadata: { internalReference: 'ref-1' },
        },
      },
    });
    expect(event.status).toBe('completed');
    expect(event.internalReference).toBe('ref-1');
    expect(event.cryptoAmount).toBe('24.95');
    expect(event.cryptoCurrency).toBe('USDC');
    expect(event.txHash).toBe('sigxyz');
  });

  it('rejects webhook when secret is missing', () => {
    const client = { stripe: {} } as unknown as StripeClient;
    const provider = new StripeOnrampProvider(client, mkConfig({}));
    expect(provider.verifyWebhook(Buffer.from('{}'), 't=1,v1=abc')).toBe(false);
  });
});
