import { randomUUID } from 'crypto';
import { Pool, type PoolClient } from 'pg';
import type { ChangeIntelligenceSettings } from '@repo/shared';
import {
  connectTestDatabase,
  type TestDatabase,
} from '../database/testing/test-database';
import {
  createMerchantFixture,
  destroyMerchantFixture,
  type MerchantFixture,
} from '../database/testing/merchant-fixture';
import { ChangeIntelligenceConfig } from './change-intelligence.config';
import { ChangePublisherService } from './change-publisher.service';
import { ChangeProcessorService } from './change-processor.service';
import { ChangeSourceLoader } from './change-source.loader';
import {
  ChangeWorkQueueService,
  type ClaimedChangeWork,
} from './change-work-queue.service';
import { asOfAfter, repeat } from './engine/fixtures';
import { addDays, localDayStart } from './engine/local-time';
import { MODEL_VERSION } from './engine/registry';

/**
 * Plan §4.4–§4.6, §9.2 (Stage 3): worker, loader and atomic publication
 * against a real Postgres. Every run uses an injected `asOf`.
 */
const TZ = 'Europe/Berlin';
/** D0: the last completed local day at the first run. */
const D0 = '2026-09-20';
const at = (day: string, hour = 1) => asOfAfter(day, TZ, hour);

