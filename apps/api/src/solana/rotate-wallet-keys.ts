import { Keypair } from '@solana/web3.js';
import { eq, inArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../database/schema';
import { WalletKeyRegistry } from './wallet-key-registry';

export interface WalletRotationReport {
  total: number;
  byVersion: Record<string, number>;
  /** Records rewritten in total. */
  rotated: number;
  /** Sealed with an older key and genuinely re-encrypted. */
  rekeyed: number;
  /** Already on the current key, rewritten only to carry its version label. */
  retagged: number;
  alreadyCurrent: number;
  unreadable: Array<{ walletId: string; reason: string }>;
  mismatched: Array<{ walletId: string; expected: string; derived: string }>;
}

export interface RotationOptions {
  /** When false the database is not written to; the checks still run. */
  apply: boolean;
  limit?: number;
  /** Restricts the run to specific wallets, for a staged rollout. */
  walletIds?: string[];
}

/**
 * Moves wallet records onto the current encryption key version.
 *
 * Every record is verified both before and after rewriting: the secret must
 * decrypt, and the public key derived from it must equal the address already
 * stored. A wallet that fails either check is reported and left untouched —
 * rotating a record we cannot prove we can read would destroy the wallet.
 */
export async function rotateWalletEncryption(
  db: NodePgDatabase<typeof schema>,
  keys: WalletKeyRegistry,
  options: RotationOptions,
): Promise<WalletRotationReport> {
  const selection = db
    .select({
      id: schema.wallets.id,
      solanaPubkey: schema.wallets.solanaPubkey,
      encryptedKeypair: schema.wallets.encryptedKeypair,
      encryptionKeyVersion: schema.wallets.encryptionKeyVersion,
    })
    .from(schema.wallets);
  const wallets = await (
    options.walletIds
      ? selection.where(inArray(schema.wallets.id, options.walletIds))
      : selection
  ).limit(options.limit ?? 10_000);

  const report: WalletRotationReport = {
    total: wallets.length,
    byVersion: {},
    rotated: 0,
    rekeyed: 0,
    retagged: 0,
    alreadyCurrent: 0,
    unreadable: [],
    mismatched: [],
  };

  for (const wallet of wallets) {
    const version = keys.versionOf(wallet.encryptedKeypair);
    report.byVersion[version] = (report.byVersion[version] ?? 0) + 1;

    let secret: Buffer;
    try {
      secret = keys.decrypt(wallet.encryptedKeypair);
    } catch (error) {
      report.unreadable.push({
        walletId: wallet.id,
        reason: error instanceof Error ? error.message : 'decrypt failed',
      });
      continue;
    }

    const derived = Keypair.fromSecretKey(secret).publicKey.toBase58();
    if (derived !== wallet.solanaPubkey) {
      report.mismatched.push({
        walletId: wallet.id,
        expected: wallet.solanaPubkey,
        derived,
      });
      continue;
    }

    const rewritten = keys.reEncrypt(wallet.encryptedKeypair);
    if (!rewritten.changed) {
      report.alreadyCurrent += 1;
      continue;
    }

    // Prove the new payload reads back to the same wallet before storing it.
    const roundTripped = Keypair.fromSecretKey(
      keys.decrypt(rewritten.payload),
    ).publicKey.toBase58();
    if (roundTripped !== wallet.solanaPubkey) {
      report.mismatched.push({
        walletId: wallet.id,
        expected: wallet.solanaPubkey,
        derived: roundTripped,
      });
      continue;
    }

    if (options.apply) {
      await db
        .update(schema.wallets)
        .set({
          encryptedKeypair: rewritten.payload,
          encryptionKeyVersion: rewritten.version,
          updatedAt: new Date(),
        })
        .where(eq(schema.wallets.id, wallet.id));
    }
    report.rotated += 1;
    if (version === keys.currentVersion) report.retagged += 1;
    else report.rekeyed += 1;
  }

  return report;
}

/**
 * Reads every wallet with the key version its record claims. Run this against a
 * restored backup before retiring an old key version.
 */
export async function verifyWalletRecovery(
  db: NodePgDatabase<typeof schema>,
  keys: WalletKeyRegistry,
  walletIds?: string[],
): Promise<{
  checked: number;
  failures: Array<{ walletId: string; reason: string }>;
}> {
  const selection = db
    .select({
      id: schema.wallets.id,
      solanaPubkey: schema.wallets.solanaPubkey,
      encryptedKeypair: schema.wallets.encryptedKeypair,
    })
    .from(schema.wallets);
  const wallets = await (walletIds
    ? selection.where(inArray(schema.wallets.id, walletIds))
    : selection);

  const failures: Array<{ walletId: string; reason: string }> = [];
  for (const wallet of wallets) {
    try {
      const derived = Keypair.fromSecretKey(
        keys.decrypt(wallet.encryptedKeypair),
      ).publicKey.toBase58();
      if (derived !== wallet.solanaPubkey) {
        failures.push({
          walletId: wallet.id,
          reason: 'derived address does not match the stored address',
        });
      }
    } catch (error) {
      failures.push({
        walletId: wallet.id,
        reason: error instanceof Error ? error.message : 'decrypt failed',
      });
    }
  }

  return { checked: wallets.length, failures };
}
