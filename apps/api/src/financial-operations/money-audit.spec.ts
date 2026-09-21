import {
  AuditSecretLeakError,
  assertNoSecretFields,
  buildAuthorizationRecord,
  buildSigningRecord,
} from './money-audit';

describe('money audit records', () => {
  describe('authorization', () => {
    it('records a granted decision against the subject it authorised', () => {
      const record = buildAuthorizationRecord({
        userId: 'user-1',
        operationKind: 'internal_transfer',
        decision: 'granted',
        subjectType: 'wallet',
        subjectId: 'wallet-1',
        operationId: 'op-1',
        amountBaseUnits: 2_500_000n,
        currency: 'USDC',
      });

      expect(record).toEqual({
        userId: 'user-1',
        action: 'money.authorization.granted',
        entityType: 'wallet',
        entityId: 'wallet-1',
        metadata: {
          operationKind: 'internal_transfer',
          decision: 'granted',
          operationId: 'op-1',
          amountBaseUnits: '2500000',
          currency: 'USDC',
        },
      });
    });

    it('records a refusal with its reason code', () => {
      const record = buildAuthorizationRecord({
        userId: 'user-1',
        operationKind: 'withdrawal_bank',
        decision: 'refused',
        subjectType: 'payout_destination',
        subjectId: 'ba_123',
        reason: 'destination_ineligible',
        amountBaseUnits: 500_000n,
        currency: 'USDC',
      });

      expect(record.action).toBe('money.authorization.refused');
      expect(record.metadata.reason).toBe('destination_ineligible');
    });

    it('writes the amount as a string so no precision is lost', () => {
      const record = buildAuthorizationRecord({
        userId: 'user-1',
        operationKind: 'internal_transfer',
        decision: 'granted',
        subjectType: 'wallet',
        subjectId: 'wallet-1',
        amountBaseUnits: 9_007_199_254_740_993n,
        currency: 'USDC',
      });

      expect(record.metadata.amountBaseUnits).toBe('9007199254740993');
    });

    it('drops absent optional fields rather than storing nulls', () => {
      const record = buildAuthorizationRecord({
        userId: 'user-1',
        operationKind: 'internal_transfer',
        decision: 'granted',
        subjectType: 'wallet',
        subjectId: null,
      });

      expect(Object.keys(record.metadata).sort()).toEqual([
        'decision',
        'operationKind',
      ]);
    });
  });

  describe('signing', () => {
    it('records the public address, key version and chain signature', () => {
      const record = buildSigningRecord({
        userId: 'user-1',
        operationId: 'op-1',
        operationKind: 'internal_transfer',
        walletId: 'wallet-1',
        walletAddress: '82ihqmVixpNYoqJDrGPSexJ6kV2JP8Mis38pAnzzXqV4',
        keyVersion: 'v1',
        chainSignature: '5Aex8rYv',
        amountBaseUnits: 250_000n,
        currency: 'USDC',
        feePayerAddress: 'treasuryAddress',
      });

      expect(record.action).toBe('money.signature.created');
      expect(record.entityType).toBe('financial_operation');
      expect(record.entityId).toBe('op-1');
      expect(record.metadata).toMatchObject({
        walletAddress: '82ihqmVixpNYoqJDrGPSexJ6kV2JP8Mis38pAnzzXqV4',
        keyVersion: 'v1',
        chainSignature: '5Aex8rYv',
        feePayerAddress: 'treasuryAddress',
      });
    });

    it('names the key version without carrying the key itself', () => {
      const record = buildSigningRecord({
        userId: 'user-1',
        operationId: 'op-1',
        operationKind: 'internal_transfer',
        walletId: 'wallet-1',
        walletAddress: 'address',
        keyVersion: 'v2',
        chainSignature: null,
        amountBaseUnits: 1n,
        currency: 'USDC',
        feePayerAddress: null,
      });

      const serialized = JSON.stringify(record);
      expect(serialized).not.toMatch(/keypair/i);
      expect(serialized).not.toMatch(/secret/i);
      expect(record.metadata.keyVersion).toBe('v2');
    });
  });

  describe('the secret guard', () => {
    it.each([
      'encryptedKeypair',
      'keypair',
      'secretKey',
      'privateKey',
      'password',
      'passwordHash',
      'mnemonic',
      'seedPhrase',
      'accessToken',
      'refreshToken',
      'apiKey',
      'authorization',
    ])('refuses a record carrying %s', (field) => {
      expect(() => assertNoSecretFields({ [field]: 'anything' })).toThrow(
        AuditSecretLeakError,
      );
    });

    it('sees through snake_case and kebab-case spellings', () => {
      expect(() => assertNoSecretFields({ encrypted_keypair: 'x' })).toThrow(
        AuditSecretLeakError,
      );
      expect(() => assertNoSecretFields({ 'secret-key': 'x' })).toThrow(
        AuditSecretLeakError,
      );
    });

    it('finds a secret nested inside objects and arrays', () => {
      expect(() =>
        assertNoSecretFields({ wallets: [{ meta: { secretKey: 'x' } }] }),
      ).toThrow(AuditSecretLeakError);
    });

    it('names the path it objected to', () => {
      expect(() =>
        assertNoSecretFields({ outer: { inner: { privateKey: 'x' } } }),
      ).toThrow(/outer\.inner\.privateKey/);
    });

    it('allows the public fields the trail is made of', () => {
      expect(() =>
        assertNoSecretFields({
          walletAddress: '82ihqm',
          chainSignature: '5Aex8rYv',
          keyVersion: 'v1',
          amountBaseUnits: '250000',
        }),
      ).not.toThrow();
    });

    it('cannot be bypassed by passing extra fields: the record shape is closed', () => {
      const record = buildSigningRecord({
        userId: 'user-1',
        operationId: 'op-1',
        operationKind: 'internal_transfer',
        walletId: 'wallet-1',
        walletAddress: 'address',
        keyVersion: 'v1',
        chainSignature: null,
        amountBaseUnits: 1n,
        currency: 'USDC',
        feePayerAddress: null,
        // A caller spreading a whole wallet row in would land here. The builder
        // reads only the fields it names, so the sealed key is never copied.
        ...({ encryptedKeypair: 'v1:aa:bb:cc' } as object),
      } as Parameters<typeof buildSigningRecord>[0]);

      expect(record.metadata).not.toHaveProperty('encryptedKeypair');
      expect(JSON.stringify(record)).not.toContain('v1:aa:bb:cc');
    });

    it('still catches a secret handed to the guard directly', () => {
      // The guard is the second line of defence, for any future caller that
      // builds metadata itself rather than going through the two builders.
      expect(() =>
        assertNoSecretFields({ encryptedKeypair: 'v1:aa:bb:cc' }),
      ).toThrow(AuditSecretLeakError);
    });
  });
});