describe('change processing (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  const fixtures: MerchantFixture[] = [];

  const q = async <T = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
    client: Pool | PoolClient = pool,
  ) => (await client.query(text, values)).rows as T[];

  type Services = {
    config: ChangeIntelligenceConfig;
    queue: ChangeWorkQueueService;
    loader: ChangeSourceLoader;
    publisher: ChangePublisherService;
    processor: ChangeProcessorService;
  };

  const services = (
    merchantIds: string[],
    settings?: Partial<ChangeIntelligenceSettings>,
    enabled = true,
  ): Services => {
    const config = new ChangeIntelligenceConfig({
      MERCHANT_CHANGE_INTELLIGENCE_ENABLED: String(enabled),
      MERCHANT_CHANGE_INTELLIGENCE_ALLOWLIST: merchantIds.join(','),
      MERCHANT_CHANGE_INTELLIGENCE_SETTINGS: settings
        ? JSON.stringify(settings)
        : undefined,
    });
    const queue = new ChangeWorkQueueService(db, config);
    const loader = new ChangeSourceLoader();
    const publisher = new ChangePublisherService(queue);
    const processor = new ChangeProcessorService(
      db,
      config,
      queue,
      loader,
      publisher,
    );
    return { config, queue, loader, publisher, processor };
  };

  const merchantFixture = async (label: string) => {
    const fixture = await createMerchantFixture(db, label);
    fixtures.push(fixture);
    return fixture;
  };

  const product = async (
    merchantId: string,
    options: { name?: string; onHand?: number; threshold?: number } = {},
  ) =>
    (
      await q<{ id: string }>(
        `INSERT INTO merchant_products (merchant_id, name, unit_price_minor, on_hand_quantity, low_stock_threshold, created_at)
         VALUES ($1, $2, 250, $3, $4, $5) RETURNING id`,
        [
          merchantId,
          options.name ?? 'Cappuccino',
          options.onHand ?? 40,
          options.threshold ?? 5,
          localDayStart('2026-07-01', TZ),
        ],
      )
    )[0].id;

  /** One cash sale per day at local noon, `daily[last]` on `lastDay`. Returns sale ids. */
  const cashSeries = async (
    fixture: MerchantFixture,
    productId: string | null,
    lastDay: string,
    daily: number[],
  ) => {
    const days = daily.map((_, i) => addDays(lastDay, i - daily.length + 1));
    return (
      await q<{ id: string }>(
        `WITH days AS (
           SELECT d, n FROM unnest($3::date[], $4::int[]) AS t(d, n) WHERE n > 0),
         sales AS (
           INSERT INTO merchant_cash_sales (merchant_id, receipt_number, amount_minor, occurred_at, actor_user_id, idempotency_key)
           SELECT $1, 'CS-' || substr(md5(random()::text), 1, 20), 250 * n, (d + time '12:00') AT TIME ZONE $5, $2,
             gen_random_uuid()::text FROM days
           RETURNING id, amount_minor)
         , items AS (
           INSERT INTO merchant_cash_sale_items (cash_sale_id, product_id, type, name, quantity, unit_price_minor, line_total_minor)
           SELECT id, $6, CASE WHEN $6::uuid IS NULL THEN 'custom' ELSE 'product' END, 'Line', (amount_minor / 250)::int, 250, amount_minor
           FROM sales RETURNING cash_sale_id)
         SELECT cash_sale_id AS id FROM items`,
        [fixture.merchantId, fixture.userId, days, daily, TZ, productId],
      )
    ).map((row) => row.id);
  };

  const ledgerEntry = async (fixture: MerchantFixture) =>
    (
      await q<{ id: string }>(
        `INSERT INTO ledger_entries (debit_wallet_id, credit_wallet_id, amount, currency, type, status, idempotency_key)
         VALUES ($1, $2, 500, 'USDC', 'p2p', 'completed', $3) RETURNING id`,
        [fixture.holdingWalletId, fixture.routineWalletId, randomUUID()],
      )
    )[0].id;

  /** A payment request with one invoice line; finalized adds the merchant transaction. */
  const digitalSale = async (
    fixture: MerchantFixture,
    productId: string,
    quantity: number,
    occurredAt: Date,
    status: 'finalized' | 'pending' | 'cancelled',
  ) => {
    const requestId = (
      await q<{ id: string }>(
        `INSERT INTO payment_requests (merchant_id, creator_wallet_id, nonce, type, amount, currency, status,
            display_amount_minor, display_currency, quote_rate_scaled, expires_at, created_at)
         VALUES ($1, $2, $3, 'dynamic', 500, 'USDC', $4, 500, 'EUR', 920000000, now() + interval '1 hour',
           ($5::timestamptz AT TIME ZONE 'UTC')) RETURNING id`,
        [
          fixture.merchantId,
          fixture.routineWalletId,
          randomUUID(),
          status === 'finalized' ? 'completed' : status,
          occurredAt,
        ],
      )
    )[0].id;
    await q(
      `INSERT INTO merchant_invoice_items (payment_request_id, product_id, type, name, quantity, unit_price_minor, line_total_minor)
       VALUES ($1, $2, 'product', 'Line', $3, 250, $3 * 250)`,
      [requestId, productId, quantity],
    );
    if (status !== 'finalized') return { requestId, transactionId: null };
    const transactionId = (
      await q<{ id: string }>(
        `INSERT INTO merchant_transactions (receipt_number, merchant_id, payment_request_id, ledger_entry_id,
           display_amount_minor, settlement_amount, settlement_currency, quote_rate_scaled, status,
           evidence_environment, occurred_at, finalized_at)
         VALUES ($1, $2, $3, $4, 500, 5000000, 'USDC', 920000000, 'finalized', 'test', $5, $5) RETURNING id`,
        [
          `TX-${randomUUID().slice(0, 12)}`,
          fixture.merchantId,
          requestId,
          await ledgerEntry(fixture),
          occurredAt,
        ],
      )
    )[0].id;
    return { requestId, transactionId };
  };

  const work = async (merchantId: string) =>
    (
      await q<{
        requested_revision: string;
        processed_revision: string;
        status: string;
        attempts: number;
        bootstrap_status: string;
        last_daily_evaluation_date: string | null;
        requested_reason: string | null;
        model_version: string | null;
        settings_fingerprint: string | null;
        lease_token: string | null;
        last_error: string | null;
        backoff_minutes: number | null;
      }>(
        `SELECT requested_revision::text, processed_revision::text, status, attempts, bootstrap_status,
           last_daily_evaluation_date::text, requested_reason, model_version, settings_fingerprint, lease_token,
           last_error, round(extract(epoch FROM next_attempt_at - last_failure_at) / 60)::int AS backoff_minutes
         FROM merchant_change_work WHERE merchant_id = $1`,
        [merchantId],
      )
    )[0];

  const runs = (merchantId: string) =>
    q<{
      id: string;
      reason: string;
      status: string;
      source_revision: string;
      settings: ChangeIntelligenceSettings;
      counts: Record<string, unknown>;
      coverage: Record<string, unknown>;
      error: string | null;
      fingerprint: string | null;
    }>(
      `SELECT id, reason, status, source_revision::text, settings, counts, coverage, error, fingerprint
       FROM merchant_change_runs WHERE merchant_id = $1 ORDER BY completed_at, created_at`,
      [merchantId],
    );

  const cases = (merchantId: string) =>
    q<{
      id: string;
      product_id: string;
      case_type: string;
      status: string;
      resolution: string | null;
      priority: number;
      identified_during_initial_analysis: boolean;
      settings: ChangeIntelligenceSettings;
      evidence: {
        facts: Record<string, unknown>;
        before: unknown[];
        after: unknown[];
      };
      counters: { entries: number; lastChangeDate: string };
      latest_transition_id: string;
    }>(
      `SELECT id, product_id, case_type, status, resolution, priority, identified_during_initial_analysis, settings,
         evidence, counters, latest_transition_id
       FROM merchant_change_cases WHERE merchant_id = $1 ORDER BY created_at, case_type`,
      [merchantId],
    );

  const states = (merchantId: string, productId?: string) =>
    q<{
      node_key: string;
      product_id: string | null;
      version: string;
      fingerprint: string;
      readiness: string;
      value: Record<string, unknown>;
      run_id: string;
    }>(
      `SELECT node_key, product_id, version::text, fingerprint, readiness, value, run_id
       FROM merchant_change_states WHERE merchant_id = $1 AND ($2::uuid IS NULL OR product_id = $2)
       ORDER BY product_id NULLS FIRST, node_key`,
      [merchantId, productId ?? null],
    );

  const eventStatuses = (merchantId: string) =>
    q<{ status: string; n: number }>(
      `SELECT status, count(*)::int AS n FROM merchant_change_events WHERE merchant_id = $1 GROUP BY status ORDER BY status`,
      [merchantId],
    );

  const countRows = async (table: string, merchantId: string) =>
    (
      await q<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${table} WHERE merchant_id = $1`,
        [merchantId],
      )
    )[0].n;

  const claim = async (s: Services, merchantId: string) => {
    const claimed = await s.queue.claim({ merchantId });
    if (!claimed) throw new Error('expected claimable work');
    return claimed;
  };

  /** A merchant with steady history for `products` and a completed bootstrap at D0. */
  const bootstrapped = async (
    label: string,
    options: { products?: number; onHand?: number } = {},
  ) => {
    const fixture = await merchantFixture(label);
    const productIds: string[] = [];
    for (let i = 0; i < (options.products ?? 2); i += 1) {
      const id = await product(fixture.merchantId, {
        name: `P${i}`,
        onHand: options.onHand ?? 200,
      });
      productIds.push(id);
      await cashSeries(fixture, id, D0, repeat(4, 35));
    }
    const s = services([fixture.merchantId]);
    const outcome = await s.processor.processMerchant(fixture.merchantId, {
      asOf: at(D0),
    });
    expect(outcome?.status).toBe('succeeded');
    return { fixture, productIds, s };
  };

  beforeAll(async () => {
    ({ db, pool } = await connectTestDatabase());
  });

  afterAll(async () => {
    for (const fixture of fixtures) await destroyMerchantFixture(db, fixture);
    await pool.end();
  });

  it('bootstraps from existing records: initialization run, states, labelled risks, no demand cases, events resolved', async () => {
    const fixture = await merchantFixture('Boot');
    const low = await product(fixture.merchantId, {
      name: 'Croissant',
      onHand: 3,
    });
    const steady = await product(fixture.merchantId, { name: 'Latte' });
    await cashSeries(fixture, low, D0, repeat(4, 35));
    await cashSeries(fixture, steady, D0, repeat(4, 35));
    const s = services([fixture.merchantId]);

    // Nothing processed yet: capture accumulated pending events.
    expect(await eventStatuses(fixture.merchantId)).toEqual([
      { status: 'pending', n: 72 },
    ]);
    const summary = await s.processor.tick({ budgetMs: 60_000, asOf: at(D0) });
    expect(summary).toMatchObject({ processed: 1, failed: 0, deferred: 0 });
    expect(summary.merchants[0].reason).toBe('initialization');

    const [run] = await runs(fixture.merchantId);
    expect(run).toMatchObject({
      reason: 'initialization',
      status: 'succeeded',
      source_revision: '72',
      error: null,
    });
    expect(run.coverage).toMatchObject({ cashSales: 70, unassignedLines: 0 });
    expect(await eventStatuses(fixture.merchantId)).toEqual([
      { status: 'resolved', n: 72 },
    ]);
    expect(await work(fixture.merchantId)).toMatchObject({
      requested_revision: '72',
      processed_revision: '72',
      status: 'idle',
      bootstrap_status: 'completed',
      last_daily_evaluation_date: D0,
      model_version: MODEL_VERSION,
      settings_fingerprint: s.config.settingsFingerprint,
      lease_token: null,
    });
    const opened = await cases(fixture.merchantId);
    expect(
      opened.map((c) => [
        c.product_id,
        c.case_type,
        c.priority,
        c.identified_during_initial_analysis,
      ]),
    ).toEqual([[low, 'stock_risk', 2, true]]);
    expect(await states(fixture.merchantId, steady)).toHaveLength(12);

    // An hourly run without events or rollover does nothing.
    const idle = await s.processor.tick({ budgetMs: 60_000, asOf: at(D0, 5) });
    expect(idle).toMatchObject({ processed: 0, failed: 0 });
    expect(await runs(fixture.merchantId)).toHaveLength(1);
  });

  const loadFor = (s: Services, w: ClaimedChangeWork, asOf: Date) =>
    db.transaction(
      (tx) =>
        s.loader.load(tx, {
          merchantId: w.merchantId,
          claimedRevision: w.claimedRevision,
          asOf,
          settings: s.config.settings,
          full: false,
        }),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );

  it('loads complete committed observations: digital lines via payment_request_id, cash, exclusions and unassigned lines', async () => {
    const fixture = await merchantFixture('Load');
    const m = fixture.merchantId;
    const a = await product(m, { name: 'A' });
    const occurred = new Date(localDayStart(D0, TZ).getTime() + 10 * 3_600_000);
    const finalized = await digitalSale(fixture, a, 3, occurred, 'finalized');
    const pending = await digitalSale(fixture, a, 5, occurred, 'pending');
    const cancelled = await digitalSale(fixture, a, 2, occurred, 'cancelled');
    const [cash] = await cashSeries(fixture, a, D0, [2]);
    const [voided] = await cashSeries(fixture, a, D0, [1]);
    await q(
      `UPDATE merchant_cash_sales SET status = 'voided', voided_at = now(), void_reason = 'mistake' WHERE id = $1`,
      [voided],
    );
    const [unassigned] = await cashSeries(fixture, null, D0, [1]);
    const s = services([m]);
    const w = await claim(s, m);
    const source = await loadFor(s, w, at(D0));

    // Unpaid invoice items never produce events: product, tx, 3 cash headers, 1 void.
    expect(source.events.map((e) => e.sourceType).sort()).toEqual([
      'merchant_cash_sales',
      'merchant_cash_sales',
      'merchant_cash_sales',
      'merchant_cash_sales',
      'merchant_products',
      'merchant_transactions',
    ]);
    const lines = source.sales
      .map((l) => [
        l.saleId,
        l.productId,
        l.quantity,
        l.source,
        l.environment,
        l.eligible,
        l.exclusionReason,
      ])
      .sort((x, y) => String(x[0]).localeCompare(String(y[0])));
    expect(lines).toEqual(
      [
        [finalized.transactionId, a, 3, 'mcbuse_payment', 'test', true, null],
        [
          pending.requestId,
          a,
          5,
          'mcbuse_payment',
          'unknown',
          false,
          'pending',
        ],
        [
          cancelled.requestId,
          a,
          2,
          'mcbuse_payment',
          'unknown',
          false,
          'cancelled',
        ],
        [cash, a, 2, 'merchant_cash', 'unknown', true, null],
        [voided, a, 1, 'merchant_cash', 'unknown', false, 'voided'],
        [unassigned, null, 1, 'merchant_cash', 'unknown', true, null],
      ].sort((x, y) => String(x[0]).localeCompare(String(y[0]))),
    );
    expect(source.coverage).toMatchObject({
      digitalSalesByEnvironment: { test: 1 },
      cashSales: 2,
      unassignedLines: 1,
      excludedObservations: 3,
      excludedByReason: { pending: 1, cancelled: 1, voided: 1 },
      includesTestPayments: true,
    });
    expect(source.affected).toEqual({
      products: {
        [a]: ['on_hand', 'reserved', 'sales', 'status', 'threshold'],
      },
      merchant: ['sales'],
    });
    expect(source.products[0]).toMatchObject({
      id: a,
      historyStart: localDayStart('2026-07-01', TZ),
    });

    const outcome = await s.processor.processWork(w, { asOf: at(D0) });
    expect(outcome.status).toBe('succeeded');
    expect((await runs(m))[0].coverage).toMatchObject({ cashSales: 2 });
  });

  it('coalesces events into affected products and fields without losing any', async () => {
    const { fixture, productIds, s } = await bootstrapped('Coalesce');
    const m = fixture.merchantId;
    const [p0, p1] = productIds;
    const c = await product(m, { name: 'C' });
    const d = await product(m, { name: 'D' });
    await cashSeries(fixture, p0, addDays(D0, 1), [2]);
    await cashSeries(fixture, null, addDays(D0, 1), [1]);
    const [moved] = await cashSeries(fixture, p1, addDays(D0, 1), [3]);
    await q(
      `UPDATE merchant_cash_sale_items SET product_id = $1 WHERE cash_sale_id = $2`,
      [c, moved],
    );
    await q(
      `UPDATE merchant_products SET on_hand_quantity = 150 WHERE id = $1`,
      [d],
    );
    await q(
      `UPDATE merchant_products SET reserved_quantity = 5 WHERE id = $1`,
      [p0],
    );
    await q(
      `UPDATE merchant_products SET low_stock_threshold = 8 WHERE id = $1`,
      [p1],
    );
    await q(`UPDATE merchants SET timezone = 'Africa/Accra' WHERE id = $1`, [
      m,
    ]);
    await q(`UPDATE merchants SET timezone = $2 WHERE id = $1`, [m, TZ]);

    const w = await claim(s, m);
    const source = await loadFor(s, w, at(D0));
    expect(source.events).toHaveLength(11);
    expect(source.affected).toEqual({
      products: {
        [p0]: ['reserved', 'sales'],
        [p1]: ['sales', 'threshold'],
        [c]: ['on_hand', 'reserved', 'sales', 'status', 'threshold'],
        [d]: ['on_hand', 'reserved', 'status', 'threshold'],
      },
      merchant: ['sales', 'timezone'],
    });
    const outcome = await s.processor.processWork(w, { asOf: at(D0) });
    expect(outcome).toMatchObject({
      status: 'succeeded',
      reason: 'source_change',
    });
    expect(outcome.publish?.events).toBe(11);
    expect(await eventStatuses(m)).toEqual([
      { status: 'processed', n: 11 },
      { status: 'resolved', n: 72 },
    ]);
    // Deleting a sale header loses its lines: every product's sales are re-checked.
    const [gone] = await cashSeries(fixture, p0, addDays(D0, 1), [1]);
    await q(`DELETE FROM merchant_cash_sale_items WHERE cash_sale_id = $1`, [
      gone,
    ]);
    await q(`DELETE FROM merchant_cash_sales WHERE id = $1`, [gone]);
    const w2 = await claim(s, m);
    const after = await loadFor(s, w2, at(D0));
    const affected = after.affected === 'all' ? null : after.affected;
    expect(Object.keys(affected?.products ?? {}).sort()).toEqual(
      [p0, p1, c, d].sort(),
    );
    expect(
      Object.values(affected?.products ?? {}).every((f) => f.includes('sales')),
    ).toBe(true);
    await s.processor.processWork(w2, { asOf: at(D0) });
  });

  it('keeps uncommitted events invisible and leaves commits made during a run pending and due', async () => {
    const { fixture, productIds, s } = await bootstrapped('Concurrent');
    const m = fixture.merchantId;
    const [p0, p1] = productIds;
    const before = await work(m);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE merchant_products SET on_hand_quantity = 3 WHERE id = $1`,
        [p0],
      );
      // The open source transaction holds the work row: nothing to claim, nothing visible.
      expect(await s.queue.claim({ merchantId: m })).toBeNull();
      expect(await eventStatuses(m)).toEqual([{ status: 'resolved', n: 72 }]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const w = await claim(s, m);
    expect(w.claimedRevision).toBe(BigInt(before.requested_revision) + 1n);
    // Committed after the claim: must not be skipped.
    await q(
      `UPDATE merchant_products SET low_stock_threshold = 10 WHERE id = $1`,
      [p1],
    );
    const outcome = await s.processor.processWork(w, { asOf: at(D0) });
    expect(outcome.status).toBe('succeeded');
    expect(outcome.publish?.events).toBe(1);
    expect(await eventStatuses(m)).toEqual([
      { status: 'pending', n: 1 },
      { status: 'processed', n: 1 },
      { status: 'resolved', n: 72 },
    ]);
    const after = await work(m);
    expect(after.processed_revision).toBe(w.claimedRevision.toString());
    expect(BigInt(after.requested_revision)).toBe(w.claimedRevision + 1n);
    expect((await cases(m)).map((c) => [c.product_id, c.case_type])).toEqual([
      [p0, 'stock_risk'],
    ]);

    // The merchant stays due; the next pass picks the later event up.
    const next = await s.processor.tick({ budgetMs: 60_000, asOf: at(D0) });
    expect(next.processed).toBe(1);
    expect(
      (await cases(m)).map((c) => [c.product_id, c.case_type]).sort(),
    ).toEqual(
      [
        [p0, 'stock_risk'],
        [p1, 'stock_threshold_change'],
      ].sort(),
    );
    expect(await eventStatuses(m)).toEqual([
      { status: 'processed', n: 2 },
      { status: 'resolved', n: 72 },
    ]);
  });

  it('publishes nothing after a crash mid-publication, records the failure separately, and retries idempotently', async () => {
    const { fixture, productIds, s } = await bootstrapped('Crash');
    const m = fixture.merchantId;
    const snapshot = {
      states: await states(m),
      cases: await cases(m),
      transitions: await countRows('merchant_change_transitions', m),
      work: await work(m),
    };
    await q(`UPDATE merchant_products SET on_hand_quantity = 0 WHERE id = $1`, [
      productIds[0],
    ]);

    // Every write happened inside the transaction; completion then fails.
    const crash = jest
      .spyOn(s.queue, 'completeInTx')
      .mockRejectedValueOnce(new Error('simulated crash'));
    const failed = await s.processor.processMerchant(m, { asOf: at(D0) });
    crash.mockRestore();
    expect(failed).toMatchObject({ status: 'retry', error: 'simulated crash' });
    expect(await states(m)).toEqual(snapshot.states);
    expect(await cases(m)).toEqual(snapshot.cases);
    expect(await countRows('merchant_change_transitions', m)).toBe(
      snapshot.transitions,
    );
    expect(await eventStatuses(m)).toEqual([
      { status: 'pending', n: 1 },
      { status: 'resolved', n: 72 },
    ]);
    const allRuns = await runs(m);
    expect(allRuns.map((r) => [r.reason, r.status])).toEqual([
      ['initialization', 'succeeded'],
      ['source_change', 'failed'],
    ]);
    expect(allRuns[1].error).toBe('simulated crash');
    expect(await work(m)).toMatchObject({
      processed_revision: snapshot.work.processed_revision,
      attempts: 1,
      backoff_minutes: 1,
      status: 'idle',
      last_error: 'simulated crash',
      lease_token: null,
    });
    // Not due until the backoff passes.
    expect(await s.queue.claim({ merchantId: m })).toBeNull();

    await q(
      `UPDATE merchant_change_work SET next_attempt_at = now() WHERE merchant_id = $1`,
      [m],
    );
    const retried = await s.processor.processMerchant(m, { asOf: at(D0) });
    expect(retried).toMatchObject({
      status: 'succeeded',
      reason: 'source_change',
    });
    expect((await cases(m)).map((c) => [c.case_type, c.priority])).toEqual([
      ['stock_risk', 1],
    ]);
    expect(await work(m)).toMatchObject({
      attempts: 0,
      last_error: null,
      backoff_minutes: null,
    });

    // Replaying the same clock with no new events changes nothing.
    const settled = { states: await states(m), cases: await cases(m) };
    const transitions = await countRows('merchant_change_transitions', m);
    const replay = await s.processor.processMerchant(m, { asOf: at(D0) });
    expect(replay?.publish).toMatchObject({
      states: 0,
      transitions: 0,
      cases: { opened: 0, appended: 0, resolved: 0 },
    });
    expect(await states(m)).toEqual(settled.states);
    expect(await cases(m)).toEqual(settled.cases);
    expect(await countRows('merchant_change_transitions', m)).toBe(transitions);
  });

  it('lets only a valid lease publish: a stale worker is rejected', async () => {
    const { fixture, productIds, s } = await bootstrapped('Lease');
    const m = fixture.merchantId;
    await q(`UPDATE merchant_products SET on_hand_quantity = 2 WHERE id = $1`, [
      productIds[0],
    ]);
    const stale = await claim(s, m);
    await q(
      `UPDATE merchant_change_work SET lease_until = now() - interval '1 second' WHERE merchant_id = $1`,
      [m],
    );
    expect(await s.queue.renew(stale)).toBe(false);

    // Expired but not yet reclaimed: still cannot publish.
    const expired = await s.processor.processWork(stale, { asOf: at(D0) });
    expect(expired).toMatchObject({ status: 'lease_lost' });
    expect(expired.error).toMatch(/lease expired/);

    const fresh = await claim(s, m);
    expect(fresh.token).not.toBe(stale.token);
    expect(await s.queue.isRunning(m)).toBe(true);
    const lost = await s.processor.processWork(stale, { asOf: at(D0) });
    expect(lost.error).toMatch(/token replaced/);
    expect(await runs(m)).toHaveLength(1);
    expect(await eventStatuses(m)).toEqual([
      { status: 'pending', n: 1 },
      { status: 'resolved', n: 72 },
    ]);

    const ok = await s.processor.processWork(fresh, { asOf: at(D0) });
    expect(ok.status).toBe('succeeded');
    expect(await s.queue.isRunning(m)).toBe(false);
    expect((await cases(m)).map((c) => c.case_type)).toEqual(['stock_risk']);
  });

  it('backs off 1, 5, 15 and 60 minutes, then stays failed until an operator retry', async () => {
    const { fixture, productIds, s } = await bootstrapped('Retry');
    const m = fixture.merchantId;
    await q(`UPDATE merchant_products SET on_hand_quantity = 1 WHERE id = $1`, [
      productIds[0],
    ]);
    const outage = jest
      .spyOn(s.loader, 'load')
      .mockRejectedValue(new Error('database unavailable'));
    const statuses: Array<string | undefined> = [];
    const backoffs: Array<number | null> = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await q(
        `UPDATE merchant_change_work SET next_attempt_at = now() - interval '1 second' WHERE merchant_id = $1`,
        [m],
      );
      statuses.push(
        (await s.processor.processMerchant(m, { asOf: at(D0) }))?.status,
      );
      backoffs.push((await work(m)).backoff_minutes);
    }
    expect(statuses).toEqual(['retry', 'retry', 'retry', 'retry', 'failed']);
    expect(backoffs).toEqual([1, 5, 15, 60, null]);
    expect(await work(m)).toMatchObject({ status: 'failed', attempts: 5 });
    expect((await runs(m)).filter((r) => r.status === 'failed')).toHaveLength(
      5,
    );

    // New events keep accumulating but never restart failed work by themselves.
    await q(`UPDATE merchant_products SET on_hand_quantity = 0 WHERE id = $1`, [
      productIds[0],
    ]);
    expect(await s.queue.claim({ merchantId: m })).toBeNull();
    expect(
      (await s.processor.tick({ budgetMs: 60_000, asOf: at(D0) })).processed,
    ).toBe(0);
    expect((await s.queue.backlog()).failed).toBe(1);
    outage.mockRestore();

    expect(await s.queue.operatorRetry(m)).toEqual([m]);
    const ok = await s.processor.processMerchant(m, { asOf: at(D0) });
    expect(ok).toMatchObject({ status: 'succeeded' });
    expect(ok?.publish?.events).toBe(2);
    expect(await work(m)).toMatchObject({ status: 'idle', attempts: 0 });
    expect((await cases(m)).map((c) => [c.case_type, c.priority])).toEqual([
      ['stock_risk', 1],
    ]);
  });

  it('retries serialization failures in-process without recording a failure', async () => {
    const { fixture, productIds, s } = await bootstrapped('Serial');
    const m = fixture.merchantId;
    await q(`UPDATE merchant_products SET on_hand_quantity = 1 WHERE id = $1`, [
      productIds[0],
    ]);
    const conflict = Object.assign(new Error('could not serialize access'), {
      code: '40001',
    });
    const spy = jest
      .spyOn(s.loader, 'load')
      .mockRejectedValueOnce(conflict)
      .mockRejectedValueOnce(conflict);
    const outcome = await s.processor.processMerchant(m, { asOf: at(D0) });
    spy.mockRestore();
    expect(outcome).toMatchObject({ status: 'succeeded', retries: 2 });
    expect((await runs(m)).map((r) => r.status)).toEqual([
      'succeeded',
      'succeeded',
    ]);
  });

  it('processes merchants independently and never claims disabled merchants', async () => {
    const a = await bootstrapped('IndepA');
    const b = await bootstrapped('IndepB');
    const s = services([a.fixture.merchantId, b.fixture.merchantId]);
    await q(
      `UPDATE merchant_products SET on_hand_quantity = 1 WHERE id = ANY($1::uuid[])`,
      [[a.productIds[0], b.productIds[0]]],
    );
    const real = new ChangeSourceLoader();
    jest
      .spyOn(s.loader, 'load')
      .mockImplementation((tx, options) =>
        options.merchantId === a.fixture.merchantId
          ? Promise.reject(new Error('boom'))
          : real.load(tx, options),
      );
    const summary = await s.processor.tick({ budgetMs: 60_000, asOf: at(D0) });
    expect(summary).toMatchObject({ processed: 1, failed: 1, deferred: 1 });
    expect(
      summary.merchants.find((o) => o.status === 'succeeded')?.merchantId,
    ).toBe(b.fixture.merchantId);
    expect((await cases(b.fixture.merchantId)).map((c) => c.case_type)).toEqual(
      ['stock_risk'],
    );
    expect(await cases(a.fixture.merchantId)).toEqual([]);

    // Disabled feature, or a merchant outside the allowlist: events stay pending, nothing is claimed.
    for (const disabled of [
      services([a.fixture.merchantId], undefined, false),
      services([b.fixture.merchantId]),
    ]) {
      await q(
        `UPDATE merchant_change_work SET next_attempt_at = NULL WHERE merchant_id = $1`,
        [a.fixture.merchantId],
      );
      expect(
        await disabled.queue.claim({ merchantId: a.fixture.merchantId }),
      ).toBeNull();
      expect(
        await disabled.processor.processMerchant(a.fixture.merchantId, {
          asOf: at(D0),
        }),
      ).toBeNull();
    }
    expect(await eventStatuses(a.fixture.merchantId)).toEqual([
      { status: 'pending', n: 1 },
      { status: 'resolved', n: 72 },
    ]);
  });

  it('enqueues the daily clock evaluation in the first run after local midnight', async () => {
    const { fixture, s } = await bootstrapped('Clock');
    const m = fixture.merchantId;
    const D1 = addDays(D0, 1);
    // 23:00 on D0+1: the completed day is still D0.
    const late = await s.processor.tick({ budgetMs: 60_000, asOf: at(D0, 22) });
    expect(late).toMatchObject({ processed: 0, scheduled: { clock: 0 } });

    const afterMidnight = new Date(
      localDayStart(addDays(D0, 2), TZ).getTime() + 5 * 60_000,
    );
    const daily = await s.processor.tick({
      budgetMs: 60_000,
      asOf: afterMidnight,
    });
    expect(daily).toMatchObject({
      processed: 1,
      failed: 0,
      scheduled: { clock: 1 },
    });
    expect(daily.merchants[0].reason).toBe('clock');
    expect(daily.nodes.evaluated).toBeGreaterThan(0);
    expect(await work(m)).toMatchObject({
      last_daily_evaluation_date: D1,
      requested_reason: null,
    });
    const activity = (await states(m)).find(
      (st) => st.node_key === 'product_unit_activity',
    );
    expect(activity?.value.day).toBe(D1);

    // The next hourly run in the same local day does nothing.
    const again = await s.processor.tick({
      budgetMs: 60_000,
      asOf: new Date(afterMidnight.getTime() + 3_600_000),
    });
    expect(again).toMatchObject({ processed: 0, scheduled: { clock: 0 } });
    expect((await runs(m)).map((r) => r.reason)).toEqual([
      'initialization',
      'clock',
    ]);
  });

  it('re-evaluates with settings_change when settings change; existing cases keep their settings', async () => {
    const { fixture } = await bootstrapped('Settings', {
      products: 1,
      onHand: 3,
    });
    const m = fixture.merchantId;
    const [opened] = await cases(m);
    expect(opened.settings.minZ).toBe(2.5);

    const tuned = services([m], { minZ: 3 });
    const summary = await tuned.processor.tick({
      budgetMs: 60_000,
      asOf: at(D0, 2),
    });
    expect(summary).toMatchObject({
      processed: 1,
      scheduled: { settingsChange: 1 },
    });
    expect(summary.merchants[0].reason).toBe('settings_change');
    const last = (await runs(m)).at(-1);
    expect(last?.settings.minZ).toBe(3);
    expect(await work(m)).toMatchObject({
      settings_fingerprint: tuned.config.settingsFingerprint,
    });
    const [kept] = await cases(m);
    expect(kept).toMatchObject({ id: opened.id, status: 'active' });
    expect(kept.settings.minZ).toBe(2.5);

    // Settled: no further settings_change.
    const again = await tuned.processor.tick({
      budgetMs: 60_000,
      asOf: at(D0, 3),
    });
    expect(again).toMatchObject({
      processed: 0,
      scheduled: { settingsChange: 0 },
    });
  });

  it('records an explicit model_upgrade run when the stored model version differs', async () => {
    const { fixture, s } = await bootstrapped('Model', { products: 1 });
    const m = fixture.merchantId;
    await q(
      `UPDATE merchant_change_work SET model_version = 'change-intelligence-v0' WHERE merchant_id = $1`,
      [m],
    );
    const summary = await s.processor.tick({
      budgetMs: 60_000,
      asOf: at(D0, 2),
    });
    expect(summary).toMatchObject({
      processed: 1,
      scheduled: { modelUpgrade: 1 },
    });
    expect(summary.merchants[0].reason).toBe('model_upgrade');
    expect(await work(m)).toMatchObject({ model_version: MODEL_VERSION });
    expect((await runs(m)).map((r) => r.reason)).toEqual([
      'initialization',
      'model_upgrade',
    ]);
  });

  it('processes captured reservations, restocks, imports, voids, archives and timezone changes', async () => {
    const { fixture, productIds, s } = await bootstrapped('Capture');
    const m = fixture.merchantId;
    const [p0, p1] = productIds;
    const process = async () => {
      const outcome = await s.processor.processMerchant(m, { asOf: at(D0) });
      expect(outcome?.status).toBe('succeeded');
      return outcome;
    };
    const caseRows = async () =>
      (await cases(m)).map((c) => [
        c.product_id,
        c.case_type,
        c.status,
        c.resolution,
      ]);

    // Reservation: available = on hand − reserved.
    await q(
      `UPDATE merchant_products SET reserved_quantity = 196 WHERE id = $1`,
      [p0],
    );
    await process();
    const available = (await states(m, p0)).find(
      (st) => st.node_key === 'available_stock',
    );
    expect(available?.value).toEqual({
      onHand: 200,
      reserved: 196,
      available: 4,
    });
    expect(await caseRows()).toEqual([[p0, 'stock_risk', 'active', null]]);

    // Restock: the risk resolves.
    await q(
      `UPDATE merchant_products SET on_hand_quantity = 400 WHERE id = $1`,
      [p0],
    );
    await process();
    expect(await caseRows()).toEqual([
      [p0, 'stock_risk', 'resolved', 'stock_normal'],
    ]);

    // Inventory import commit, with the product write it makes.
    const batch = (
      await q<{ id: string }>(
        `INSERT INTO merchant_import_batches (merchant_id, kind, source_name, content_hash, mapping, rows_json, actor_user_id)
         VALUES ($1, 'inventory', 'pos', md5(random()::text), '{}', '[]', $2) RETURNING id`,
        [m, fixture.userId],
      )
    )[0].id;
    await q(
      `INSERT INTO merchant_product_source_mappings (merchant_id, product_id, source_name, external_id) VALUES ($1, $2, 'pos', 'P1')`,
      [m, p1],
    );
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE merchant_products SET on_hand_quantity = 2 WHERE id = $1`,
        [p1],
      );
      await client.query(
        `UPDATE merchant_import_batches SET status = 'committed', committed_at = now() WHERE id = $1`,
        [batch],
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const w = await claim(s, m);
    const imported = await loadFor(s, w, at(D0));
    expect(imported.events.map((e) => e.sourceType).sort()).toEqual([
      'merchant_import_batches',
      'merchant_products',
    ]);
    expect(imported.affected).toEqual({
      products: { [p1]: ['on_hand', 'reserved', 'threshold'] },
      merchant: [],
    });
    expect((await s.processor.processWork(w, { asOf: at(D0) })).status).toBe(
      'succeeded',
    );
    expect((await caseRows()).at(-1)).toEqual([
      p1,
      'stock_risk',
      'active',
      null,
    ]);

    // Void inside the evaluated window: a historical correction for that product only.
    const voidedSale = (
      await q<{ id: string }>(
        `SELECT s.id FROM merchant_cash_sales s JOIN merchant_cash_sale_items i ON i.cash_sale_id = s.id
         WHERE i.product_id = $1 ORDER BY s.occurred_at DESC LIMIT 1`,
        [p1],
      )
    )[0].id;
    await q(
      `UPDATE merchant_cash_sales SET status = 'voided', voided_at = now(), void_reason = 'x' WHERE id = $1`,
      [voidedSale],
    );
    await process();
    const correction = (await cases(m)).find(
      (c) => c.case_type === 'historical_correction',
    );
    expect(correction).toMatchObject({
      product_id: p1,
      status: 'active',
      priority: 5,
    });
    expect(correction?.evidence.facts.correction).toMatchObject({
      recentBefore: 28,
      recentAfter: 24,
    });

    // Archive: the product's cases resolve.
    await q(`UPDATE merchant_products SET status = 'archived' WHERE id = $1`, [
      p1,
    ]);
    await process();
    expect(
      (await cases(m))
        .filter((c) => c.product_id === p1)
        .map((c) => [c.case_type, c.resolution]),
    ).toEqual([
      ['stock_risk', 'product_archived'],
      ['historical_correction', 'product_archived'],
    ]);

    // Timezone change re-evaluates the merchant.
    await q(`UPDATE merchants SET timezone = 'Africa/Accra' WHERE id = $1`, [
      m,
    ]);
    const tz = await process();
    expect(tz?.counts?.evaluated).toBeGreaterThanOrEqual(13);
    expect(await eventStatuses(m)).toEqual([
      { status: 'processed', n: 7 },
      { status: 'resolved', n: 72 },
    ]);
  });

  it('end to end: five weeks of cash sales then a sustained increase confirms a demand case; restock resolves only the stock risk', async () => {
    const fixture = await merchantFixture('Demand');
    const m = fixture.merchantId;
    const a = await product(m, { name: 'Cappuccino', onHand: 40 });
    const b = await product(m, { name: 'Tea', onHand: 40 });
    await cashSeries(fixture, a, D0, [...repeat(4, 28), ...repeat(6, 7)]);
    await cashSeries(fixture, b, D0, repeat(4, 35));
    const s = services([m]);
    expect(
      (await s.processor.tick({ budgetMs: 60_000, asOf: at(D0) })).processed,
    ).toBe(1);
    // Day 1 qualifies but is not yet confirmed.
    expect(await cases(m)).toEqual([]);

    const D1 = addDays(D0, 1);
    await cashSeries(fixture, a, D1, [6]);
    await cashSeries(fixture, b, D1, [4]);
    const day2 = await s.processor.tick({ budgetMs: 60_000, asOf: at(D1) });
    expect(day2).toMatchObject({ processed: 1, failed: 0 });
    const opened = await cases(m);
    expect(
      opened.map((c) => [c.product_id, c.case_type, c.status, c.priority]),
    ).toEqual([
      [a, 'stock_risk', 'active', 3],
      [a, 'unit_demand_increase', 'active', 4],
    ]);
    const demand = opened.find((c) => c.case_type === 'unit_demand_increase')!;
    expect(demand.evidence.facts).toMatchObject({
      recent: 42,
      usual: 28.5,
      weeksUsed: 4,
    });
    const cover = (values: unknown[]) =>
      (values as Array<{ key: string; value: number }>).find(
        (v) => v.key === 'days_to_minimum',
      )?.value;
    expect(cover(demand.evidence.before)).toBeCloseTo(35 / (126 / 28), 6); // previous persisted cover (4.5/day)
    expect(cover(demand.evidence.after)).toBeCloseTo(35 / 6, 6);
    const history = await q<{
      case_id: string;
      explanation: { kind: string; reason: string };
    }>(
      `SELECT case_id, explanation FROM merchant_change_transitions WHERE id = $1`,
      [demand.latest_transition_id],
    );
    expect(history[0]).toMatchObject({
      case_id: demand.id,
      explanation: { kind: 'opened' },
    });

    // Restock A at the same clock: stock risk resolves, demand stays open, B is untouched.
    const productB = await states(m, b);
    await q(
      `UPDATE merchant_products SET on_hand_quantity = 400 WHERE id = $1`,
      [a],
    );
    const restock = await s.processor.processMerchant(m, { asOf: at(D1) });
    expect(restock?.status).toBe('succeeded');
    expect(
      (await cases(m)).map((c) => [c.case_type, c.status, c.resolution]),
    ).toEqual([
      ['stock_risk', 'resolved', 'stock_normal'],
      ['unit_demand_increase', 'active', null],
    ]);
    expect(await states(m, b)).toEqual(productB);
    expect(restock?.counts?.evaluated).toBeLessThan(12);
  });
});
