import {
  PaymentInstruction,
  createPaymentInstructionPayload,
  isInstructionExpired,
  validateInstructionFields,
} from '../models';

const validInstruction: PaymentInstruction = {
  version: 1,
  paymentId: 'pay_test_001',
  payerWalletId: 'wallet_payer',
  payeeId: 'wallet_payee',
  stablecoinTicker: 'USDC',
  amount: '5000000',
  offlineAllowanceId: 'allow_1',
  nonce: 7,
  timestamp: 1696800000000,
  expiresAt: Date.now() + 3_600_000,
  signature: 'deadbeef',
};

describe('PaymentInstruction Zod schema', () => {
  it('parses a valid instruction', () => {
    const result = PaymentInstruction.safeParse(validInstruction);
    expect(result.success).toBe(true);
  });

  it('rejects wrong version', () => {
    const result = PaymentInstruction.safeParse({
      ...validInstruction,
      version: 2,
    });
    expect(result.success).toBe(false);
  });

  it('allows null offlineAllowanceId', () => {
    const result = PaymentInstruction.safeParse({
      ...validInstruction,
      offlineAllowanceId: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-integer nonce', () => {
    const result = PaymentInstruction.safeParse({
      ...validInstruction,
      nonce: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

describe('createPaymentInstructionPayload', () => {
  it('produces pipe-delimited UTF-8 bytes', () => {
    const payload = createPaymentInstructionPayload(validInstruction);
    const text = new TextDecoder().decode(payload);
    const parts = text.split('|');
    expect(parts[0]).toBe('1');
    expect(parts[1]).toBe(validInstruction.paymentId);
    expect(parts[4]).toBe('USDC');
    expect(parts[5]).toBe('5000000');
    expect(parts.length).toBe(10);
  });

  it('uses empty string for null offlineAllowanceId', () => {
    const payload = createPaymentInstructionPayload({
      ...validInstruction,
      offlineAllowanceId: null,
    });
    const text = new TextDecoder().decode(payload);
    const parts = text.split('|');
    expect(parts[6]).toBe('');
  });

  it('deterministically produces the same payload', () => {
    const a = createPaymentInstructionPayload(validInstruction);
    const b = createPaymentInstructionPayload(validInstruction);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('isInstructionExpired', () => {
  it('returns false for future expiry', () => {
    expect(isInstructionExpired(validInstruction)).toBe(false);
  });

  it('returns true for past expiry', () => {
    const expired = { ...validInstruction, expiresAt: Date.now() - 1000 };
    expect(isInstructionExpired(expired)).toBe(true);
  });
});

describe('validateInstructionFields', () => {
  it('returns null for valid instruction', () => {
    expect(validateInstructionFields(validInstruction)).toBeNull();
  });

  it('returns error for empty paymentId', () => {
    expect(
      validateInstructionFields({ ...validInstruction, paymentId: '' }),
    ).toBe('Missing payment ID');
  });

  it('returns error for zero amount', () => {
    expect(
      validateInstructionFields({ ...validInstruction, amount: '0' }),
    ).toBe('Invalid amount');
  });

  it('returns error for negative nonce', () => {
    expect(
      validateInstructionFields({ ...validInstruction, nonce: -1 }),
    ).toBe('Invalid nonce');
  });

  it('returns error for expired instruction', () => {
    expect(
      validateInstructionFields({
        ...validInstruction,
        expiresAt: Date.now() - 1000,
      }),
    ).toBe('Instruction expired');
  });
});
