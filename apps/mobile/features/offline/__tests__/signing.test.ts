import {
  signPaymentInstruction,
  verifyPaymentInstruction,
} from '@/lib/crypto/signing';
import type { PaymentInstruction } from '../models';

const TEST_KEY =
  'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

const baseInstruction: Omit<PaymentInstruction, 'version' | 'signature'> = {
  paymentId: 'pay_sign_test',
  payerWalletId: 'wallet_payer_sign',
  payeeId: 'wallet_payee_sign',
  stablecoinTicker: 'USDC',
  amount: '2000000',
  offlineAllowanceId: null,
  nonce: 1,
  timestamp: 1696800000000,
  expiresAt: 1696803600000,
};

describe('HMAC-SHA256 signing round-trip', () => {
  it('sign then verify returns true', async () => {
    const signature = await signPaymentInstruction(baseInstruction, TEST_KEY);
    expect(typeof signature).toBe('string');
    expect(signature.length).toBeGreaterThan(0);

    const full: PaymentInstruction = {
      version: 1,
      ...baseInstruction,
      signature,
    };
    const valid = await verifyPaymentInstruction(full, TEST_KEY);
    expect(valid).toBe(true);
  });

  it('verification fails with wrong key', async () => {
    const signature = await signPaymentInstruction(baseInstruction, TEST_KEY);
    const full: PaymentInstruction = {
      version: 1,
      ...baseInstruction,
      signature,
    };
    const wrongKey =
      'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const valid = await verifyPaymentInstruction(full, wrongKey);
    expect(valid).toBe(false);
  });

  it('verification fails with tampered amount', async () => {
    const signature = await signPaymentInstruction(baseInstruction, TEST_KEY);
    const tampered: PaymentInstruction = {
      version: 1,
      ...baseInstruction,
      amount: '9999999',
      signature,
    };
    const valid = await verifyPaymentInstruction(tampered, TEST_KEY);
    expect(valid).toBe(false);
  });

  it('different paymentIds produce different signatures', async () => {
    const sig1 = await signPaymentInstruction(baseInstruction, TEST_KEY);
    const sig2 = await signPaymentInstruction(
      { ...baseInstruction, paymentId: 'pay_other' },
      TEST_KEY,
    );
    expect(sig1).not.toBe(sig2);
  });

  it('same inputs produce the same signature (deterministic)', async () => {
    const sig1 = await signPaymentInstruction(baseInstruction, TEST_KEY);
    const sig2 = await signPaymentInstruction(baseInstruction, TEST_KEY);
    expect(sig1).toBe(sig2);
  });
});
