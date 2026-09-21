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

const KEY_V1 = 'a'.repeat(64);
const KEY_V2 = 'b'.repeat(64);
const KEY_WRONG_V2 = 'f'.repeat(64);

/** The environment as it was when the backup was taken. */
const atBackupTime = new WalletKeyRegistry(
  (name) => ({ SOLANA_KEYPAIR_ENCRYPTION_KEY: KEY_V1 })[name],
);

/** The environment today: rotated to v2, v1 retained for recovery. */
const today = new WalletKeyRegistry(
  (name) =>
    ({
      SOLANA_KEYPAIR_ENCRYPTION_KEY: KEY_V1,
      SOLANA_KEYPAIR_ENCRYPTION_KEY_V2: KEY_V2,
      SOLANA_KEYPAIR_ENCRYPTION_KEY_CURRENT: 'v2',
    })[name],
);

/** The environment after v1 has been retired. */
const afterRetirement = new WalletKeyRegistry(
  (name) =>
    ({
      SOLANA_KEYPAIR_ENCRYPTION_KEY_V2: KEY_V2,
      SOLANA_KEYPAIR_ENCRYPTION_KEY_CURRENT: 'v2',
    })[name],
);

/** A restore into an environment holding the wrong v2 secret. */
const withTheWrongKey = new WalletKeyRegistry(
  (name) =>
    ({
      SOLANA_KEYPAIR_ENCRYPTION_KEY_V2: KEY_WRONG_V2,
      SOLANA_KEYPAIR_ENCRYPTION_KEY_CURRENT: 'v2',
    })[name],
);

/**
 * X.11 — restoring a backup taken before a key rotation.
 *
 * This is the scenario the key-version columns exist for, and the one that is
 * only ever tested after it has already gone wrong. Each case restores rows
 * exactly as a `pg_restore` would leave them — sealed with whatever key was
 * current when the dump was taken — into an environment that has moved on.
 */
