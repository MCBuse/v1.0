import { WalletKeyRegistry } from './wallet-key-registry';

const KEY_V1 = 'a'.repeat(64);
const KEY_V2 = 'b'.repeat(64);

function registry(env: Record<string, string | undefined>) {
  return new WalletKeyRegistry((name) => env[name]);
}

describe('WalletKeyRegistry', () => {
  describe('configuration', () => {
    it('accepts a single legacy key and treats it as v1', () => {
      const keys = registry({ SOLANA_KEYPAIR_ENCRYPTION_KEY: KEY_V1 });
      expect(keys.currentVersion).toBe('v1');
      expect(keys.versions()).toEqual(['v1']);
    });

    it('accepts several versions and an explicit current version', () => {
      const keys = registry({
        SOLANA_KEYPAIR_ENCRYPTION_KEY: KEY_V1,
        SOLANA_KEYPAIR_ENCRYPTION_KEY_V2: KEY_V2,
        SOLANA_KEYPAIR_ENCRYPTION_KEY_CURRENT: 'v2',
      });
      expect(keys.currentVersion).toBe('v2');
      expect(keys.versions().sort()).toEqual(['v1', 'v2']);
    });

    it('refuses a key that is not 32 bytes of hex', () => {
      expect(() =>
        registry({ SOLANA_KEYPAIR_ENCRYPTION_KEY: 'too-short' }),
      ).toThrow(/64 hex characters/);
    });

    it('refuses a current version that has no key', () => {
      expect(() =>
        registry({
          SOLANA_KEYPAIR_ENCRYPTION_KEY: KEY_V1,
          SOLANA_KEYPAIR_ENCRYPTION_KEY_CURRENT: 'v9',
        }),
      ).toThrow(/v9/);
    });

    it('refuses to start with no key at all', () => {
      expect(() => registry({})).toThrow(/SOLANA_KEYPAIR_ENCRYPTION_KEY/);
    });

    it('refuses two versions sharing the same key material', () => {
      expect(() =>
        registry({
          SOLANA_KEYPAIR_ENCRYPTION_KEY: KEY_V1,
          SOLANA_KEYPAIR_ENCRYPTION_KEY_V2: KEY_V1,
          SOLANA_KEYPAIR_ENCRYPTION_KEY_CURRENT: 'v2',
        }),
      ).toThrow(/distinct/);
    });
  });

  describe('checksums', () => {
    it('reports a checksum that is not the key', () => {
      const keys = registry({ SOLANA_KEYPAIR_ENCRYPTION_KEY: KEY_V1 });
      const checksum = keys.checksum('v1');
      expect(checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(checksum).not.toBe(KEY_V1);
    });

    it('gives different versions different checksums', () => {
      const keys = registry({
        SOLANA_KEYPAIR_ENCRYPTION_KEY: KEY_V1,
        SOLANA_KEYPAIR_ENCRYPTION_KEY_V2: KEY_V2,
      });
      expect(keys.checksum('v1')).not.toBe(keys.checksum('v2'));
    });
  });

  describe('encrypt and decrypt', () => {
    const secret = Uint8Array.from({ length: 64 }, (_, i) => i);

    it('round-trips a secret under the current version', () => {
      const keys = registry({ SOLANA_KEYPAIR_ENCRYPTION_KEY: KEY_V1 });
      const sealed = keys.encrypt(secret);
      expect(keys.decrypt(sealed)).toEqual(Buffer.from(secret));
    });

    it('tags new ciphertext with its key version', () => {
      const keys = registry({
        SOLANA_KEYPAIR_ENCRYPTION_KEY: KEY_V1,
        SOLANA_KEYPAIR_ENCRYPTION_KEY_V2: KEY_V2,
        SOLANA_KEYPAIR_ENCRYPTION_KEY_CURRENT: 'v2',
      });
      expect(keys.encrypt(secret).startsWith('v2:')).toBe(true);
    });

    it('still reads untagged ciphertext written before versioning', () => {
      const legacy = registry({ SOLANA_KEYPAIR_ENCRYPTION_KEY: KEY_V1 });
      const sealed = legacy.encrypt(secret);
      const untagged = sealed.replace(/^v1:/, '');
      expect(untagged.split(':')).toHaveLength(3);
      expect(legacy.decrypt(untagged)).toEqual(Buffer.from(secret));
    });

    it('reads a v1 record after v2 becomes current', () => {
      const before = registry({ SOLANA_KEYPAIR_ENCRYPTION_KEY: KEY_V1 });
      const sealed = before.encrypt(secret);
      const after = registry({
        SOLANA_KEYPAIR_ENCRYPTION_KEY: KEY_V1,
        SOLANA_KEYPAIR_ENCRYPTION_KEY_V2: KEY_V2,
        SOLANA_KEYPAIR_ENCRYPTION_KEY_CURRENT: 'v2',
      });
      expect(after.decrypt(sealed)).toEqual(Buffer.from(secret));
    });

    it('fails when the key for that version has been removed', () => {
      const before = registry({ SOLANA_KEYPAIR_ENCRYPTION_KEY: KEY_V1 });
      const sealed = before.encrypt(secret);
      const without = registry({
        SOLANA_KEYPAIR_ENCRYPTION_KEY_V2: KEY_V2,
        SOLANA_KEYPAIR_ENCRYPTION_KEY_CURRENT: 'v2',
      });
      expect(() => without.decrypt(sealed)).toThrow(/v1/);
    });

    it('rejects ciphertext whose key does not match', () => {
      const a = registry({ SOLANA_KEYPAIR_ENCRYPTION_KEY: KEY_V1 });
      const b = registry({ SOLANA_KEYPAIR_ENCRYPTION_KEY: KEY_V2 });
      const sealed = a.encrypt(secret).replace(/^v1:/, '');
      expect(() => b.decrypt(sealed)).toThrow();
    });

    it('rejects tampered ciphertext rather than returning wrong bytes', () => {
      const keys = registry({ SOLANA_KEYPAIR_ENCRYPTION_KEY: KEY_V1 });
      const sealed = keys.encrypt(secret);
      const parts = sealed.split(':');
      parts[3] = parts[3].replace(/^../, '00');
      expect(() => keys.decrypt(parts.join(':'))).toThrow();
    });

    it('rejects a malformed payload', () => {
      const keys = registry({ SOLANA_KEYPAIR_ENCRYPTION_KEY: KEY_V1 });
      expect(() => keys.decrypt('nonsense')).toThrow(/format/);
    });

    it('never puts key material in an error message', () => {
      const keys = registry({ SOLANA_KEYPAIR_ENCRYPTION_KEY: KEY_V1 });
      try {
        keys.decrypt('v7:00:00:00');
        fail('expected a throw');
      } catch (error) {
        expect((error as Error).message).not.toContain(KEY_V1);
      }
    });

    it('produces different ciphertext each time for the same secret', () => {
      const keys = registry({ SOLANA_KEYPAIR_ENCRYPTION_KEY: KEY_V1 });
      expect(keys.encrypt(secret)).not.toBe(keys.encrypt(secret));
    });
  });

  describe('reEncrypt', () => {
    const secret = Uint8Array.from({ length: 64 }, (_, i) => 255 - i);

    it('moves a record to the current version without changing the secret', () => {
      const keys = registry({
        SOLANA_KEYPAIR_ENCRYPTION_KEY: KEY_V1,
        SOLANA_KEYPAIR_ENCRYPTION_KEY_V2: KEY_V2,
        SOLANA_KEYPAIR_ENCRYPTION_KEY_CURRENT: 'v2',
      });
      const v1Only = registry({ SOLANA_KEYPAIR_ENCRYPTION_KEY: KEY_V1 });
      const sealedV1 = v1Only.encrypt(secret);

      const moved = keys.reEncrypt(sealedV1);

      expect(moved.version).toBe('v2');
      expect(moved.payload.startsWith('v2:')).toBe(true);
      expect(keys.decrypt(moved.payload)).toEqual(Buffer.from(secret));
    });

    it('is a no-op when the record is already current', () => {
      const keys = registry({ SOLANA_KEYPAIR_ENCRYPTION_KEY: KEY_V1 });
      const sealed = keys.encrypt(secret);
      const moved = keys.reEncrypt(sealed);
      expect(moved.changed).toBe(false);
      expect(moved.payload).toBe(sealed);
    });

    it('reports the version a record currently uses', () => {
      const keys = registry({ SOLANA_KEYPAIR_ENCRYPTION_KEY: KEY_V1 });
      expect(keys.versionOf(keys.encrypt(secret))).toBe('v1');
      expect(keys.versionOf('aa:bb:cc')).toBe('v1');
    });
  });
});
