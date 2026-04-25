import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { MoonpayWidgetProvider, mapMoonPayBuyStatus } from './moonpay-widget.provider';

describe('mapMoonPayBuyStatus', () => {
  it('maps terminal and non-terminal statuses', () => {
    expect(mapMoonPayBuyStatus('completed')).toBe('completed');
    expect(mapMoonPayBuyStatus('failed')).toBe('failed');
    expect(mapMoonPayBuyStatus('cancelled')).toBe('cancelled');
    expect(mapMoonPayBuyStatus('pending')).toBe('pending');
    expect(mapMoonPayBuyStatus('waitingPayment')).toBe('pending');
    expect(mapMoonPayBuyStatus('processing')).toBe('processing');
  });
});

describe('MoonpayWidgetProvider', () => {
  const mkConfig = (overrides: Record<string, string> = {}) =>
    ({
      get: (k: string) => overrides[k],
      getOrThrow: (k: string) => {
        const v = overrides[k];
        if (v === undefined) throw new Error(`missing ${k}`);
        return v;
      },
    }) as unknown as ConfigService;

  it('signs widget URL per MoonPay query-string HMAC (base64)', async () => {
    const provider = new MoonpayWidgetProvider(
      mkConfig({
        MOONPAY_PUBLIC_KEY: 'pk_test_key',
        MOONPAY_SECRET_KEY: 'sk_test_key',
        MOONPAY_BASE_URL: 'https://buy-sandbox.moonpay.com',
      }),
    );

    const { widgetUrl } = await provider.createWidgetSession({
      userId: 'u1',
      walletId: 'w1',
      walletAddress: 'SoLana11111111111111111111111111111111111112',
      fiatAmount: '25.00',
      fiatCurrency: 'EUR',
      cryptoCurrency: 'USDC',
      redirectUrl: 'mcbuse://onramp/complete',
      internalReference: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    });

    const u = new URL(widgetUrl);
    expect(u.searchParams.get('redirectURL')).toBe('mcbuse://onramp/complete');
    const sigParam = u.searchParams.get('signature');
    expect(sigParam).toBeTruthy();
    u.searchParams.delete('signature');
    const search = u.search;
    const expected = createHmac('sha256', 'sk_test_key').update(search).digest('base64');
    expect(decodeURIComponent(sigParam!)).toBe(expected);
  });

  it('verifyWebhook validates Moonpay-Signature-V2 (t.body HMAC)', () => {
    const secret = 'whsec_test';
    const provider = new MoonpayWidgetProvider(mkConfig({ MOONPAY_WEBHOOK_SECRET: secret }));
    const body = Buffer.from('{"hello":true}', 'utf8');
    const t = String(Math.floor(Date.now() / 1000));
    const signedPayload = `${t}.${body.toString('utf8')}`;
    const s = createHmac('sha256', secret).update(signedPayload).digest('hex');
    const header = `t=${t},s=${s}`;
    expect(provider.verifyWebhook(body, header)).toBe(true);
    expect(provider.verifyWebhook(Buffer.from('{"tampered":true}'), header)).toBe(false);
  });

  it('verifyWebhook rejects wrong length hex safely', () => {
    const provider = new MoonpayWidgetProvider(
      mkConfig({ MOONPAY_WEBHOOK_SECRET: 'whsec_test' }),
    );
    const body = Buffer.from('{}');
    const bad = 't=1,s=nothex';
    expect(provider.verifyWebhook(body, bad)).toBe(false);
  });

  it('verifyWebhook rejects requests when secret is missing', () => {
    const provider = new MoonpayWidgetProvider(mkConfig({}));
    expect(provider.verifyWebhook(Buffer.from('{}'), 't=1,s=00')).toBe(false);
  });

  it('parseWebhook maps buy transaction payload', () => {
    const provider = new MoonpayWidgetProvider(mkConfig({}));
    const payload = {
      type: 'transaction_updated',
      data: {
        id: 'bda09e91-559f-4e7a-807a-cdec1a903d9d',
        status: 'completed',
        walletAddress: '0xc216eD2D6c295579718dbd4a797845CdA70B3C36',
        externalTransactionId: 'our-internal-ref',
        quoteCurrencyAmount: 12.345678,
        baseCurrencyAmount: 25,
        baseCurrency: { code: 'eur' },
        currency: { code: 'usdc' },
        cryptoTransactionId: '5VERv8NMvzbJMEkV8xnrLkTaB9sUGREm73ncn4PiBqt',
      },
    };
    const ev = provider.parseWebhook(payload);
    expect(ev.status).toBe('completed');
    expect(ev.internalReference).toBe('our-internal-ref');
    expect(ev.cryptoAmount).toBe('12.345678');
    expect(ev.fiatCurrency).toBe('EUR');
    expect(ev.txHash).toBe('5VERv8NMvzbJMEkV8xnrLkTaB9sUGREm73ncn4PiBqt');
  });
});
