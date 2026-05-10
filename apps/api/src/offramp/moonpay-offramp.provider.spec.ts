import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import {
  MoonpayOfframpProvider,
  mapMoonPaySellStatus,
} from './moonpay-offramp.provider';

describe('mapMoonPaySellStatus', () => {
  it('maps MoonPay sell statuses to local states', () => {
    expect(mapMoonPaySellStatus('waitingForDeposit')).toBe('waiting_for_deposit');
    expect(mapMoonPaySellStatus('pending')).toBe('processing');
    expect(mapMoonPaySellStatus('completed')).toBe('completed');
    expect(mapMoonPaySellStatus('failed')).toBe('failed');
    expect(mapMoonPaySellStatus('requoteRequired')).toBe('requote_required');
  });
});

describe('MoonpayOfframpProvider', () => {
  const mkConfig = (overrides: Record<string, string> = {}) =>
    ({
      get: (k: string) => overrides[k],
      getOrThrow: (k: string) => {
        const v = overrides[k];
        if (v === undefined) throw new Error(`missing ${k}`);
        return v;
      },
    }) as unknown as ConfigService;

  it('signs SDK URLs using the raw query string HMAC', () => {
    const provider = new MoonpayOfframpProvider(
      mkConfig({
        MOONPAY_PUBLIC_KEY: 'pk_test_key',
        MOONPAY_SECRET_KEY: 'sk_test_key',
        MOONPAY_USDC_CURRENCY_CODE: 'usdc_sol',
      }),
    );
    const url =
      'https://sell-sandbox.moonpay.com?apiKey=pk_test_key&baseCurrencyCode=usdc_sol&baseCurrencyAmount=10&refundWalletAddress=SoL111&externalTransactionId=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

    const signature = provider.signUrl(url, {
      internalReference: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      refundWalletAddress: 'SoL111',
      cryptoAmount: '10',
    });

    expect(signature).toBe(
      createHmac('sha256', 'sk_test_key').update(new URL(url).search).digest('base64'),
    );
  });

  it('verifyWebhook validates Moonpay-Signature-V2', () => {
    const secret = 'whsec_test';
    const provider = new MoonpayOfframpProvider(
      mkConfig({ MOONPAY_WEBHOOK_SECRET: secret }),
    );
    const body = Buffer.from('{"type":"sell_transaction_updated"}', 'utf8');
    const t = String(Math.floor(Date.now() / 1000));
    const s = createHmac('sha256', secret)
      .update(`${t}.${body.toString('utf8')}`)
      .digest('hex');

    expect(provider.verifyWebhook(body, `t=${t},s=${s}`)).toBe(true);
    expect(provider.verifyWebhook(Buffer.from('{}'), `t=${t},s=${s}`)).toBe(false);
  });

  it('parses sell webhooks into normalized events', () => {
    const provider = new MoonpayOfframpProvider(mkConfig({}));
    const event = provider.parseWebhook({
      type: 'sell_transaction_updated',
      data: {
        id: 'moonpay-tx-1',
        status: 'waitingForDeposit',
        externalTransactionId: 'local-ref-1',
        baseCurrencyAmount: 12.5,
        quoteCurrencyAmount: 12.41,
        depositHash: 'solana-deposit-hash',
        returnUrl: 'https://sell.moonpay.com/transaction_receipt?transactionId=moonpay-tx-1',
        baseCurrency: { code: 'usdc_sol' },
        quoteCurrency: { code: 'usd' },
        depositWallet: {
          walletAddress: 'MoonPayDepositWallet111',
          walletAddressTag: null,
        },
      },
    });

    expect(event.status).toBe('waiting_for_deposit');
    expect(event.externalTransactionId).toBe('moonpay-tx-1');
    expect(event.internalReference).toBe('local-ref-1');
    expect(event.cryptoAmount).toBe('12.5');
    expect(event.fiatCurrency).toBe('USD');
    expect(event.depositWalletAddress).toBe('MoonPayDepositWallet111');
    expect(event.depositTxHash).toBe('solana-deposit-hash');
  });
});
