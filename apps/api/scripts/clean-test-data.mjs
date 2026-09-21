#!/usr/bin/env node
/**
 * Removes rows left behind by the integration and devnet suites.
 *
 * A suite that fails partway cannot run its own afterAll, so fixtures
 * accumulate in the developer database. This clears them in dependency order.
 *
 *   node scripts/clean-test-data.mjs          # report only
 *   node scripts/clean-test-data.mjs --apply  # delete
 *
 * Only accounts matching the suites' own naming are touched. Anything else,
 * including the demo merchant used for manual checks, is left alone.
 */
import { Pool } from 'pg';
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../.env') });

const SUITE_EMAIL_PATTERNS = [
  'dayend-%@mcbuse.test',
  'dayend-other-%@mcbuse.test',
  'ops-int-%@mcbuse.test',
  'ledger-%@mcbuse.test',
  'rotate-%@mcbuse.test',
  'devnet-%@mcbuse.test',
  'fund-devnet-%@mcbuse.test',
  'wd-devnet-%@mcbuse.test',
];

const apply = process.argv.includes('--apply');

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      host: process.env.DATABASE_HOST,
      port: Number(process.env.DATABASE_PORT ?? 5432),
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
    });

const client = await pool.connect();
try {
  const { rows: victims } = await client.query(
    `SELECT id, email FROM users WHERE ${SUITE_EMAIL_PATTERNS.map(
      (_, i) => `email LIKE $${i + 1}`,
    ).join(' OR ')} ORDER BY email`,
    SUITE_EMAIL_PATTERNS,
  );

  if (victims.length === 0) {
    console.log('No suite fixtures found.');
    process.exit(0);
  }

  console.log(`${victims.length} suite fixture account(s):`);
  for (const v of victims) console.log(`  ${v.email}`);

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to delete.');
    process.exit(0);
  }

  const ids = victims.map((v) => v.id);
  await client.query('BEGIN');

  // Dependency order: anything referencing wallets or ledger entries first.
  const statements = [
    `DELETE FROM financial_operation_events WHERE operation_id IN
       (SELECT id FROM financial_operations WHERE user_id = ANY($1))`,
    `DELETE FROM financial_operations WHERE user_id = ANY($1)`,
    `DELETE FROM merchant_transactions WHERE merchant_id IN
       (SELECT m.id FROM merchants m JOIN wallets w ON w.id = m.receiving_wallet_id
        WHERE w.user_id = ANY($1))`,
    `DELETE FROM merchant_payment_attempts WHERE payer_user_id = ANY($1)`,
    `DELETE FROM payment_requests WHERE creator_wallet_id IN
       (SELECT id FROM wallets WHERE user_id = ANY($1))`,
    `DELETE FROM merchant_memberships WHERE merchant_id IN
       (SELECT m.id FROM merchants m JOIN wallets w ON w.id = m.receiving_wallet_id
        WHERE w.user_id = ANY($1))`,
    `DELETE FROM merchants WHERE receiving_wallet_id IN
       (SELECT id FROM wallets WHERE user_id = ANY($1))`,
    `DELETE FROM ledger_entries WHERE debit_wallet_id IN
       (SELECT id FROM wallets WHERE user_id = ANY($1))
        OR credit_wallet_id IN (SELECT id FROM wallets WHERE user_id = ANY($1))`,
    `DELETE FROM balances WHERE wallet_id IN
       (SELECT id FROM wallets WHERE user_id = ANY($1))`,
    `DELETE FROM wallets WHERE user_id = ANY($1)`,
    `DELETE FROM refresh_tokens WHERE user_id = ANY($1)`,
    `DELETE FROM users WHERE id = ANY($1)`,
  ];

  let removed = 0;
  for (const statement of statements) {
    const result = await client.query(statement, [ids]);
    removed += result.rowCount ?? 0;
  }

  await client.query('COMMIT');
  console.log(`\nRemoved ${removed} row(s) across ${victims.length} account(s).`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
