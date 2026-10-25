import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import {
  connectTestDatabase,
  type TestDatabase,
} from '../database/testing/test-database';
import {
  createMerchantFixture,
  destroyMerchantFixture,
  type MerchantFixture,
} from '../database/testing/merchant-fixture';
import { GroqNarrationService } from '../analytics-intelligence/groq-narration.service';
import { MerchantInsightsService } from '../analytics-intelligence/merchant-insights.service';
import { ChangeIntelligenceConfig } from './change-intelligence.config';
import { ChangePublisherService } from './change-publisher.service';
import { ChangeProcessorService } from './change-processor.service';
import { ChangeReadService } from './change-read.service';
import { ChangeSourceLoader } from './change-source.loader';
import { ChangeWorkQueueService } from './change-work-queue.service';
import { asOfAfter, repeat } from './engine/fixtures';
import { addDays, localDate, localDayStart } from './engine/local-time';

/**
 * Plan §8 "Release and rollback" (Stage 7B): the feature flag rollback and an
 * independent capture gap followed by a reconciliation run.
 */
const TZ = 'Europe/Berlin';
const D0 = '2026-09-20';
const at = (day: string, hour = 1) => asOfAfter(day, TZ, hour);

/** Every Change Intelligence capture trigger, named explicitly (runbook §8.2). */
const CAPTURE_TRIGGERS: Array<[string, string[]]> = [
  ['merchant_transactions', ['insert', 'update', 'delete']],
  ['merchant_cash_sales', ['insert', 'update', 'delete']],
  ['merchant_cash_sale_items', ['update', 'delete']],
  ['merchant_products', ['insert', 'update', 'delete']],
  ['merchant_import_batches', ['update']],
  ['merchants', ['update']],
];
const TRIGGER_PREFIX: Record<string, string> = {
  merchant_transactions: 'transactions',
  merchant_cash_sales: 'cash_sales',
  merchant_cash_sale_items: 'cash_sale_items',
  merchant_products: 'products',
  merchant_import_batches: 'import_batches',
  merchants: 'merchants',
};
const captureSql = (action: 'ENABLE' | 'DISABLE') =>
  CAPTURE_TRIGGERS.map(
    ([table, ops]) =>
      `ALTER TABLE ${table} ${ops
        .map(
          (op) =>
            `${action} TRIGGER change_capture_${TRIGGER_PREFIX[table]}_${op}`,
        )
        .join(', ')}`,
  ).join(';\n');

