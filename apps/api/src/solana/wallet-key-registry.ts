import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const LEGACY_VERSION = 'v1';
const VERSION_PATTERN = /^v[0-9]+$/;

export type EnvReader = (name: string) => string | undefined;

/**
 * Holds every wallet-encryption key version the deployment knows about.
 *
 * Records written before versioning carry no prefix and are read with the v1
 * key. New records are written with the current version and carry it in the
 * payload, so a key rotation never has to guess which key sealed a row.
 *
 * Old versions stay loaded until every record has moved and recovery has been
 * checked — removing a key before that point makes those wallets unreadable.
 */
export class WalletKeyRegistry {
  private readonly keys = new Map<string, Buffer>();
  readonly currentVersion: string;

  constructor(env: EnvReader) {
    const legacy = env('SOLANA_KEYPAIR_ENCRYPTION_KEY');
    if (legacy)
      this.keys.set(LEGACY_VERSION, this.parseKey(legacy, LEGACY_VERSION));

    // Additional versions arrive as SOLANA_KEYPAIR_ENCRYPTION_KEY_V2, _V3, ...
    for (let version = 2; version <= 32; version += 1) {
      const raw = env(`SOLANA_KEYPAIR_ENCRYPTION_KEY_V${version}`);
      if (raw) this.keys.set(`v${version}`, this.parseKey(raw, `v${version}`));
    }

    if (this.keys.size === 0) {
      throw new Error(
        'SOLANA_KEYPAIR_ENCRYPTION_KEY must be set (64 hex characters, 32 bytes). ' +
          "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
      );
    }

    this.assertDistinctKeys();

    const requested = env('SOLANA_KEYPAIR_ENCRYPTION_KEY_CURRENT');
    if (requested) {
      if (!this.keys.has(requested)) {
        throw new Error(
          `SOLANA_KEYPAIR_ENCRYPTION_KEY_CURRENT is "${requested}" but no key is configured for that version`,
        );
      }
      this.currentVersion = requested;
    } else {
      this.currentVersion = this.highestVersion();
    }
  }

  versions(): string[] {
    return [...this.keys.keys()];
  }

  /** SHA-256 of the key bytes — safe to store and compare, never the key itself. */
  checksum(version: string): string {
    return createHash('sha256').update(this.keyFor(version)).digest('hex');
  }

  /** The version a stored payload was sealed with. Untagged means v1. */
  versionOf(payload: string): string {
    const head = payload.split(':', 1)[0];
    return VERSION_PATTERN.test(head) ? head : LEGACY_VERSION;
  }

  encrypt(secretKey: Uint8Array): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(
      ALGORITHM,
      this.keyFor(this.currentVersion),
      iv,
    );
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(secretKey)),
      cipher.final(),
    ]);
    return [
      this.currentVersion,
      iv.toString('hex'),
      cipher.getAuthTag().toString('hex'),
      ciphertext.toString('hex'),
    ].join(':');
  }

  decrypt(payload: string): Buffer {
    const parts = payload.split(':');
    const [version, ivHex, authTagHex, ciphertextHex] =
      parts.length === 4 ? parts : [LEGACY_VERSION, ...parts];

    if (parts.length !== 3 && parts.length !== 4) {
      throw new Error('Invalid encrypted keypair format');
    }
    if (!VERSION_PATTERN.test(version)) {
      throw new Error('Invalid encrypted keypair format');
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      this.keyFor(version),
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, 'hex')),
      decipher.final(),
    ]);
  }

  /**
   * Reads a record with whichever version sealed it and rewrites it under the
   * current version. The secret is unchanged, so the derived public key is too.
   */
  reEncrypt(payload: string): {
    payload: string;
    version: string;
    changed: boolean;
  } {
    const from = this.versionOf(payload);
    const isTagged = payload.split(':').length === 4;
    if (from === this.currentVersion && isTagged) {
      return { payload, version: from, changed: false };
    }
    const secret = this.decrypt(payload);
    return {
      payload: this.encrypt(secret),
      version: this.currentVersion,
      changed: true,
    };
  }

  private keyFor(version: string): Buffer {
    const key = this.keys.get(version);
    if (!key) {
      throw new Error(
        `No wallet encryption key is configured for version "${version}"; ` +
          'retire a key version only after every record has been re-encrypted',
      );
    }
    return key;
  }

  private parseKey(raw: string, version: string): Buffer {
    if (raw.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(raw)) {
      throw new Error(
        `Wallet encryption key for ${version} must be exactly 64 hex characters (32 bytes)`,
      );
    }
    return Buffer.from(raw, 'hex');
  }

  private assertDistinctKeys() {
    const seen = new Map<string, string>();
    for (const version of this.keys.keys()) {
      const checksum = this.checksum(version);
      const other = seen.get(checksum);
      if (other) {
        throw new Error(
          `Wallet encryption key versions ${other} and ${version} must be distinct`,
        );
      }
      seen.set(checksum, version);
    }
  }

  private highestVersion(): string {
    return [...this.keys.keys()].sort(
      (a, b) => Number(a.slice(1)) - Number(b.slice(1)),
    )[this.keys.size - 1];
  }
}
