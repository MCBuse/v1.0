import { Keypair } from '@solana/web3.js';
import { eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import {
  connectTestDatabase,
  type TestDatabase,
} from '../database/testing/test-database';
import * as schema from '../database/schema';
import { WalletKeyRegistry } from './wallet-key-registry';
import {
  rotateWalletEncryption,
  verifyWalletRecovery,
} from './rotate-wallet-keys';

const KEY_V1 = 'c'.repeat(64);
const KEY_V2 = 'd'.repeat(64);

const v1Only = new WalletKeyRegistry(
  (name) => ({ SOLANA_KEYPAIR_ENCRYPTION_KEY: KEY_V1 })[name],
);
const bothKeysV2Current = new WalletKeyRegistry(
  (name) =>
    ({
      SOLANA_KEYPAIR_ENCRYPTION_KEY: KEY_V1,
      SOLANA_KEYPAIR_ENCRYPTION_KEY_V2: KEY_V2,
      SOLANA_KEYPAIR_ENCRYPTION_KEY_CURRENT: 'v2',
    })[name],
);
const v2Only = new WalletKeyRegistry(
  (name) =>
    ({
      SOLANA_KEYPAIR_ENCRYPTION_KEY_V2: KEY_V2,
      SOLANA_KEYPAIR_ENCRYPTION_KEY_CURRENT: 'v2',
    })[name],
);

describe('wallet key rotation (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let userId: string;
  let walletIds: string[] = [];
  const addresses: Record<string, string> = {};

  beforeAll(async () => {
    const connection = await connectTestDatabase();
    db = connection.db;
    pool = connection.pool;

    const suffix = randomUUID().slice(0, 8);
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `rotate-${suffix}@mcbuse.test`,
        passwordHash: 'integration-test-not-a-real-hash',
        firstName: 'Rotate',
        lastName: 'Test',
        username: `rotate${suffix}`,
      })
      .returning({ id: schema.users.id });
    userId = user.id;

    // Two wallets sealed with v1, written the way the platform did before
    // versioning existed (no version prefix at all).
    const rows: (typeof schema.wallets.$inferInsert)[] = [];
    for (const type of ['savings', 'routine']) {
      const keypair = Keypair.generate();
      const sealed = v1Only.encrypt(keypair.secretKey).replace(/^v1:/, '');
      rows.push({
        userId,
        type,
        solanaPubkey: keypair.publicKey.toBase58(),
        encryptedKeypair: sealed,
        encryptionKeyVersion: 'v1',
      });
      addresses[type] = keypair.publicKey.toBase58();
    }
    const inserted = await db
      .insert(schema.wallets)
      .values(rows)
      .returning({ id: schema.wallets.id });
    walletIds = inserted.map((w) => w.id);
  });

  afterAll(async () => {
    await db
      .delete(schema.wallets)
      .where(inArray(schema.wallets.id, walletIds));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await pool.end();
  });

  async function ourWallets() {
    return db
      .select()
      .from(schema.wallets)
      .where(inArray(schema.wallets.id, walletIds));
  }

  it('reads pre-versioning records as v1', async () => {
    const wallets = await ourWallets();
    for (const wallet of wallets) {
      expect(v1Only.versionOf(wallet.encryptedKeypair)).toBe('v1');
      const derived = Keypair.fromSecretKey(
        v1Only.decrypt(wallet.encryptedKeypair),
      ).publicKey.toBase58();
      expect(derived).toBe(wallet.solanaPubkey);
    }
  });

  it('reports what a rotation would do without writing anything', async () => {
    const before = await ourWallets();
    const report = await rotateWalletEncryption(db, bothKeysV2Current, {
      apply: false,
      walletIds,
    });

    expect(report.rotated).toBe(2);
    expect(report.unreadable).toHaveLength(0);
    expect(report.mismatched).toHaveLength(0);

    const after = await ourWallets();
    expect(after.map((w) => w.encryptedKeypair).sort()).toEqual(
      before.map((w) => w.encryptedKeypair).sort(),
    );
  });

  it('rotates to v2 while preserving every wallet address', async () => {
    await rotateWalletEncryption(db, bothKeysV2Current, {
      apply: true,
      walletIds,
    });

    const wallets = await ourWallets();
    for (const wallet of wallets) {
      expect(wallet.encryptionKeyVersion).toBe('v2');
      expect(wallet.encryptedKeypair.startsWith('v2:')).toBe(true);
      expect(wallet.solanaPubkey).toBe(addresses[wallet.type]);

      const derived = Keypair.fromSecretKey(
        bothKeysV2Current.decrypt(wallet.encryptedKeypair),
      ).publicKey.toBase58();
      expect(derived).toBe(wallet.solanaPubkey);
    }
  });

  it('is idempotent — a second run rewrites nothing', async () => {
    const before = await ourWallets();
    const report = await rotateWalletEncryption(db, bothKeysV2Current, {
      apply: true,
      walletIds,
    });
    expect(report.rotated).toBe(0);

    const after = await ourWallets();
    expect(after.map((w) => w.encryptedKeypair).sort()).toEqual(
      before.map((w) => w.encryptedKeypair).sort(),
    );
  });

  it('passes the recovery check once the old key is gone', async () => {
    const result = await verifyWalletRecovery(db, v2Only, walletIds);
    expect(result.checked).toBe(2);
    expect(result.failures).toEqual([]);
  });

  it('reports rather than destroys a record it cannot read', async () => {
    const [wallet] = await ourWallets();
    const original = wallet.encryptedKeypair;
    await db
      .update(schema.wallets)
      .set({ encryptedKeypair: 'v2:00:00:00' })
      .where(eq(schema.wallets.id, wallet.id));

    const report = await rotateWalletEncryption(db, bothKeysV2Current, {
      apply: true,
      walletIds,
    });
    expect(report.unreadable.map((u) => u.walletId)).toContain(wallet.id);

    const [after] = await db
      .select()
      .from(schema.wallets)
      .where(eq(schema.wallets.id, wallet.id));
    expect(after.encryptedKeypair).toBe('v2:00:00:00');

    await db
      .update(schema.wallets)
      .set({ encryptedKeypair: original })
      .where(eq(schema.wallets.id, wallet.id));
  });

  it('fails the recovery check when a key version is retired too early', async () => {
    // Simulate a restored backup row still sealed with v1.
    const [wallet] = await ourWallets();
    const original = wallet.encryptedKeypair;
    const secret = bothKeysV2Current.decrypt(original);
    const v1Sealed = v1Only.encrypt(secret);
    await db
      .update(schema.wallets)
      .set({ encryptedKeypair: v1Sealed, encryptionKeyVersion: 'v1' })
      .where(eq(schema.wallets.id, wallet.id));

    const withoutV1 = await verifyWalletRecovery(db, v2Only, walletIds);
    expect(withoutV1.failures.some((f) => f.walletId === wallet.id)).toBe(true);

    // Retaining v1 is what makes that restored row readable again.
    const withV1 = await verifyWalletRecovery(db, bothKeysV2Current, walletIds);
    expect(withV1.failures.some((f) => f.walletId === wallet.id)).toBe(false);

    await db
      .update(schema.wallets)
      .set({ encryptedKeypair: original, encryptionKeyVersion: 'v2' })
      .where(eq(schema.wallets.id, wallet.id));
  });
});
