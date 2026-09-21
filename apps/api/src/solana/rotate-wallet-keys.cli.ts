/**
 * Operator command for wallet-encryption key rotation.
 *
 *   pnpm --filter api wallets:key-status     # what exists, nothing written
 *   pnpm --filter api wallets:key-rotate     # rewrite onto the current version
 *   pnpm --filter api wallets:key-verify     # read every record back
 *
 * Rotation is safe to interrupt and safe to repeat. A record that cannot be
 * read is reported and skipped, never rewritten.
 */
import 'reflect-metadata';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { resolve } from 'node:path';
import * as dotenv from 'dotenv';
import * as schema from '../database/schema';
import { WalletKeyRegistry } from './wallet-key-registry';
import {
  rotateWalletEncryption,
  verifyWalletRecovery,
} from './rotate-wallet-keys';

dotenv.config({ path: resolve(__dirname, '../../.env') });

function buildPool(): Pool {
  if (process.env.DATABASE_URL) {
    return new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.DATABASE_SSL === 'no-verify'
          ? { rejectUnauthorized: false }
          : undefined,
      max: 4,
    });
  }
  return new Pool({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT ?? 5432),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    max: 4,
  });
}

async function main() {
  const mode = process.argv[2] ?? 'status';
  if (!['status', 'rotate', 'verify'].includes(mode)) {
    throw new Error(`Unknown mode "${mode}". Use status, rotate or verify.`);
  }

  const keys = new WalletKeyRegistry((name) => process.env[name]);
  const pool = buildPool();
  const db = drizzle(pool, { schema });

  try {
    console.log(
      JSON.stringify(
        {
          mode,
          configuredVersions: keys.versions(),
          currentVersion: keys.currentVersion,
          checksums: Object.fromEntries(
            keys.versions().map((v) => [v, keys.checksum(v)]),
          ),
        },
        null,
        2,
      ),
    );

    if (mode === 'verify') {
      const result = await verifyWalletRecovery(db, keys);

      console.log(JSON.stringify(result, null, 2));
      if (result.failures.length > 0) process.exitCode = 1;
      return;
    }

    const report = await rotateWalletEncryption(db, keys, {
      apply: mode === 'rotate',
    });

    console.log(JSON.stringify(report, null, 2));
    if (report.unreadable.length > 0 || report.mismatched.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
