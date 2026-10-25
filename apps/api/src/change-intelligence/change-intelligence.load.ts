/**
 * Plan §9.6 performance gates for Change Intelligence (Stage 7). Sibling of
 * `analytics-intelligence/merchant-insights.load.ts` (the legacy engine's load run).
 *
 *   DATABASE_URL=postgres://fred@localhost:5432/mcbuse_ci_perf DATABASE_SSL=false \
 *     npx ts-node -T src/change-intelligence/change-intelligence.load.ts \
 *       [--api http://127.0.0.1:4105/api/v1] [--out ../../docs/evaluations/change-intelligence/performance.json]
 *
 * Builds one merchant with 1,000 products and 100,000 sales (75% cash, 25%
 * finalized digital) in a migrated, otherwise empty local database, then
 * measures, with a fixed `asOf` and the real services (no Nest bootstrap):
 * startup/scheduling, full initialization, one-product incremental runs,
 * stock-only runs and daily clock evaluations. With `--api` (a local API
 * started against the same database) it also measures source-write latency
 * through HTTP with the capture triggers on vs off.
 *
 * Refuses any database that is not on localhost.
 */
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { execSync } from 'node:child_process';
import * as bcrypt from 'bcrypt';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../database/schema';
import { createMerchantFixture } from '../database/testing/merchant-fixture';
import { percentile } from '../common/percentile';
import { ChangeIntelligenceConfig } from './change-intelligence.config';
import { ChangePublisherService } from './change-publisher.service';
import { ChangeProcessorService } from './change-processor.service';
import { ChangeSourceLoader } from './change-source.loader';
import { ChangeWorkQueueService } from './change-work-queue.service';
import { evaluateMerchant } from './engine/evaluate';
import { asOfAfter } from './engine/fixtures';
import { addDays } from './engine/local-time';

const TZ = 'Europe/Berlin';
/** Last completed local day at the first run; sales run D0−83 … D0+6 (90 days). */
const D0 = '2026-10-15';
const PRODUCTS = 1_000;
const SALES = 100_000;
const SAMPLES = 40;
const CLOCK_DAYS = 5;
const PASSWORD = 'Perf-Load-Password-1';
const at = (day: string, hour = 1) => asOfAfter(day, TZ, hour);

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const stats = (samples: number[]) => ({
  n: samples.length,
  min: round(Math.min(...samples)),
  p50: round(percentile(samples, 50)),
  p95: round(percentile(samples, 95)),
  max: round(Math.max(...samples)),
});
const round = (n: number) => Math.round(n * 10) / 10;
async function timed<T>(fn: () => Promise<T>): Promise<[number, T]> {
  const started = performance.now();
  const result = await fn();
  return [performance.now() - started, result];
}

