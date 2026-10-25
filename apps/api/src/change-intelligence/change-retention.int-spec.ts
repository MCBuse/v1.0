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
import { ChangeIntelligenceConfig } from './change-intelligence.config';
import { ChangeProcessorService } from './change-processor.service';
import { ChangePublisherService } from './change-publisher.service';
import { ChangeReadService } from './change-read.service';
import {
  ChangeRetentionService,
  DEFAULT_RETENTION,
  retentionSettings,
} from './change-retention.service';
import { ChangeSourceLoader } from './change-source.loader';
import { ChangeWorkQueueService } from './change-work-queue.service';
import { asOfAfter } from './engine/fixtures';
import { addDays, localDayStart } from './engine/local-time';

/** Plan §8 retention / §9.2 "safe retention" against a real Postgres. */
describe('Change Intelligence retention (integration)', () => {
  const TZ = 'Europe/Berlin';
  const D0 = '2026-09-20';
  let db: TestDatabase;
  let pool: Pool;
  let m: MerchantFixture;
  let other: MerchantFixture;
  let processor: ChangeProcessorService;
  let reads: ChangeReadService;
  let retention: ChangeRetentionService;
  let publicId: string;

  const q = async <T = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ) => (await pool.query(text, values)).rows as T[];
  const count = async (text: string, merchantId = m.merchantId) =>
    Number((await q<{ n: string }>(text, [merchantId]))[0].n);

  const product = async (
    fixture: MerchantFixture,
    name: string,
    onHand: number,
  ) =>
    (
      await q<{ id: string }>(
        `INSERT INTO merchant_products (merchant_id, name, unit_price_minor, on_hand_quantity, low_stock_threshold, created_at)
         VALUES ($1, $2, 250, $3, 5, $4) RETURNING id`,
        [fixture.merchantId, name, onHand, localDayStart('2026-07-01', TZ)],
      )
    )[0].id;
  const sale = (fixture: MerchantFixture, productId: string, day: string) =>
    q(
      `WITH s AS (INSERT INTO merchant_cash_sales (merchant_id, receipt_number, amount_minor, occurred_at, actor_user_id, idempotency_key)
         VALUES ($1, 'CS-' || substr(md5(random()::text), 1, 20), 250, ($3::date + time '12:00') AT TIME ZONE $4, $2, gen_random_uuid()::text)
         RETURNING id)
       INSERT INTO merchant_cash_sale_items (cash_sale_id, product_id, type, name, quantity, unit_price_minor, line_total_minor)
       SELECT id, $5, 'product', 'Line', 1, 250, 250 FROM s`,
      [fixture.merchantId, fixture.userId, day, TZ, productId],
    );

  const snapshot = async () => ({
    pendingEvents: await count(
      `SELECT count(*) n FROM merchant_change_events WHERE merchant_id = $1 AND status = 'pending'`,
    ),
    processedEvents: await count(
      `SELECT count(*) n FROM merchant_change_events WHERE merchant_id = $1 AND status <> 'pending'`,
    ),
    states: await q<{ id: string; fingerprint: string; version: string }>(
      `SELECT id, fingerprint, version::text FROM merchant_change_states WHERE merchant_id = $1 ORDER BY id`,
      [m.merchantId],
    ),
    activeCases: await q<{ id: string; latest_transition_id: string }>(
      `SELECT id, latest_transition_id FROM merchant_change_cases WHERE merchant_id = $1 AND status = 'active' ORDER BY id`,
      [m.merchantId],
    ),
    activeCaseTransitions: await count(
      `SELECT count(*) n FROM merchant_change_transitions t JOIN merchant_change_cases c ON c.id = t.case_id
       WHERE t.merchant_id = $1 AND c.status = 'active'`,
    ),
    resolvedCases: await count(
      `SELECT count(*) n FROM merchant_change_cases WHERE merchant_id = $1 AND status = 'resolved'`,
    ),
    nodeTransitions: await count(
      `SELECT count(*) n FROM merchant_change_transitions WHERE merchant_id = $1 AND case_id IS NULL`,
    ),
    runs: await count(
      `SELECT count(*) n FROM merchant_change_runs WHERE merchant_id = $1`,
    ),
  });

  beforeAll(async () => {
    ({ db, pool } = await connectTestDatabase());
    [m, other] = await Promise.all([
      createMerchantFixture(db, 'RetKeep'),
      createMerchantFixture(db, 'RetOther'),
    ]);
    publicId = (
      await q<{ public_id: string }>(
        'SELECT public_id FROM merchants WHERE id = $1',
        [m.merchantId],
      )
    )[0].public_id;
    const config = new ChangeIntelligenceConfig({
      MERCHANT_CHANGE_INTELLIGENCE_ENABLED: 'true',
      MERCHANT_CHANGE_INTELLIGENCE_ALLOWLIST: `${m.merchantId},${other.merchantId}`,
    });
    const queue = new ChangeWorkQueueService(db, config);
    processor = new ChangeProcessorService(
      db,
      config,
      queue,
      new ChangeSourceLoader(),
      new ChangePublisherService(queue),
    );
    reads = new ChangeReadService(db, config);
    retention = new ChangeRetentionService(db);

    for (const fixture of [m, other]) {
      const empty = await product(fixture, 'Croissant', 0); // stays out of stock: active case
      const low = await product(fixture, 'Sourdough', 2); // low, then restocked: resolved case
      for (let i = 0; i < 30; i += 1) {
        await sale(fixture, empty, addDays(D0, -i));
        await sale(fixture, low, addDays(D0, -i));
      }
      expect(
        (
          await processor.processMerchant(fixture.merchantId, {
            asOf: asOfAfter(D0, TZ),
          })
        )?.status,
      ).toBe('succeeded');
      await q(
        'UPDATE merchant_products SET on_hand_quantity = 40 WHERE id = $1',
        [low],
      );
      expect(
        (
          await processor.processMerchant(fixture.merchantId, {
            asOf: asOfAfter(D0, TZ, 3),
          })
        )?.status,
      ).toBe('succeeded');
      // A later, unprocessed event.
      await sale(fixture, low, D0);
    }
  });

  afterAll(async () => {
    for (const fixture of [m, other])
      if (fixture) await destroyMerchantFixture(db, fixture);
    await pool?.end();
  });

  it('reads configurable values and refuses invalid ones', () => {
    expect(retentionSettings({})).toEqual(DEFAULT_RETENTION);
    expect(DEFAULT_RETENTION).toMatchObject({
      eventDays: 90,
      historyDays: 365,
    });
    expect(
      retentionSettings({
        CHANGE_INTELLIGENCE_RETENTION_EVENT_DAYS: '30',
        CHANGE_INTELLIGENCE_RETENTION_BATCH_SIZE: '200',
      }),
    ).toEqual({ ...DEFAULT_RETENTION, eventDays: 30, batchSize: 200 });
    for (const [key, value] of [
      ['CHANGE_INTELLIGENCE_RETENTION_EVENT_DAYS', '0'],
      ['CHANGE_INTELLIGENCE_RETENTION_HISTORY_DAYS', '7'],
      ['CHANGE_INTELLIGENCE_RETENTION_BATCH_SIZE', '1.5'],
      ['CHANGE_INTELLIGENCE_RETENTION_MAX_BATCHES', 'many'],
    ])
      expect(() => retentionSettings({ [key]: value })).toThrow(key);
  });

  it('deletes nothing that is younger than the default retention', async () => {
    const before = await snapshot();
    expect(
      await retention.run(DEFAULT_RETENTION, { merchantId: m.merchantId }),
    ).toEqual({ events: 0, cases: 0, transitions: 0, runs: 0, complete: true });
    expect(await snapshot()).toEqual(before);
  });

  it('is bounded: one batch per table per execution, the rest waits', async () => {
    const processed = () =>
      count(
        `SELECT count(*) n FROM merchant_change_events WHERE merchant_id = $1 AND status <> 'pending'`,
        other.merchantId,
      );
    const before = await processed();
    const result = await retention.run(
      { eventDays: 0, historyDays: 0, batchSize: 1, maxBatches: 1 },
      { merchantId: other.merchantId },
    );
    expect(result.complete).toBe(false);
    expect(result.events).toBe(1);
    for (const n of [result.cases, result.transitions, result.runs])
      expect(n).toBeLessThanOrEqual(1);
    expect(await processed()).toBe(before - 1);
  });

  it('9.2.retention-safe: with everything past retention, only unprotected history goes', async () => {
    const before = await snapshot();
    expect(before.pendingEvents).toBeGreaterThan(0);
    expect(before.activeCases.length).toBeGreaterThan(0);
    expect(before.resolvedCases).toBeGreaterThan(0);
    const otherBefore = await count(
      `SELECT count(*) n FROM merchant_change_runs WHERE merchant_id = $1`,
      other.merchantId,
    );

    const result = await retention.run(
      { eventDays: 0, historyDays: 0, batchSize: 1000, maxBatches: 10 },
      { merchantId: m.merchantId },
    );
    expect(result.complete).toBe(true);
    const after = await snapshot();

    // Kept: unprocessed events, current states, active cases with their history.
    expect(after.pendingEvents).toBe(before.pendingEvents);
    expect(after.states).toEqual(before.states);
    expect(after.activeCases).toEqual(before.activeCases);
    expect(after.activeCaseTransitions).toBe(before.activeCaseTransitions);
    // Removed: processed event detail and resolved cases (with their own transitions).
    expect(after.processedEvents).toBe(0);
    expect(after.resolvedCases).toBe(0);
    expect(result.cases).toBeGreaterThan(0);

    // Every remaining run is referenced or the latest successful one.
    const orphans = await q(
      `SELECT r.id FROM merchant_change_runs r WHERE r.merchant_id = $1
        AND NOT EXISTS (SELECT 1 FROM merchant_change_states s WHERE s.run_id = r.id)
        AND NOT EXISTS (SELECT 1 FROM merchant_change_transitions t WHERE t.run_id = r.id)
        AND NOT EXISTS (SELECT 1 FROM merchant_change_events e WHERE e.run_id = r.id)
        AND r.id <> (SELECT id FROM merchant_change_runs WHERE merchant_id = $1 AND status = 'succeeded'
          ORDER BY completed_at DESC, id DESC LIMIT 1)`,
      [m.merchantId],
    );
    expect(orphans).toEqual([]);
    // Every case points at a transition that still exists.
    expect(
      await count(
        `SELECT count(*) n FROM merchant_change_cases c WHERE c.merchant_id = $1
          AND NOT EXISTS (SELECT 1 FROM merchant_change_transitions t WHERE t.id = c.latest_transition_id)`,
      ),
    ).toBe(0);

    // The merchant read side still works on what is left.
    const merchant = { merchantId: m.merchantId, publicId, timezone: TZ };
    const status = await reads.status(merchant);
    expect(status.lastSuccessfulAnalysisAt).not.toBeNull();
    for (const c of after.activeCases)
      expect((await reads.detail(merchant, c.id)).change.id).toBe(c.id);

    // Scoped: the other merchant is untouched. Idempotent: nothing more to delete.
    expect(
      await count(
        `SELECT count(*) n FROM merchant_change_runs WHERE merchant_id = $1`,
        other.merchantId,
      ),
    ).toBe(otherBefore);
    expect(
      await retention.run(
        { eventDays: 0, historyDays: 0, batchSize: 1000, maxBatches: 10 },
        { merchantId: m.merchantId },
      ),
    ).toEqual({ events: 0, cases: 0, transitions: 0, runs: 0, complete: true });

    // Processing continues normally after retention.
    expect(
      (
        await processor.processMerchant(m.merchantId, {
          asOf: asOfAfter(D0, TZ, 5),
        })
      )?.status,
    ).toBe('succeeded');
  });

  it('operator rebuild requests a labelled full re-evaluation (model_upgrade / reconciliation)', async () => {
    const queue = new ChangeWorkQueueService(
      db,
      new ChangeIntelligenceConfig({
        MERCHANT_CHANGE_INTELLIGENCE_ENABLED: 'true',
        MERCHANT_CHANGE_INTELLIGENCE_ALLOWLIST: other.merchantId,
      }),
    );
    // Not enabled under this configuration: nothing requested.
    expect(await queue.requestRebuild('model_upgrade', m.merchantId)).toEqual(
      [],
    );
    for (const reason of ['model_upgrade', 'reconciliation'] as const) {
      expect(await queue.requestRebuild(reason)).toEqual([other.merchantId]);
      const outcome = await processor.processMerchant(other.merchantId, {
        asOf: asOfAfter(D0, TZ, 6),
      });
      expect(outcome).toMatchObject({ status: 'succeeded', reason });
      const [run] = await q<{ reason: string }>(
        'SELECT reason FROM merchant_change_runs WHERE id = $1',
        [outcome?.runId],
      );
      expect(run.reason).toBe(reason);
    }
  });
});
