import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import type {
  ChangeCaseSummary,
  ChangeDetailResponse,
  ChangeListResponse,
  ChangeRunEvidence,
  ChangeStatusResponse,
  MerchantInsightsResponse,
} from '@repo/shared';
import {
  connectTestDatabase,
  type TestDatabase,
} from '../database/testing/test-database';
import {
  createMerchantFixture,
  destroyMerchantFixture,
  type MerchantFixture,
} from '../database/testing/merchant-fixture';
import * as schema from '../database/schema';
import { DRIZZLE } from '../database/database.provider';
import { globalValidationPipe } from '../common/pipes/validation.pipe';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { MerchantController } from '../data-capture/merchant.controller';
import { MerchantService } from '../data-capture/merchant.service';
import { MerchantInventoryService } from '../data-capture/merchant-inventory.service';
import { MerchantActivityService } from '../data-capture/merchant-activity.service';
import { MerchantImportService } from '../data-capture/merchant-import.service';
import { MerchantFinanceService } from '../data-capture/merchant-finance.service';
import { MerchantEvidenceAttachmentService } from '../data-capture/merchant-evidence-attachment.service';
import { GeneralAnalyticsService } from '../data-capture/analytics/general-analytics.service';
import { MerchantAssessmentService } from '../data-capture/assessment/merchant-assessment.service';
import type { MerchantImageService } from '../data-capture/merchant-image.service';
import type { RatesService } from '../rates/rates.service';
import type { AnalyticsWorkQueueService } from '../analytics-intelligence/analytics-work-queue.service';
import { MerchantInsightsService } from '../analytics-intelligence/merchant-insights.service';
import { GroqNarrationService } from '../analytics-intelligence/groq-narration.service';
import { ChangeIntelligenceConfig } from './change-intelligence.config';
import { ChangeController } from './change.controller';
import { ChangeReadService } from './change-read.service';
import { ChangePublisherService } from './change-publisher.service';
import { ChangeProcessorService } from './change-processor.service';
import { ChangeSourceLoader } from './change-source.loader';
import { ChangeWorkQueueService } from './change-work-queue.service';
import { asOfAfter, repeat } from './engine/fixtures';
import { addDays, localDate, localDayStart } from './engine/local-time';

/**
 * Plan §7 / Stage 4: the Changes API and Deep Analytics compatibility,
 * through the real controllers, validation pipe, exception filter and a real
 * Postgres. Cases come from the real worker with an injected `asOf`.
 */
class TestIdentity implements CanActivate {
  canActivate(c: ExecutionContext) {
    const r = c.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: { id: string | undefined };
    }>();
    r.user = { id: r.headers['x-test-user'] };
    return Boolean(r.user.id);
  }
}

const TZ = 'Europe/Berlin';
const D0 = '2026-09-20';
const D1 = addDays(D0, 1);
const at = (day: string, hour = 1) => asOfAfter(day, TZ, hour);

/** Keys that must never reach a merchant response (§3.6). */
const FORBIDDEN_KEYS = [
  'z',
  'variance',
  'spikeAdjustedRecent',
  'evidence',
  'facts',
  'nodeKey',
  'node_key',
  'leaseToken',
  'lease_token',
  'fingerprint',
  'settingsFingerprint',
  'transitionRefs',
  'parentTransitionIds',
  'eventId',
  'counts',
  'error',
  'lastError',
  'stack',
];
const NODE_KEY_TEXT =
  /merchant_recording_activity|product_(unit|transaction)_activity|adjusted_daily_demand|baseline_daily_demand|stock_cover|projected_stock_dates|replenishment_guidance|minimum_stock_policy|available_stock|unit_demand_change|transaction_change|case:/;