const CAPTURE: Array<[string, string]> = [
  ['merchant_transactions', 'transactions'],
  ['merchant_cash_sales', 'cash_sales'],
  ['merchant_cash_sale_items', 'cash_sale_items'],
  ['merchant_products', 'products'],
  ['merchant_import_batches', 'import_batches'],
  ['merchants', 'merchants'],
];

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  })();
  if (!['localhost', '127.0.0.1'].includes(host))
    throw new Error('Refusing to run: DATABASE_URL must point at localhost.');
  const pool = new Pool({ connectionString: url, max: 4 });
  const db = drizzle(pool, { schema });
  const q = async <T = Record<string, unknown>>(text: string, values: unknown[] = []) =>
    (await pool.query(text, values)).rows as T[];
  const setCapture = async (enabled: boolean) => {
    for (const [table, prefix] of CAPTURE) {
      const names = (
        await q<{ tgname: string }>(
          `SELECT tgname FROM pg_trigger WHERE tgrelid = $1::regclass AND tgname LIKE $2`,
          [table, `change_capture_${prefix}_%`],
        )
      ).map((r) => r.tgname);
      for (const name of names)
        await q(`ALTER TABLE ${table} ${enabled ? 'ENABLE' : 'DISABLE'} TRIGGER ${name}`);
    }
  };
  const log = (message: string) => process.stderr.write(`${message}\n`);

  // ---------------------------------------------------------------- startup
  const [startupMs, config] = await timed(async () => {
    const c = new ChangeIntelligenceConfig({
      MERCHANT_CHANGE_INTELLIGENCE_ENABLED: 'true',
    });
    await pool.query('SELECT 1');
    return c;
  });

  // ---------------------------------------------------------------- fixture
  log('building fixture …');
  const [fixtureMs, fixture] = await timed(async () => {
    const f = await createMerchantFixture(db, 'Perf');
    const tag = f.merchantId.slice(0, 8);
    await q(`UPDATE users SET password_hash = $2 WHERE id = $1`, [
      f.userId,
      await bcrypt.hash(PASSWORD, 10),
    ]);
    // Existing records predate capture: load them with capture off.
    await setCapture(false);
    try {
      await q(
        `INSERT INTO merchant_products (merchant_id, name, sku, unit_price_minor, on_hand_quantity, low_stock_threshold, created_at)
         SELECT $1, 'Product ' || lpad(g::text, 4, '0'), 'SKU-' || lpad(g::text, 4, '0'), 250,
           CASE WHEN g % 97 = 0 THEN 0 WHEN g % 40 = 0 THEN 3 ELSE 5000 END, 10,
           ($2::date - 100)::timestamp AT TIME ZONE $3
         FROM generate_series(0, $4 - 1) g`,
        [f.merchantId, D0, TZ, PRODUCTS],
      );
      // Sale i: day D0−83+(i % 90), product skewed towards low indices, 1–3 units.
      await q(
        `CREATE TEMP TABLE perf_sales ON COMMIT PRESERVE ROWS AS
         WITH ids AS (SELECT array_agg(id ORDER BY name) AS a FROM merchant_products WHERE merchant_id = $1)
         SELECT g AS i, gen_random_uuid() AS id, gen_random_uuid() AS ledger_id,
           ((($2::date - 83 + (g % 90)) + make_time(8 + (g * 13) % 11, g % 60, 0)) AT TIME ZONE $3) AS at,
           ids.a[1 + floor($4 * power(((g * 7919) % 1000) / 1000.0, 2))::int] AS product_id,
           ids.a[1 + (floor($4 * power(((g * 7919) % 1000) / 1000.0, 2))::int + 17) % $4] AS second_id,
           1 + g % 3 AS qty
         FROM generate_series(0, $5 - 1) g, ids`,
        [f.merchantId, D0, TZ, PRODUCTS, SALES],
      );
      await q(
        `INSERT INTO merchant_cash_sales (id, merchant_id, receipt_number, amount_minor, occurred_at, actor_user_id, idempotency_key)
         SELECT id, $1, 'CS-' || $3 || '-' || i, 250 * qty, at, $2, 'perf-' || i FROM perf_sales WHERE i % 4 <> 0`,
        [f.merchantId, f.userId, tag],
      );
      await q(
        `INSERT INTO merchant_cash_sale_items (cash_sale_id, product_id, type, name, quantity, unit_price_minor, line_total_minor)
         SELECT id, product_id, 'product', 'Line', qty, 250, 250 * qty FROM perf_sales WHERE i % 4 <> 0
         UNION ALL
         SELECT id, second_id, 'product', 'Line', 1, 250, 250 FROM perf_sales WHERE i % 4 <> 0 AND i % 5 = 0`,
      );
      await q(
        `INSERT INTO payment_requests (id, merchant_id, creator_wallet_id, nonce, type, amount, currency, status,
           display_amount_minor, display_currency, quote_rate_scaled, expires_at, created_at)
         SELECT id, $1, $2, 'perf-' || $3 || '-' || i, 'dynamic', 500, 'USDC', 'completed', 250 * qty, 'EUR', 920000000,
           at + interval '1 hour', at AT TIME ZONE 'UTC' FROM perf_sales WHERE i % 4 = 0`,
        [f.merchantId, f.routineWalletId, tag],
      );
      await q(
        `INSERT INTO merchant_invoice_items (payment_request_id, product_id, type, name, quantity, unit_price_minor, line_total_minor)
         SELECT id, product_id, 'product', 'Line', qty, 250, 250 * qty FROM perf_sales WHERE i % 4 = 0`,
      );
      await q(
        `INSERT INTO ledger_entries (id, debit_wallet_id, credit_wallet_id, amount, currency, type, status, idempotency_key)
         SELECT ledger_id, $1, $2, 500, 'USDC', 'p2p', 'completed', 'perf-' || $3 || '-' || i FROM perf_sales WHERE i % 4 = 0`,
        [f.holdingWalletId, f.routineWalletId, tag],
      );
      await q(
        `INSERT INTO merchant_transactions (receipt_number, merchant_id, payment_request_id, ledger_entry_id,
           display_amount_minor, settlement_amount, settlement_currency, quote_rate_scaled, status,
           evidence_environment, occurred_at, finalized_at)
         SELECT 'TX-' || $2 || '-' || i, $1, id, ledger_id, 250 * qty, 5000000, 'USDC', 920000000, 'finalized', 'live', at, at
         FROM perf_sales WHERE i % 4 = 0`,
        [f.merchantId, tag],
      );
      await q(`DROP TABLE perf_sales`);
    } finally {
      await setCapture(true);
    }
    await q(`ANALYZE`);
    return f;
  });
  const m = fixture.merchantId;
  const [counts] = await q<Record<string, number>>(
    `SELECT (SELECT count(*)::int FROM merchant_products WHERE merchant_id = $1) AS products,
       (SELECT count(*)::int FROM merchant_cash_sales WHERE merchant_id = $1) AS cash_sales,
       (SELECT count(*)::int FROM merchant_cash_sale_items i JOIN merchant_cash_sales s ON s.id = i.cash_sale_id WHERE s.merchant_id = $1) AS cash_lines,
       (SELECT count(*)::int FROM merchant_transactions WHERE merchant_id = $1) AS digital_sales,
       pg_database_size(current_database())::bigint AS db_bytes`,
    [m],
  );
  log(`fixture ${JSON.stringify(counts)} in ${round(fixtureMs)} ms`);

  // ---------------------------------------------------------------- services
  const allow = new ChangeIntelligenceConfig({
    MERCHANT_CHANGE_INTELLIGENCE_ENABLED: 'true',
    MERCHANT_CHANGE_INTELLIGENCE_ALLOWLIST: m,
  });
  const queue = new ChangeWorkQueueService(db, allow);
  const loader = new ChangeSourceLoader();
  const processor = new ChangeProcessorService(
    db,
    allow,
    queue,
    loader,
    new ChangePublisherService(queue),
  );
  const runOnce = async (asOf: Date) => {
    const [claimMs, work] = await timed(() => queue.claim({ merchantId: m }));
    if (!work) throw new Error('nothing to claim');
    const [processMs, outcome] = await timed(() => processor.processWork(work, { asOf }));
    if (outcome.status !== 'succeeded')
      throw new Error(`run failed: ${JSON.stringify(outcome)}`);
    return { claimMs, processMs, outcome };
  };
  /** Load and evaluate phases on the current state, read-only (for the breakdown). */
  const phases = async (asOf: Date, full: boolean) => {
    const [loadMs, source] = await timed(() =>
      db.transaction(
        (tx) =>
          loader.load(tx, {
            merchantId: m,
            claimedRevision: 1n << 60n,
            asOf,
            settings: allow.settings,
            full,
          }),
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      ),
    );
    const [lastDaily] = await q<{ d: string | null }>(
      `SELECT last_daily_evaluation_date::text AS d FROM merchant_change_work WHERE merchant_id = $1`,
      [m],
    );
    const evaluateStarted = performance.now();
    evaluateMerchant({
      merchantId: m,
      timezone: TZ,
      asOf,
      settings: allow.settings,
      reason: full ? 'reconciliation' : 'source_change',
      sales: source.sales,
      products: source.products,
      previousStates: source.previousStates,
      previousActiveCases: source.activeCases,
      lastDailyEvaluationDate: lastDaily?.d ?? null,
      affected: full ? 'all' : source.affected,
    });
    return {
      loadMs: round(loadMs),
      evaluateMs: round(performance.now() - evaluateStarted),
      saleLines: source.sales.length,
      states: Object.keys(source.previousStates).length,
    };
  };
  const resetChangeData = async () => {
    for (const table of [
      'merchant_change_transitions',
      'merchant_change_cases',
      'merchant_change_states',
      'merchant_change_events',
      'merchant_change_runs',
      'merchant_change_work',
    ])
      await q(`DELETE FROM ${table} WHERE merchant_id = $1`, [m]);
  };

  // ---------------------------------------------------------------- scheduling
  const [scheduleMs, scheduled] = await timed(() => queue.enqueueScheduled(at(D0)));
  if (!scheduled.initialization.includes(m)) throw new Error('initialization not scheduled');

  // ---------------------------------------------------------------- initialization (cold, then warm)
  log('initialization …');
  const init: Array<Record<string, unknown>> = [];
  for (let rep = 0; rep < 3; rep += 1) {
    if (rep > 0) {
      await resetChangeData();
      await queue.requestRun(m, 'initialization');
    }
    const r = await runOnce(at(D0));
    init.push({
      condition: rep === 0 ? 'cold (first run in process)' : 'warm',
      claimMs: round(r.claimMs),
      processMs: round(r.processMs),
      reason: r.outcome.reason,
      counts: r.outcome.counts,
    });
  }
  const initPhases = await phases(at(D0), true);
  log(`initialization ${JSON.stringify(init.map((r) => r.processMs))} ms, phases ${JSON.stringify(initPhases)}`);

  // ---------------------------------------------------------------- stock-only
  log('stock-only …');
  const productIds = (
    await q<{ id: string }>(
      `SELECT id FROM merchant_products WHERE merchant_id = $1 ORDER BY name`,
      [m],
    )
  ).map((r) => r.id);
  const stockOnly: number[] = [];
  const stockInvoked: number[] = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    await q(`UPDATE merchant_products SET on_hand_quantity = on_hand_quantity + 1 WHERE id = $1`, [
      productIds[(i * 37) % PRODUCTS],
    ]);
    const r = await runOnce(at(D0, 2 + (i % 20)));
    if (r.outcome.reason !== 'source_change') throw new Error(r.outcome.reason);
    stockOnly.push(r.claimMs + r.processMs);
    stockInvoked.push(r.outcome.counts?.evaluated ?? 0);
  }
  await q(`UPDATE merchant_products SET on_hand_quantity = on_hand_quantity + 1 WHERE id = $1`, [productIds[1]]);
  const stockPhases = await phases(at(D0, 3), false);
  log(`stock-only ${JSON.stringify(stats(stockOnly))} ms, phases ${JSON.stringify(stockPhases)}`);
  await runOnce(at(D0, 3));

  // ---------------------------------------------------------------- one-product incremental (a sale)
  log('one-product incremental …');
  const incremental: number[] = [];
  const incrementalInvoked: number[] = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    const pid = productIds[(i * 53) % PRODUCTS];
    const asOf = at(D0, 2 + (i % 20));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const [sale] = (
        await client.query<{ id: string }>(
          `INSERT INTO merchant_cash_sales (merchant_id, receipt_number, amount_minor, occurred_at, actor_user_id, idempotency_key)
           VALUES ($1, 'CS-inc-' || $3, 500, $4, $2, gen_random_uuid()::text) RETURNING id`,
          [m, fixture.userId, `${i}-${randomUUID().slice(0, 8)}`, new Date(asOf.getTime() - 30 * 60_000)],
        )
      ).rows;
      await client.query(
        `INSERT INTO merchant_cash_sale_items (cash_sale_id, product_id, type, name, quantity, unit_price_minor, line_total_minor)
         VALUES ($1, $2, 'product', 'Line', 2, 250, 500)`,
        [sale.id, pid],
      );
      await client.query(`UPDATE merchant_products SET on_hand_quantity = GREATEST(on_hand_quantity - 2, 0) WHERE id = $1`, [pid]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const r = await runOnce(asOf);
    incremental.push(r.claimMs + r.processMs);
    incrementalInvoked.push(r.outcome.counts?.evaluated ?? 0);
  }

  log(`incremental ${JSON.stringify(stats(incremental))} ms`);

  // ---------------------------------------------------------------- daily clock
  log('daily clock …');
  const clock: Array<Record<string, unknown>> = [];
  for (let d = 1; d <= CLOCK_DAYS; d += 1) {
    const day = addDays(D0, d);
    const [tickMs, summary] = await timed(() => processor.tick({ budgetMs: 600_000, asOf: at(day) }));
    const run = summary.merchants[0];
    if (run?.reason !== 'clock' || run.status !== 'succeeded')
      throw new Error(`clock run: ${JSON.stringify(run)}`);
    clock.push({ day, tickMs: round(tickMs), counts: run.counts });
  }
  const clockMs = clock.map((c) => c.tickMs as number);
  log(`clock ${JSON.stringify(stats(clockMs))} ms`);

  // ---------------------------------------------------------------- source writes over HTTP
  const api = arg('--api');
  let http: Record<string, unknown> | null = null;
  if (api) {
    log('source writes over HTTP …');
    http = await httpWrites(api, fixture.userId, q, setCapture, m);
  }

  const [size] = await q<{ db: string; change_tables: string }>(
    `SELECT pg_size_pretty(pg_database_size(current_database())) AS db,
       pg_size_pretty((SELECT sum(pg_total_relation_size(c.oid)) FROM pg_class c WHERE c.relname LIKE 'merchant_change_%' AND c.relkind = 'r')) AS change_tables`,
  );
  const sh = (cmd: string) => {
    try {
      return execSync(cmd).toString().trim();
    } catch {
      return null;
    }
  };
  const p95 = (s: number[]) => percentile(s, 95);
  const report = {
    generatedAt: new Date().toISOString(),
    environment: {
      cpu: sh('sysctl -n machdep.cpu.brand_string') ?? cpus()[0]?.model,
      logicalCpus: cpus().length,
      memoryGiB: Math.round(totalmem() / 2 ** 30),
      node: process.version,
      postgres: (await q<{ v: string }>(`SHOW server_version`))[0].v,
      database: new URL(url).pathname.slice(1),
      databaseSize: size.db,
      changeTablesSize: size.change_tables,
      concurrency:
        'worker measurements: one merchant, sequential runs, pool max 4, same machine as Postgres',
    },
    fixture: { ...counts, buildMs: round(fixtureMs), timezone: TZ, d0: D0 },
    startup: { configAndFirstQueryMs: round(startupMs), enqueueScheduledMs: round(scheduleMs) },
    gates: {
      oneProductIncrementalP95Ms: { ...stats(incremental), gateMs: 2000, pass: p95(incremental) <= 2000, evaluatedNodes: stats(incrementalInvoked) },
      stockOnlyP95Ms: { ...stats(stockOnly), gateMs: 500, pass: p95(stockOnly) <= 500, evaluatedNodes: stats(stockInvoked) },
      dailyClock1000ProductsMs: { ...stats(clockMs), gateMs: 30_000, pass: Math.max(...clockMs) <= 30_000, runs: clock },
      fullInitializationMs: {
        runs: init,
        gateMs: 120_000,
        pass: init.every((r) => (r.claimMs as number) + (r.processMs as number) <= 120_000),
      },
      ...(http ? { sourceWriteP95Regression: http } : {}),
    },
    breakdown: { initialization: initPhases, stockOnly: stockPhases },
  };
  const out = arg('--out');
  const json = JSON.stringify(report, null, 2);
  if (out) writeFileSync(out, `${json}\n`);
  process.stdout.write(`${json}\n`);
  await pool.end();
}