describe('change intelligence rollback and capture gap (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  const fixtures: MerchantFixture[] = [];

  const q = async <T = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ) => (await pool.query(text, values)).rows as T[];

  const stack = (merchantIds: string[], enabled: boolean) => {
    const config = new ChangeIntelligenceConfig({
      MERCHANT_CHANGE_INTELLIGENCE_ENABLED: String(enabled),
      MERCHANT_CHANGE_INTELLIGENCE_ALLOWLIST: merchantIds.join(','),
    });
    const queue = new ChangeWorkQueueService(db, config);
    const processor = new ChangeProcessorService(
      db,
      config,
      queue,
      new ChangeSourceLoader(),
      new ChangePublisherService(queue),
    );
    const reads = new ChangeReadService(db, config);
    const appConfig = new ConfigService({
      MERCHANT_PORTAL_ENABLED: 'true',
      MERCHANT_INTELLIGENCE_ENABLED: 'true',
    });
    const insights = new MerchantInsightsService(
      db,
      appConfig,
      new GroqNarrationService(db, appConfig),
      reads,
    );
    return { config, queue, processor, reads, insights };
  };

  const merchant = async (label: string) => {
    const fixture = await createMerchantFixture(db, label);
    fixtures.push(fixture);
    const [row] = await q<{ public_id: string }>(
      `SELECT public_id FROM merchants WHERE id = $1`,
      [fixture.merchantId],
    );
    return {
      fixture,
      identity: {
        merchantId: fixture.merchantId,
        publicId: row.public_id,
        timezone: TZ,
      },
    };
  };

  const product = async (
    merchantId: string,
    options: { name: string; onHand: number; threshold?: number },
  ) =>
    (
      await q<{ id: string }>(
        `INSERT INTO merchant_products (merchant_id, name, unit_price_minor, on_hand_quantity, low_stock_threshold, created_at)
         VALUES ($1, $2, 250, $3, $4, $5) RETURNING id`,
        [
          merchantId,
          options.name,
          options.onHand,
          options.threshold ?? 5,
          localDayStart('2026-07-01', TZ),
        ],
      )
    )[0].id;

  const cashSeries = async (
    fixture: MerchantFixture,
    productId: string,
    lastDay: string,
    daily: number[],
  ) => {
    const days = daily.map((_, i) => addDays(lastDay, i - daily.length + 1));
    await q(
      `WITH days AS (SELECT d, n FROM unnest($3::date[], $4::int[]) AS t(d, n) WHERE n > 0),
       sales AS (
         INSERT INTO merchant_cash_sales (merchant_id, receipt_number, amount_minor, occurred_at, actor_user_id, idempotency_key)
         SELECT $1, 'CS-' || substr(md5(random()::text), 1, 20), 250 * n, (d + time '12:00') AT TIME ZONE $5, $2,
           gen_random_uuid()::text FROM days RETURNING id, amount_minor)
       INSERT INTO merchant_cash_sale_items (cash_sale_id, product_id, type, name, quantity, unit_price_minor, line_total_minor)
       SELECT id, $6, 'product', 'Line', (amount_minor / 250)::int, 250, amount_minor FROM sales`,
      [fixture.merchantId, fixture.userId, days, daily, TZ, productId],
    );
  };

  const counts = async (merchantId: string) =>
    (
      await q<Record<string, number>>(
        `SELECT
           (SELECT count(*)::int FROM merchant_change_runs WHERE merchant_id = $1) AS runs,
           (SELECT count(*)::int FROM merchant_change_states WHERE merchant_id = $1) AS states,
           (SELECT count(*)::int FROM merchant_change_transitions WHERE merchant_id = $1) AS transitions,
           (SELECT count(*)::int FROM merchant_change_cases WHERE merchant_id = $1) AS cases,
           (SELECT count(*)::int FROM merchant_change_events WHERE merchant_id = $1) AS events,
           (SELECT count(*)::int FROM merchant_change_events WHERE merchant_id = $1 AND status = 'pending') AS pending,
           (SELECT requested_revision::int FROM merchant_change_work WHERE merchant_id = $1) AS requested`,
        [merchantId],
      )
    )[0];

  const casesOf = (merchantId: string) =>
    q<{
      case_type: string;
      status: string;
      evidence: { facts: Record<string, unknown> };
    }>(
      `SELECT case_type, status, evidence FROM merchant_change_cases
       WHERE merchant_id = $1 ORDER BY created_at, case_type`,
      [merchantId],
    );

  const stateValue = async (
    merchantId: string,
    productId: string,
    node: string,
  ) =>
    (
      await q<{ value: Record<string, unknown> }>(
        `SELECT value FROM merchant_change_states WHERE merchant_id = $1 AND product_id = $2 AND node_key = $3`,
        [merchantId, productId, node],
      )
    )[0]?.value;

  beforeAll(async () => {
    ({ db, pool } = await connectTestDatabase());
  });

  afterAll(async () => {
    // Never leave capture disabled for the rest of the suite.
    await pool.query(captureSql('ENABLE')).catch(() => undefined);
    for (const fixture of fixtures) await destroyMerchantFixture(db, fixture);
    await pool.end();
  });

  it('rollback: disabling the flag stops processing, Changes is unavailable, Deep Analytics is legacy, records kept; re-enable resumes', async () => {
    const { fixture, identity } = await merchant('Rollback');
    const m = fixture.merchantId;
    const bagel = await product(m, { name: 'Bagel', onHand: 20 });
    // Relative to the real clock: the legacy engine has no injectable asOf.
    const yesterday = addDays(localDate(new Date(), TZ), -1);
    await cashSeries(fixture, bagel, yesterday, repeat(4, 35));

    const on = stack([m], true);
    expect((await on.processor.processMerchant(m))?.status).toBe('succeeded');
    expect(await on.insights.runForMerchant(m)).toEqual({ processed: true });
    const codes = async (s: ReturnType<typeof stack>) =>
      (await s.insights.getForUser(fixture.userId)).insights.map((i) => i.code);
    expect(await codes(on)).toContain(`change.stock_risk.${bagel}`);
    expect(await codes(on)).not.toContain(`stock_risk.${bagel}`);
    const kept = await counts(m);
    expect(kept.cases).toBe(1);

    // Rollback: the same records, flag off on the worker and the API.
    const off = stack([m], false);
    await q(
      `UPDATE merchant_products SET on_hand_quantity = 18 WHERE id = $1`,
      [bagel],
    );
    const tick = await off.processor.tick({ budgetMs: 60_000 });
    expect(tick).toMatchObject({ processed: 0, failed: 0 });
    expect(await off.processor.processMerchant(m)).toBeNull();
    const status = await off.reads.status(identity);
    expect(status).toMatchObject({
      available: false,
      unavailableReason: 'disabled',
    });
    await expect(off.reads.list(identity, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(
      await off.reads.deepAnalyticsInsights({
        id: m,
        publicId: identity.publicId,
        isActive: true,
      }),
    ).toBeNull();
    // Legacy recalculation restores the legacy stock-risk code.
    expect(await off.insights.runForMerchant(m)).toEqual({ processed: true });
    const legacy = await codes(off);
    expect(legacy).toContain(`stock_risk.${bagel}`);
    expect(legacy.filter((c) => c.startsWith('change.'))).toEqual([]);
    // Nothing deleted; the source write is captured and waits.
    // (`processMerchant` above also marks the work due; it stays durable.)
    const { requested, ...rest } = await counts(m);
    const { requested: keptRequested, ...keptRest } = kept;
    expect(rest).toEqual({
      ...keptRest,
      events: kept.events + 1,
      pending: 1,
    });
    expect(requested).toBeGreaterThan(keptRequested);

    // Re-enable: the pending work is processed and the adapter is authoritative again.
    const back = stack([m], true);
    const resumed = await back.processor.tick({ budgetMs: 60_000 });
    expect(resumed).toMatchObject({ processed: 1, failed: 0 });
    expect(resumed.merchants[0].reason).toBe('source_change');
    expect((await counts(m)).pending).toBe(0);
    expect(await back.reads.status(identity)).toMatchObject({
      available: true,
      initialized: true,
      processing: 'idle',
    });
    expect(await back.insights.runForMerchant(m)).toEqual({ processed: true });
    expect(await codes(back)).toContain(`change.stock_risk.${bagel}`);
    expect(
      ((await stateValue(m, bagel, 'available_stock')) as { available: number })
        .available,
    ).toBe(18);
  });

  it('capture gap: writes with capture disabled produce no events; reconciliation restores state and reports the threshold change', async () => {
    const { fixture, identity } = await merchant('Gap');
    const m = fixture.merchantId;
    const latte = await product(m, { name: 'Latte', onHand: 200 });
    await cashSeries(fixture, latte, D0, repeat(4, 35));
    const s = stack([m], true);
    expect(
      (await s.processor.processMerchant(m, { asOf: at(D0) }))?.status,
    ).toBe('succeeded');
    // Initialization never reports a threshold change.
    expect((await casesOf(m)).map((c) => c.case_type)).not.toContain(
      'stock_threshold_change',
    );
    const before = await counts(m);
    const lastSuccess = (await s.reads.status(identity))
      .lastSuccessfulAnalysisAt;
    expect(lastSuccess).not.toBeNull();

    await pool.query(captureSql('DISABLE'));
    try {
      await q(
        `UPDATE merchant_products SET low_stock_threshold = 10, on_hand_quantity = 8 WHERE id = $1`,
        [latte],
      );
      await cashSeries(fixture, latte, D0, [3]);
    } finally {
      await pool.query(captureSql('ENABLE'));
    }
    // No events, no revision bump: the gap is invisible to the worker.
    expect(await counts(m)).toEqual(before);
    expect(
      await s.processor.tick({ budgetMs: 60_000, asOf: at(D0, 5) }),
    ).toMatchObject({ processed: 0 });
    expect(
      (await stateValue(m, latte, 'minimum_stock_policy')) as {
        minimum: number;
      },
    ).toEqual({ minimum: 5 });

    // Runbook §8.3: request a reconciliation; until it runs, the status is pending, not fresh.
    expect(await s.queue.requestRebuild('reconciliation', m)).toEqual([m]);
    const waiting = await s.reads.status(identity);
    expect(waiting.processing).toBe('pending');
    expect(waiting.pendingSince).not.toBeNull();
    expect(waiting.lastSuccessfulAnalysisAt).toBe(lastSuccess);

    const run = await s.processor.tick({ budgetMs: 60_000, asOf: at(D0, 6) });
    expect(run).toMatchObject({ processed: 1, failed: 0 });
    expect(run.merchants[0].reason).toBe('reconciliation');
    expect(await stateValue(m, latte, 'minimum_stock_policy')).toEqual({
      minimum: 10,
    });
    expect(await stateValue(m, latte, 'available_stock')).toEqual({
      onHand: 8,
      reserved: 0,
      available: 8,
    });
    const units = (await stateValue(m, latte, 'product_unit_activity')) as {
      recent: number;
    };
    expect(units.recent).toBe(31);
    const opened = await casesOf(m);
    expect(opened.map((c) => [c.case_type, c.status])).toEqual(
      expect.arrayContaining([
        ['stock_risk', 'active'],
        ['stock_threshold_change', 'active'],
      ]),
    );
    expect(
      opened.find((c) => c.case_type === 'stock_threshold_change')?.evidence
        .facts,
    ).toMatchObject({ previousMinimum: 5, minimum: 10 });
    const after = await s.reads.status(identity);
    expect(after.processing).toBe('idle');
    expect(after.lastSuccessfulAnalysisAt).not.toBe(lastSuccess);
  });
});