function scan(value: unknown, path = '$'): string[] {
  if (Array.isArray(value))
    return value.flatMap((v, i) => scan(v, `${path}[${i}]`));
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([key, v]) => [
      ...(FORBIDDEN_KEYS.includes(key) ? [`${path}.${key}`] : []),
      ...scan(v, `${path}.${key}`),
    ]);
  return typeof value === 'string' && NODE_KEY_TEXT.test(value)
    ? [`${path}=${value}`]
    : [];
}

describe('Changes API and Deep Analytics compatibility (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let app: INestApplication;
  let config: ChangeIntelligenceConfig;
  let processor: ChangeProcessorService;
  let insights: MerchantInsightsService;
  const fixtures: MerchantFixture[] = [];
  let strangerId: string;

  // Merchants
  let demand: MerchantFixture; // A shifted up, B steady → stock risk + demand case
  let many: MerchantFixture; // 12 low/out-of-stock products, no sales
  let other: MerchantFixture; // another tenant with a case and run
  let calm: MerchantFixture; // steady sales, plenty of stock: no changes
  let fresh: MerchantFixture; // enabled, never analysed
  let off: MerchantFixture; // not in the allowlist
  let legacyOn: MerchantFixture; // CI enabled + initialized: adapter insights
  let legacyOff: MerchantFixture; // CI not enabled: legacy insights
  let productA: string;
  let productB: string;
  let otherProduct: string;
  let otherRunId: string;

  const http = () =>
    request(app.getHttpServer() as unknown as Parameters<typeof request>[0]);
  const get = (path: string, user: string) =>
    http().get(path).set('x-test-user', user);

  const q = async <T = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ) => (await pool.query(text, values)).rows as T[];

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

  /** One cash sale per day at local noon, `daily[last]` on `lastDay`. */
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

  const merchant = async (label: string) => {
    const fixture = await createMerchantFixture(db, label);
    fixtures.push(fixture);
    return fixture;
  };

  const casesOf = (merchantId: string) =>
    q<{
      id: string;
      case_type: string;
      product_id: string;
      latest_transition_id: string;
    }>(
      `SELECT id, case_type, product_id, latest_transition_id FROM merchant_change_cases
       WHERE merchant_id = $1 ORDER BY priority, case_type`,
      [merchantId],
    );

  beforeAll(async () => {
    ({ db, pool } = await connectTestDatabase());
    [demand, many, other, calm, fresh, off, legacyOn, legacyOff] =
      await Promise.all(
        [
          'ChDemand',
          'ChMany',
          'ChOther',
          'ChCalm',
          'ChFresh',
          'ChOff',
          'ChLegOn',
          'ChLegOff',
        ].map(merchant),
      );
    const [stranger] = await db
      .insert(schema.users)
      .values({
        username: `chs${randomUUID().slice(0, 8)}`,
        firstName: 'Not',
        lastName: 'Owner',
      })
      .returning({ id: schema.users.id });
    strangerId = stranger.id;

    config = new ChangeIntelligenceConfig({
      MERCHANT_CHANGE_INTELLIGENCE_ENABLED: 'true',
      MERCHANT_CHANGE_INTELLIGENCE_ALLOWLIST: [
        demand,
        many,
        other,
        calm,
        fresh,
        legacyOn,
      ]
        .map((f) => f.merchantId)
        .join(','),
    });
    const queue = new ChangeWorkQueueService(db, config);
    processor = new ChangeProcessorService(
      db,
      config,
      queue,
      new ChangeSourceLoader(),
      new ChangePublisherService(queue),
    );
    const appConfig = new ConfigService({
      MERCHANT_PORTAL_ENABLED: 'true',
      MERCHANT_INTELLIGENCE_ENABLED: 'true',
    });
    const reads = new ChangeReadService(db, config);
    const merchants = new MerchantService(db, {} as RatesService, appConfig);
    const inventory = new MerchantInventoryService(
      db,
      merchants,
      {} as RatesService,
      { publicUrl: () => null } as unknown as MerchantImageService,
      {
        enqueue: () => Promise.resolve(),
      } as unknown as AnalyticsWorkQueueService,
    );
    insights = new MerchantInsightsService(
      db,
      appConfig,
      new GroqNarrationService(db, appConfig),
      reads,
    );

    const mod = await Test.createTestingModule({
      controllers: [ChangeController, MerchantController],
      providers: [
        { provide: DRIZZLE, useValue: db },
        { provide: ConfigService, useValue: appConfig },
        { provide: ChangeReadService, useValue: reads },
        { provide: MerchantService, useValue: merchants },
        { provide: MerchantInventoryService, useValue: inventory },
        { provide: MerchantInsightsService, useValue: insights },
        { provide: MerchantActivityService, useValue: {} },
        { provide: MerchantImportService, useValue: {} },
        { provide: MerchantFinanceService, useValue: {} },
        { provide: MerchantEvidenceAttachmentService, useValue: {} },
        { provide: GeneralAnalyticsService, useValue: {} },
        { provide: MerchantAssessmentService, useValue: {} },
        // Production applies JwtAuthGuard globally (APP_GUARD); the test identity stands in for it.
        { provide: APP_GUARD, useClass: TestIdentity },
      ],
    }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(globalValidationPipe);
    app.useGlobalFilters(new HttpExceptionFilter());
    // Listen once on a fixed loopback address: supertest otherwise listens on an ephemeral
    // wildcard port and closes it after every request, and a reused keep-alive socket or
    // a port held by another local process then fails the request (socket hang up, 404).
    await app.listen(0, '127.0.0.1');

    // demand: five weeks steady, then A sells 6/day for a week; confirmed on D1.
    productA = await product(demand.merchantId, {
      name: 'Cappuccino',
      onHand: 40,
    });
    productB = await product(demand.merchantId, { name: 'Tea', onHand: 40 });
    await cashSeries(demand, productA, D0, [...repeat(4, 28), ...repeat(6, 7)]);
    await cashSeries(demand, productB, D0, repeat(4, 35));
    expect(
      (await processor.processMerchant(demand.merchantId, { asOf: at(D0) }))
        ?.status,
    ).toBe('succeeded');
    await cashSeries(demand, productA, D1, [6]);
    await cashSeries(demand, productB, D1, [4]);
    expect(
      (await processor.processMerchant(demand.merchantId, { asOf: at(D1) }))
        ?.status,
    ).toBe('succeeded');

    // many: 3 out of stock (priority 1) and 9 low stock (priority 2), all opened by one run.
    for (let i = 0; i < 12; i += 1)
      await product(many.merchantId, {
        name: `Item ${String(i).padStart(2, '0')}`,
        onHand: i < 3 ? 0 : 3,
      });
    expect(
      (await processor.processMerchant(many.merchantId, { asOf: at(D0) }))
        ?.status,
    ).toBe('succeeded');

    otherProduct = await product(other.merchantId, {
      name: 'Other croissant',
      onHand: 2,
    });
    const otherOutcome = await processor.processMerchant(other.merchantId, {
      asOf: at(D0),
    });
    otherRunId = otherOutcome!.runId;

    const calmProduct = await product(calm.merchantId, {
      name: 'Water',
      onHand: 500,
    });
    await cashSeries(calm, calmProduct, D0, repeat(4, 35));
    expect(
      (await processor.processMerchant(calm.merchantId, { asOf: at(D0) }))
        ?.status,
    ).toBe('succeeded');
  });

  afterAll(async () => {
    await app?.close();
    for (const fixture of fixtures) await destroyMerchantFixture(db, fixture);
    if (strangerId)
      await db.delete(schema.users).where(eq(schema.users.id, strangerId));
    await pool?.end();
  });

  describe('access', () => {
    const routes = (caseId: string, runId: string) => [
      '/merchants/me/changes',
      '/merchants/me/changes/status',
      `/merchants/me/changes/runs/${runId}`,
      `/merchants/me/changes/${caseId}`,
    ];

    it('answers 404 on every Changes route for an authenticated non-owner', async () => {
      const [c] = await casesOf(demand.merchantId);
      for (const path of routes(c.id, otherRunId))
        await get(path, strangerId).expect(404);
    });

    it('answers 404 for another merchant’s case, run and product', async () => {
      const [theirs] = await casesOf(other.merchantId);
      await get(`/merchants/me/changes/${theirs.id}`, demand.userId).expect(
        404,
      );
      await get(
        `/merchants/me/changes/runs/${otherRunId}`,
        demand.userId,
      ).expect(404);
      await get(`/merchants/me/products/${otherProduct}`, demand.userId).expect(
        404,
      );
      // The owner can read them.
      await get(`/merchants/me/changes/${theirs.id}`, other.userId).expect(200);
      await get(
        `/merchants/me/changes/runs/${otherRunId}`,
        other.userId,
      ).expect(200);
    });

    it('when not enabled for the merchant: status says unavailable, list/detail/run are 404', async () => {
      const status = (
        await get('/merchants/me/changes/status', off.userId).expect(200)
      ).body as ChangeStatusResponse;
      expect(status).toMatchObject({
        available: false,
        unavailableReason: 'not_enabled',
        initialized: false,
      });
      const [c] = await casesOf(demand.merchantId);
      for (const path of routes(c.id, otherRunId)) {
        if (path.endsWith('/status')) continue;
        await get(path, off.userId).expect(404);
      }
    });

    it('reports a globally disabled feature as `disabled`, never an error', async () => {
      const reads = new ChangeReadService(db, new ChangeIntelligenceConfig({}));
      const me = { merchantId: demand.merchantId, publicId: 'x', timezone: TZ };
      expect(await reads.status(me)).toMatchObject({
        available: false,
        unavailableReason: 'disabled',
      });
      await expect(reads.list(me, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('sets private no-store cache headers and never accepts a client merchant id', async () => {
      const res = await get('/merchants/me/changes', demand.userId).expect(200);
      expect(res.headers['cache-control']).toBe('private, no-store');
      await get(
        `/merchants/me/changes?merchantId=${other.merchantId}`,
        demand.userId,
      ).expect(400);
    });
  });

  describe('list', () => {
    const list = async (user: string, query = '') =>
      (await get(`/merchants/me/changes${query}`, user).expect(200))
        .body as ChangeListResponse;

    it('orders active changes by attention priority with merchant-safe summaries', async () => {
      const page = await list(demand.userId);
      expect(page.timezone).toBe(TZ);
      expect(
        page.items.map((c) => [c.type, c.priority, c.productName]),
      ).toEqual([
        ['stock_risk', 3, 'Cappuccino'],
        ['unit_demand_increase', 4, 'Cappuccino'],
      ]);
      const demandCase = page.items[1];
      expect(demandCase).toMatchObject({
        productId: productA,
        productAvailable: true,
        status: 'active',
        headline: 'Cappuccino is selling faster',
        observation: { from: addDays(D1, -6), to: D1 },
        modelVersion: 'change-intelligence-v1',
        identifiedDuringInitialAnalysis: false,
        resolution: null,
      });
      expect(demandCase.after.length).toBeGreaterThan(0);
      expect(scan(page)).toEqual([]);
    });

    it('filters by type, product, status and date range', async () => {
      const types = async (query: string) =>
        (await list(demand.userId, query)).items.map((c) => c.type);
      expect(await types('?type=demand')).toEqual(['unit_demand_increase']);
      expect(await types('?type=stock')).toEqual(['stock_risk']);
      expect(await types('?type=threshold')).toEqual([]);
      expect(await types(`?productId=${productB}`)).toEqual([]);
      expect(await types(`?productId=${productA}`)).toHaveLength(2);
      expect(await types('?status=resolved')).toEqual([]);
      // Non-active views default to the last 30 days, which excludes September.
      expect(await types('?status=all')).toEqual([]);
      // The run for D1 happened at 01:00 local on the next day: that is the change date.
      const changed = addDays(D1, 1);
      expect(
        (await types(`?status=all&from=${changed}&to=${changed}`)).sort(),
      ).toEqual(['stock_risk', 'unit_demand_increase']);
      expect(await types(`?status=all&from=${D1}&to=${D1}`)).toEqual([]);
      expect(await types(`?from=${addDays(changed, 1)}`)).toEqual([]);
      expect(await types(`?to=${changed}`)).toHaveLength(2);
    });

    it.each([
      ['type=bogus'],
      ['status=open'],
      ['productId=not-a-uuid'],
      ['from=2026-13-01'],
      ['from=2026-02-30'],
      ['from=26-09-01'],
      ['from=2025-09-01&to=2026-09-02'],
      ['from=2026-09-10&to=2026-09-01'],
      ['limit=0'],
      ['limit=101'],
      ['limit=abc'],
      ['cursor=bogus'],
    ])('rejects %s with 400 and a sanitized message', async (query) => {
      const res = await get(
        `/merchants/me/changes?${query}`,
        demand.userId,
      ).expect(400);
      expect(JSON.stringify(res.body)).not.toMatch(
        /stack|at .*\.ts|SELECT|postgres/i,
      );
    });

    it('accepts limit=100 and a 366-day range', async () => {
      await get('/merchants/me/changes?limit=100', demand.userId).expect(200);
      await get(
        '/merchants/me/changes?from=2025-09-23&to=2026-09-23',
        demand.userId,
      ).expect(200);
    });

    it('rejects malformed path ids with 400', async () => {
      await get('/merchants/me/changes/not-a-uuid', demand.userId).expect(400);
      await get('/merchants/me/changes/runs/not-a-uuid', demand.userId).expect(
        400,
      );
    });

    const pages = async (user: string, query: string) => {
      const seen: ChangeCaseSummary[] = [];
      let cursor: string | null = null;
      let count = 0;
      do {
        const page = await list(
          user,
          `${query}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        );
        seen.push(...page.items);
        cursor = page.nextCursor;
        count += 1;
      } while (cursor && count < 10);
      return { seen, count };
    };

    it('paginates the active view stably with no duplicates or gaps across equal timestamps', async () => {
      const all = await list(many.userId, '?limit=100');
      expect(all.items).toHaveLength(12);
      expect(all.nextCursor).toBeNull();
      expect(all.items.map((c) => c.priority)).toEqual([
        1,
        1,
        1,
        ...repeat(2, 9),
      ]);
      expect(all.items.every((c) => c.identifiedDuringInitialAnalysis)).toBe(
        true,
      );
      const { seen, count } = await pages(many.userId, '?limit=5');
      expect(count).toBe(3);
      expect(seen.map((c) => c.id)).toEqual(all.items.map((c) => c.id));
    });

    it('paginates the recent-first view the same way, and a cursor from another view is 400', async () => {
      const range = `?status=all&from=${D0}&to=${addDays(D0, 2)}`;
      const all = await list(many.userId, `${range}&limit=100`);
      expect(all.items).toHaveLength(12);
      const { seen } = await pages(many.userId, `${range}&limit=4`);
      expect(seen.map((c) => c.id)).toEqual(all.items.map((c) => c.id));
      const active = await list(many.userId, '?limit=5');
      await get(
        `/merchants/me/changes${range}&cursor=${active.nextCursor}`,
        many.userId,
      ).expect(400);
    });
  });

  describe('detail and run evidence', () => {
    it('explains a demand change: what changed, trail, history, calculation and source', async () => {
      const demandCase = (await casesOf(demand.merchantId)).find(
        (c) => c.case_type === 'unit_demand_increase',
      )!;
      const res = await get(
        `/merchants/me/changes/${demandCase.id}`,
        demand.userId,
      ).expect(200);
      expect(res.headers['cache-control']).toBe('private, no-store');
      const detail = res.body as ChangeDetailResponse;
      expect(scan(detail)).toEqual([]);
      expect(detail.change).toMatchObject({
        id: demandCase.id,
        type: 'unit_demand_increase',
      });
      expect(detail.whatChanged.recent).toMatchObject({
        value: 42,
        unit: 'units',
      });
      expect(detail.whatChanged.usualWeekly).toMatchObject({
        value: 28.5,
        unit: 'units',
      });
      expect(detail.whatChanged.baselineWeeks).toHaveLength(4);
      expect(detail.whatChanged.baselineWeeks[0]).toMatchObject({
        from: addDays(D1, -13),
        to: addDays(D1, -7),
      });
      expect(detail.impact.length).toBeGreaterThan(0);
      for (const step of detail.impact)
        expect(step.label).toMatch(/^[A-Z][a-z ]+$/);
      expect(detail.transitions.map((t) => [t.kind, t.reason])).toEqual([
        ['opened', 'source_change'],
      ]);
      expect(detail.transitions[0].summary).toBe(
        'Cappuccino is selling faster',
      );
      expect(detail.calculation).toMatchObject({
        asOf: at(D1).toISOString(),
        timezone: TZ,
        modelVersion: 'change-intelligence-v1',
        recentWindow: { from: addDays(D1, -6), to: D1 },
        baselineWeeksUsed: 4,
        forecastWindow: { from: addDays(D1, -27), to: D1 },
      });
      expect(detail.calculation.settings.minZ).toBe(2.5);
      expect(detail.calculation.assumptions).toContain(
        'Projections exclude opening hours, supplier lead times, incoming orders and unrecorded activity.',
      );
      expect(detail.source).toMatchObject({
        cashSalesProvenance: 'unknown',
        includesTestPayments: false,
      });
      expect(detail.source.cashSales).toBeGreaterThan(0);
      expect(detail.actions).toEqual({ viewProduct: true, reviewStock: true });
      expect(detail.runId).toEqual(expect.any(String));

      const run = (
        await get(
          `/merchants/me/changes/runs/${detail.runId}`,
          demand.userId,
        ).expect(200)
      ).body as ChangeRunEvidence;
      expect(scan(run)).toEqual([]);
      expect(run).toMatchObject({
        id: detail.runId,
        status: 'succeeded',
        timezone: TZ,
        asOf: at(D1).toISOString(),
      });
      expect(run.changedCases).toBeGreaterThanOrEqual(2);
    });

    it('keeps the settings that created the case after settings change', async () => {
      const tuned = new ChangeIntelligenceConfig({
        MERCHANT_CHANGE_INTELLIGENCE_ENABLED: 'true',
        MERCHANT_CHANGE_INTELLIGENCE_ALLOWLIST: demand.merchantId,
        MERCHANT_CHANGE_INTELLIGENCE_SETTINGS: JSON.stringify({ minZ: 3 }),
      });
      const queue = new ChangeWorkQueueService(db, tuned);
      const tunedProcessor = new ChangeProcessorService(
        db,
        tuned,
        queue,
        new ChangeSourceLoader(),
        new ChangePublisherService(queue),
      );
      const summary = await tunedProcessor.tick({
        budgetMs: 60_000,
        asOf: at(D1, 2),
      });
      expect(summary.merchants[0]?.reason).toBe('settings_change');
      const runId = summary.merchants[0].runId;

      const run = (
        await get(`/merchants/me/changes/runs/${runId}`, demand.userId).expect(
          200,
        )
      ).body as ChangeRunEvidence;
      expect(run).toMatchObject({
        reason: 'settings_change',
        settings: { minZ: 3 },
      });
      for (const c of await casesOf(demand.merchantId)) {
        const detail = (
          await get(`/merchants/me/changes/${c.id}`, demand.userId).expect(200)
        ).body as ChangeDetailResponse;
        expect(detail.calculation.settings.minZ).toBe(2.5);
      }
    });

    it('disables actions for an archived product and keeps its history', async () => {
      const [c] = await casesOf(other.merchantId);
      await q(
        `UPDATE merchant_products SET status = 'archived' WHERE id = $1`,
        [otherProduct],
      );
      const detail = (
        await get(`/merchants/me/changes/${c.id}`, other.userId).expect(200)
      ).body as ChangeDetailResponse;
      expect(detail.change.productAvailable).toBe(false);
      expect(detail.change.productName).toBe('Other croissant');
      expect(detail.actions).toEqual({
        viewProduct: false,
        reviewStock: false,
      });
      expect(detail.transitions.length).toBeGreaterThan(0);
    });
  });

  describe('status', () => {
    const status = async (fixture: MerchantFixture) =>
      (await get('/merchants/me/changes/status', fixture.userId).expect(200))
        .body as ChangeStatusResponse;

    it('a ready merchant with changes: freshness, cadence, readiness, summary and provenance', async () => {
      const s = await status(demand);
      expect(scan(s)).toEqual([]);
      expect(s).toMatchObject({
        available: true,
        unavailableReason: null,
        timezone: TZ,
        cadence: { stockMinutes: 60, trendsDaily: true },
        initialized: true,
        processing: 'idle',
        pendingSince: null,
        readiness: {
          trends: 'ready',
          requiredHistoryDays: 28,
          daysUntilTrendsReady: 0,
          minUsualWeeklyUnits: 5,
        },
        recordingGap: false,
        lastRecordedSaleDate: D1,
        summary: { activeChanges: 2, productsNeedingStockReview: 1 },
        provenance: { account: 'ordinary', includesTestPayments: false },
      });
      expect(s.lastSuccessfulAnalysisAt).toEqual(expect.any(String));
    });

    it('no material changes is distinct from a recording gap and from not yet analysed', async () => {
      expect(await status(calm)).toMatchObject({
        initialized: true,
        recordingGap: false,
        readiness: { trends: 'ready' },
        summary: { activeChanges: 0, productsNeedingStockReview: 0 },
      });
      expect(await status(many)).toMatchObject({
        initialized: true,
        recordingGap: true,
        lastRecordedSaleDate: null,
        readiness: { trends: 'recording_gap' },
        summary: { activeChanges: 12, productsNeedingStockReview: 12 },
      });
      expect(await status(fresh)).toMatchObject({
        available: true,
        initialized: false,
        processing: 'idle',
        lastSuccessfulAnalysisAt: null,
      });
    });

    it('distinguishes pending, delayed, processing and failed, and keeps previous results', async () => {
      const m = calm.merchantId;
      await q(
        `UPDATE merchant_products SET low_stock_threshold = 6 WHERE merchant_id = $1`,
        [m],
      );
      const pending = await status(calm);
      expect(pending.processing).toBe('pending');
      expect(pending.pendingSince).toEqual(expect.any(String));

      await q(
        `UPDATE merchant_change_events SET created_at = now() - interval '2 hours' WHERE merchant_id = $1 AND status = 'pending'`,
        [m],
      );
      expect((await status(calm)).processing).toBe('delayed');

      await q(
        `UPDATE merchant_change_work SET status = 'processing', lease_token = gen_random_uuid(), lease_until = now() + interval '1 minute' WHERE merchant_id = $1`,
        [m],
      );
      expect((await status(calm)).processing).toBe('processing');

      await q(
        `UPDATE merchant_change_work SET status = 'failed', lease_token = NULL, lease_until = NULL, last_failure_at = now() WHERE merchant_id = $1`,
        [m],
      );
      const failed = await status(calm);
      expect(failed.processing).toBe('failed');
      expect(failed.lastFailureAt).toEqual(expect.any(String));
      expect(failed.lastSuccessfulAnalysisAt).toEqual(expect.any(String));
      expect(failed.readiness.trends).toBe('ready');
    });
  });

  describe('products/:id', () => {
    it('returns the same shape as the product list, scoped to the merchant', async () => {
      const one = (
        await get(`/merchants/me/products/${productA}`, demand.userId).expect(
          200,
        )
      ).body as Record<string, unknown>;
      const listed = (
        (
          await get(
            '/merchants/me/products?query=Cappuccino',
            demand.userId,
          ).expect(200)
        ).body as { items: Array<Record<string, unknown>> }
      ).items.find((p) => p.id === productA);
      expect(one).toEqual(listed);
      await get(`/merchants/me/products/${randomUUID()}`, demand.userId).expect(
        404,
      );
      await get('/merchants/me/products/not-a-uuid', demand.userId).expect(400);
    });
  });

  describe('Deep Analytics compatibility (§2.5)', () => {
    it('uses Change Intelligence for enabled, initialized merchants and leaves others on legacy', async () => {
      // Same data for both, relative to the real clock the legacy engine uses.
      const yesterday = addDays(localDate(new Date(), TZ), -1);
      const ids: Record<string, string> = {};
      for (const fixture of [legacyOn, legacyOff]) {
        ids[fixture.merchantId] = await product(fixture.merchantId, {
          name: 'Bagel',
          onHand: 20,
        });
        await cashSeries(
          fixture,
          ids[fixture.merchantId],
          yesterday,
          repeat(4, 35),
        );
      }
      // Before initialization the legacy codes stay (rollback/not-ready behaviour).
      expect(await insights.runForMerchant(legacyOn.merchantId)).toEqual({
        processed: true,
      });
      const before = (
        await get('/merchants/me/insights', legacyOn.userId).expect(200)
      ).body as MerchantInsightsResponse;
      expect(before.insights.map((i) => i.code)).toContain(
        `stock_risk.${ids[legacyOn.merchantId]}`,
      );

      expect(
        (await processor.processMerchant(legacyOn.merchantId))?.status,
      ).toBe('succeeded');
      for (const fixture of [legacyOn, legacyOff])
        expect(await insights.runForMerchant(fixture.merchantId)).toEqual({
          processed: true,
        });

      const on = (
        await get('/merchants/me/insights', legacyOn.userId).expect(200)
      ).body as MerchantInsightsResponse;
      const onCodes = on.insights.map((i) => i.code);
      expect(
        onCodes.filter((c) => /^(stock_risk|anomaly\.product)\./.test(c)),
      ).toEqual([]);
      const adapted = on.insights.find(
        (i) => i.code === `change.stock_risk.${ids[legacyOn.merchantId]}`,
      );
      const [stockCase] = await casesOf(legacyOn.merchantId);
      expect(adapted).toMatchObject({
        kind: 'stock_risk',
        modelVersion: 'change-intelligence-v1',
        changeCaseId: stockCase.id,
        narrationSource: 'deterministic',
        title: 'Bagel may reach minimum stock soon',
      });
      expect(adapted?.calculatedAt).toEqual(expect.any(String));
      // The stored legacy snapshot was also recalculated without the codes.
      const stored = await q<{ code: string }>(
        `SELECT code FROM merchant_insights WHERE merchant_id = $1 AND active`,
        [legacyOn.merchantId],
      );
      expect(
        stored.filter((r) => /^(stock_risk|anomaly\.product)\./.test(r.code)),
      ).toEqual([]);

      const offBody = (
        await get('/merchants/me/insights', legacyOff.userId).expect(200)
      ).body as MerchantInsightsResponse;
      expect(offBody.insights.map((i) => i.code)).toContain(
        `stock_risk.${ids[legacyOff.merchantId]}`,
      );
      expect(
        offBody.insights.filter((i) => i.modelVersion || i.changeCaseId),
      ).toEqual([]);
    });
  });
});
