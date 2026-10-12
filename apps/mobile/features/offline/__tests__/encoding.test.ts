import {
  encodeInstructionCompact,
  decodeInstructionCompact,
  splitForSms,
  reassembleFromSms,
} from '@/lib/crypto/encoding';
import type { PaymentInstruction } from '../models';

const SAMPLE_INSTRUCTION: PaymentInstruction = {
  version: 1,
  paymentId: 'pay_abc123',
  payerWalletId: 'wallet_payer_001',
  payeeId: 'wallet_payee_002',
  stablecoinTicker: 'USDC',
  amount: '1000000',
  offlineAllowanceId: 'allow_xyz',
  nonce: 42,
  timestamp: 1696800000000,
  expiresAt: 1696803600000,
  signature: 'abcdef1234567890',
};

describe('encodeInstructionCompact / decodeInstructionCompact', () => {
  it('round-trips a payment instruction', () => {
    const encoded = encodeInstructionCompact(SAMPLE_INSTRUCTION);
    expect(encoded.startsWith('MCBP:')).toBe(true);

    const decoded = decodeInstructionCompact(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.version).toBe(1);
    expect(decoded!.paymentId).toBe(SAMPLE_INSTRUCTION.paymentId);
    expect(decoded!.payerWalletId).toBe(SAMPLE_INSTRUCTION.payerWalletId);
    expect(decoded!.payeeId).toBe(SAMPLE_INSTRUCTION.payeeId);
    expect(decoded!.stablecoinTicker).toBe(SAMPLE_INSTRUCTION.stablecoinTicker);
    expect(decoded!.amount).toBe(SAMPLE_INSTRUCTION.amount);
    expect(decoded!.offlineAllowanceId).toBe(SAMPLE_INSTRUCTION.offlineAllowanceId);
    expect(decoded!.nonce).toBe(SAMPLE_INSTRUCTION.nonce);
    expect(decoded!.timestamp).toBe(SAMPLE_INSTRUCTION.timestamp);
    expect(decoded!.expiresAt).toBe(SAMPLE_INSTRUCTION.expiresAt);
    expect(decoded!.signature).toBe(SAMPLE_INSTRUCTION.signature);
  });

  it('handles null offlineAllowanceId', () => {
    const instruction = { ...SAMPLE_INSTRUCTION, offlineAllowanceId: null };
    const encoded = encodeInstructionCompact(instruction);
    const decoded = decodeInstructionCompact(encoded);
    expect(decoded!.offlineAllowanceId).toBeNull();
  });

  it('returns null for invalid prefix', () => {
    expect(decodeInstructionCompact('INVALID:data')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(decodeInstructionCompact('')).toBeNull();
  });
});

describe('splitForSms / reassembleFromSms', () => {
  it('does not split short messages', () => {
    const short = 'MCBP:abc';
    const parts = splitForSms(short);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toBe(short);
  });

  it('splits long messages and reassembles correctly', () => {
    const long = 'MCBP:' + 'a'.repeat(300);
    const parts = splitForSms(long);
    expect(parts.length).toBeGreaterThan(1);

    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(160);
    }

    const reassembled = reassembleFromSms(parts);
    expect(reassembled).toBe(long);
  });

  it('reassembles out-of-order parts', () => {
    const long = 'MCBP:' + 'b'.repeat(300);
    const parts = splitForSms(long);
    const shuffled = [...parts].reverse();
    const reassembled = reassembleFromSms(shuffled);
    expect(reassembled).toBe(long);
  });

  it('returns null if parts are missing', () => {
    const long = 'MCBP:' + 'c'.repeat(300);
    const parts = splitForSms(long);
    const incomplete = parts.slice(0, -1);
    const reassembled = reassembleFromSms(incomplete);
    expect(reassembled).toBeNull();
  });

  it('full round-trip: encode → split → reassemble → decode', () => {
    const encoded = encodeInstructionCompact(SAMPLE_INSTRUCTION);
    const parts = splitForSms(encoded);
    const reassembled = reassembleFromSms(parts);
    expect(reassembled).not.toBeNull();
    const decoded = decodeInstructionCompact(reassembled!);
    expect(decoded).not.toBeNull();
    expect(decoded!.paymentId).toBe(SAMPLE_INSTRUCTION.paymentId);
    expect(decoded!.amount).toBe(SAMPLE_INSTRUCTION.amount);
  });
});