describe('backup restoration across key versions (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let userId: string;
  const createdWalletIds: string[] = [];

  beforeAll(async () => {
    const connection = await connectTestDatabase();
    db = connection.db;
    pool = connection.pool;

    const suffix = randomUUID().slice(0, 8);
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `restore-${suffix}@mcbuse.test`,
        passwordHash: 'integration-test-not-a-real-hash',
        firstName: 'Restore',
        lastName: 'Backup',
        username: `restore${suffix}`,
      })
      .returning({ id: schema.users.id });
    userId = user.id;
  });

  afterAll(async () => {
    if (createdWalletIds.length) {
      await db
        .delete(schema.wallets)
        .where(inArray(schema.wallets.id, createdWalletIds));
    }
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await pool.end();
  });

  /**
   * Writes wallet rows exactly as a restored dump would: sealed with the key
   * that was current when the backup was taken, carrying that version label.
   */
  async function restoreBackup(
    registry: WalletKeyRegistry,
    count = 2,
    versionLabel?: string,
  ): Promise<{ ids: string[]; addresses: Record<string, string> }> {
    const values: (typeof schema.wallets.$inferInsert)[] = [];
    const addresses: Record<string, string> = {};
    for (let i = 0; i < count; i += 1) {
      const keypair = Keypair.generate();
      const address = keypair.publicKey.toBase58();
      addresses[address] = address;
      values.push({
        userId,
        type: i === 0 ? 'savings' : 'routine',
        solanaPubkey: address,
        encryptedKeypair: registry.encrypt(keypair.secretKey),
        encryptionKeyVersion: versionLabel ?? registry.currentVersion,
      });
    }
    const inserted = await db
      .insert(schema.wallets)
      .values(values)
      .returning({ id: schema.wallets.id });
    const ids = inserted.map((w) => w.id);
    createdWalletIds.push(...ids);
    return { ids, addresses };
  }

  it('a backup sealed at v1 still opens after the platform moved to v2', async () => {
    const { ids } = await restoreBackup(atBackupTime);

    const result = await verifyWalletRecovery(db, today, ids);

    expect(result.checked).toBe(ids.length);
    expect(result.failures).toEqual([]);
  });

  it('every restored address is preserved by a rotation to the current key', async () => {
    const { ids } = await restoreBackup(atBackupTime);
    const before = await db
      .select({
        id: schema.wallets.id,
        solanaPubkey: schema.wallets.solanaPubkey,
      })
      .from(schema.wallets)
      .where(inArray(schema.wallets.id, ids));

    const report = await rotateWalletEncryption(db, today, {
      apply: true,
      walletIds: ids,
    });

    const after = await db
      .select({
        id: schema.wallets.id,
        solanaPubkey: schema.wallets.solanaPubkey,
        encryptionKeyVersion: schema.wallets.encryptionKeyVersion,
      })
      .from(schema.wallets)
      .where(inArray(schema.wallets.id, ids));

    expect(report.mismatched).toEqual([]);
    expect(report.unreadable).toEqual([]);
    expect(report.rekeyed).toBe(ids.length);
    for (const row of after) {
      expect(row.solanaPubkey).toBe(
        before.find((b) => b.id === row.id)!.solanaPubkey,
      );
      expect(row.encryptionKeyVersion).toBe('v2');
    }
  });

  it('the restored wallets pass recovery once v1 is gone, but only after rotating', async () => {
    const { ids } = await restoreBackup(atBackupTime);

    const beforeRotation = await verifyWalletRecovery(
      db,
      afterRetirement,
      ids,
    );
    expect(beforeRotation.failures).toHaveLength(ids.length);

    await rotateWalletEncryption(db, today, { apply: true, walletIds: ids });

    const afterRotation = await verifyWalletRecovery(db, afterRetirement, ids);
    expect(afterRotation.failures).toEqual([]);
  });

  it('reports every unreadable restored row by id rather than failing silently', async () => {
    const { ids } = await restoreBackup(atBackupTime);

    const result = await verifyWalletRecovery(db, afterRetirement, ids);

    expect(result.checked).toBe(ids.length);
    expect(result.failures.map((f) => f.walletId).sort()).toEqual(
      [...ids].sort(),
    );
    for (const failure of result.failures) {
      expect(failure.reason).toBeTruthy();
    }
  });

  it('refuses to rotate a row it cannot read, leaving it exactly as restored', async () => {
    const { ids } = await restoreBackup(atBackupTime);
    const [before] = await db
      .select({ encryptedKeypair: schema.wallets.encryptedKeypair })
      .from(schema.wallets)
      .where(eq(schema.wallets.id, ids[0]));

    const report = await rotateWalletEncryption(db, afterRetirement, {
      apply: true,
      walletIds: ids,
    });

    const [after] = await db
      .select({ encryptedKeypair: schema.wallets.encryptedKeypair })
      .from(schema.wallets)
      .where(eq(schema.wallets.id, ids[0]));

    expect(report.unreadable).toHaveLength(ids.length);
    expect(report.rotated).toBe(0);
    expect(after.encryptedKeypair).toBe(before.encryptedKeypair);
  });

  it('a restore into an environment holding the wrong key is reported, not mis-read', async () => {
    // Sealed with the real v2 key; the environment has a different v2 secret.
    const { ids } = await restoreBackup(today, 2, 'v2');

    const result = await verifyWalletRecovery(db, withTheWrongKey, ids);

    expect(result.failures).toHaveLength(ids.length);
    // Crucially it fails rather than deriving some other address and
    // overwriting the wallet with it.
    const rows = await db
      .select({ solanaPubkey: schema.wallets.solanaPubkey })
      .from(schema.wallets)
      .where(inArray(schema.wallets.id, ids));
    expect(rows).toHaveLength(ids.length);
  });

  it('handles a partial restore where the dump straddles a rotation', async () => {
    const old = await restoreBackup(atBackupTime, 1);
    const current = await restoreBackup(today, 1, 'v2');
    const ids = [...old.ids, ...current.ids];

    const result = await verifyWalletRecovery(db, today, ids);
    expect(result.failures).toEqual([]);

    const report = await rotateWalletEncryption(db, today, {
      apply: true,
      walletIds: ids,
    });
    expect(report.rekeyed).toBe(1);
    expect(report.unreadable).toEqual([]);
  });

  it('a dry run on a restored backup writes nothing', async () => {
    const { ids } = await restoreBackup(atBackupTime);
    const before = await db
      .select({
        id: schema.wallets.id,
        encryptedKeypair: schema.wallets.encryptedKeypair,
      })
      .from(schema.wallets)
      .where(inArray(schema.wallets.id, ids));

    const report = await rotateWalletEncryption(db, today, {
      apply: false,
      walletIds: ids,
    });

    const after = await db
      .select({
        id: schema.wallets.id,
        encryptedKeypair: schema.wallets.encryptedKeypair,
      })
      .from(schema.wallets)
      .where(inArray(schema.wallets.id, ids));

    expect(report.total).toBe(ids.length);
    expect(after).toEqual(before);
  });

  it('rotating a restored backup twice is a no-op the second time', async () => {
    const { ids } = await restoreBackup(atBackupTime);

    const first = await rotateWalletEncryption(db, today, {
      apply: true,
      walletIds: ids,
    });
    const second = await rotateWalletEncryption(db, today, {
      apply: true,
      walletIds: ids,
    });

    expect(first.rekeyed).toBe(ids.length);
    expect(second.rekeyed).toBe(0);
    expect(second.alreadyCurrent).toBe(ids.length);
  });
});