/** Cash-sale and stock-adjustment POSTs through the real API, capture on vs off, interleaved. */
async function httpWrites(
  api: string,
  userId: string,
  q: <T = Record<string, unknown>>(text: string, values?: unknown[]) => Promise<T[]>,
  setCapture: (enabled: boolean) => Promise<void>,
  merchantId: string,
) {
  const [user] = await q<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [userId]);
  const login = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: PASSWORD }),
  });
  if (!login.ok) throw new Error(`login ${login.status}: ${await login.text()}`);
  const { accessToken } = (await login.json()) as { accessToken: string };
  // Dedicated high-stock products so sales never run out and rows rarely collide.
  const targets = (
    await q<{ id: string }>(
      `INSERT INTO merchant_products (merchant_id, name, unit_price_minor, on_hand_quantity, low_stock_threshold)
       SELECT $1, 'HTTP ' || g, 250, 10000000, 10 FROM generate_series(1, 32) g RETURNING id`,
      [merchantId],
    )
  ).map((r) => r.id);
  let n = 0;
  const post = async (path: string, body: unknown, idempotent: boolean) => {
    const started = performance.now();
    const res = await fetch(`${api}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        ...(idempotent ? { 'idempotency-key': randomUUID() } : {}),
      },
      body: JSON.stringify(body),
    });
    await res.arrayBuffer();
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return performance.now() - started;
  };
  const ops = {
    'POST /merchants/me/cash-sales': () =>
      post(
        '/merchants/me/cash-sales',
        {
          lines: [{ type: 'product', productId: targets[n++ % targets.length], quantity: 1 }],
          occurredAt: new Date().toISOString(),
        },
        true,
      ),
    'POST /merchants/me/products/:id/stock-adjustments': () =>
      post(
        `/merchants/me/products/${targets[n++ % targets.length]}/stock-adjustments`,
        { reason: 'restock', change: 1 },
        false,
      ),
  };
  // Interleaved off/on blocks cancel drift from other work on the machine.
  const ROUNDS = 200;
  const BLOCKS = 5;
  const results: Record<string, unknown> = {};
  try {
    for (const concurrency of [1, 8]) {
      for (const [name, op] of Object.entries(ops)) {
        const batch = async (count: number) => {
          const samples: number[] = [];
          let left = count;
          await Promise.all(
            Array.from({ length: concurrency }, async () => {
              while (left-- > 0) samples.push(await op());
            }),
          );
          return samples;
        };
        await batch(100); // warm-up
        const on: number[] = [];
        const off: number[] = [];
        for (let block = 0; block < BLOCKS; block += 1) {
          await setCapture(false);
          off.push(...(await batch(ROUNDS)));
          await setCapture(true);
          on.push(...(await batch(ROUNDS)));
        }
        const p95Off = percentile(off, 95);
        const p95On = percentile(on, 95);
        results[`${name} @ concurrency ${concurrency}`] = {
          off: stats(off),
          on: stats(on),
          p95RegressionPct: round((100 * (p95On - p95Off)) / p95Off),
          p50RegressionPct: round(
            (100 * (percentile(on, 50) - percentile(off, 50))) / percentile(off, 50),
          ),
          gatePct: 10,
          pass: (100 * (p95On - p95Off)) / p95Off <= 10,
        };
      }
    }
  } finally {
    await setCapture(true);
  }
  return results;
}

main().catch((error) => {
  process.stderr.write(`${(error as Error).stack ?? String(error)}\n`);
  process.exit(1);
});
