import { ConflictException } from '@nestjs/common';
import {
  assertIdempotentReuse,
  operationFingerprint,
} from './operation-fingerprint';

describe('operation fingerprint', () => {
  it('is stable across key order', () => {
    const a = operationFingerprint({ amountMinor: 2500n, currency: 'USD' });
    const b = operationFingerprint({ currency: 'USD', amountMinor: 2500n });
    expect(a).toBe(b);
  });

  it('changes when the amount changes', () => {
    expect(operationFingerprint({ amountMinor: 2500n })).not.toBe(
      operationFingerprint({ amountMinor: 2501n }),
    );
  });

  it('changes when the destination changes', () => {
    expect(operationFingerprint({ destination: 'ba_1' })).not.toBe(
      operationFingerprint({ destination: 'ba_2' }),
    );
  });

  it('does not confuse a numeric string with a number', () => {
    expect(operationFingerprint({ amount: 25 })).not.toBe(
      operationFingerprint({ amount: '25' }),
    );
  });

  it('does not confuse a bigint with an equal number', () => {
    expect(operationFingerprint({ amount: 25n })).not.toBe(
      operationFingerprint({ amount: 25 }),
    );
  });

  it('treats an absent field and an explicitly undefined field alike', () => {
    expect(operationFingerprint({ amountMinor: 1n, note: undefined })).toBe(
      operationFingerprint({ amountMinor: 1n }),
    );
  });

  it('distinguishes null from absent', () => {
    expect(operationFingerprint({ amountMinor: 1n, note: null })).not.toBe(
      operationFingerprint({ amountMinor: 1n }),
    );
  });

  it('canonicalizes nested objects', () => {
    expect(
      operationFingerprint({ meta: { b: 2, a: 1 }, amountMinor: 1n }),
    ).toBe(operationFingerprint({ amountMinor: 1n, meta: { a: 1, b: 2 } }));
  });

  it('keeps array order significant', () => {
    expect(operationFingerprint({ lines: [1, 2] })).not.toBe(
      operationFingerprint({ lines: [2, 1] }),
    );
  });

  it('produces a 64-character hex digest', () => {
    expect(operationFingerprint({ amountMinor: 1n })).toMatch(/^[0-9a-f]{64}$/);
  });

  describe('assertIdempotentReuse', () => {
    it('accepts a replay with identical input', () => {
      const fingerprint = operationFingerprint({ amountMinor: 2500n });
      expect(() =>
        assertIdempotentReuse(fingerprint, fingerprint, 'withdrawal'),
      ).not.toThrow();
    });

    it('rejects the same key used with different input', () => {
      expect(() =>
        assertIdempotentReuse(
          operationFingerprint({ amountMinor: 2500n }),
          operationFingerprint({ amountMinor: 9900n }),
          'withdrawal',
        ),
      ).toThrow(ConflictException);
    });

    it('names the operation in the conflict so the caller can act on it', () => {
      expect(() =>
        assertIdempotentReuse('a'.repeat(64), 'b'.repeat(64), 'withdrawal'),
      ).toThrow(/withdrawal/);
    });

    it('rejects a stored record that has no fingerprint to compare', () => {
      expect(() =>
        assertIdempotentReuse(null, 'b'.repeat(64), 'withdrawal'),
      ).toThrow(ConflictException);
    });
  });
});
