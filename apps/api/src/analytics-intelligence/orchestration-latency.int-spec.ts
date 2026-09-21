import { ConfigService } from '@nestjs/config';
import { eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
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
import { AnalyticsWorkQueueService } from './analytics-work-queue.service';
import { AnalyticsOrchestratorService } from './analytics-orchestrator.service';
import { MerchantInsightsService } from './merchant-insights.service';
import { percentile } from '../common/percentile';
import type { GroqNarrationService } from './groq-narration.service';

/**
 * N.12 and P.3 — how long a change takes to become a refreshed insight, under
 * something resembling demonstration load.
 *
 * The end-to-end figure is the worker's cycle plus the time it spends on the
 * merchant: the queue is swept once a minute, so a change arriving just after
 * a sweep waits up to 60 seconds before processing begins. What is measured
 * here is the processing half, because the cadence is a fixed constant and the
 * processing is the part that could grow with the number of merchants.
 */
describe('orchestration latency (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let queue: AnalyticsWorkQueueService;
  let orchestrator: AnalyticsOrchestratorService;
  const merchants: MerchantFixture[] = [];

  /** The plan's cadence; a change can wait this long before work starts. */
  const TICK_MS = 60_000;
  /** N.12's target for the whole journey. */
  const TARGET_P95_MS = 120_000;
  const MERCHANT_COUNT = 6;

  const narration = {
    narrate: async (
      _merchantId: string,
      _fingerprint: string,
      _version: string,
      calculated: unknown[],
    ) => calculated,
  } as unknown as GroqNarrationService;

  const config = {
    get: (key: string, fallback?: unknown) => {
      if (key === 'MERCHANT_INTELLIGENCE_ENABLED') return 'true';
      if (key === 'MERCHANT_INTELLIGENCE_ALLOWLIST') return '';
      if (key === 'MERCHANT_AI_NARRATION_ENABLED') return 'false';
      if (key === 'MERCHANT_ORCHESTRATION_ENABLED') return 'false';
      return fallback;
    },
  } as unknown as ConfigService;

  beforeAll(async () => {
    const connection = await connectTestDatabase();
    db = connection.db;
    pool = connection.pool;

    queue = new AnalyticsWorkQueueService(db);
    orchestrator = new AnalyticsOrchestratorService(
      queue,
      new MerchantInsightsService(db, config, narration),
      config,
    );

    for (let index = 0; index < MERCHANT_COUNT; index += 1) {
      const merchant = await createMerchantFixture(db, `Cadence${index}`);
      merchants.push(merchant);

      const [product] = await db
        .insert(schema.merchantProducts)
        .values({
          merchantId: merchant.merchantId,
          name: 'Bench product',
          category: 'Bench',
          unitPriceMinor: 500n,
          onHandQuantity: 200,
          reservedQuantity: 0,
          lowStockThreshold: 10,
        })
        .returning({ id: schema.merchantProducts.id });

      // Sixty days of daily sales each: enough for the forecast path to run.
      for (let day = 1; day <= 60; day += 1) {
        const occurredAt = new Date(Date.now() - day * 86_400_000);
        const [sale] = await db
          .insert(schema.merchantCashSales)
          .values({
            merchantId: merchant.merchantId,
            receiptNumber: `CAD-${index}-${day}-${merchant.merchantId.slice(0, 6)}`,
            amountMinor: 500n,
            occurredAt,
            stockAccountedFor: true,
            actorUserId: merchant.userId,
            idempotencyKey: `cadence-${index}-${day}-${merchant.merchantId}`,
            inputFingerprint: `cadence-${day}`,
          })
          .returning({ id: schema.merchantCashSales.id });
        await db.insert(schema.merchantCashSaleItems).values({
          cashSaleId: sale.id,
          productId: product.id,
          type: 'product',
          name: 'Bench product',
          category: 'Bench',
          quantity: 1,
          unitPriceMinor: 500n,
          lineTotalMinor: 500n,
        });
        await db.insert(schema.merchantStockMovements).values({
          merchantId: merchant.merchantId,
          productId: product.id,
          kind: 'cash_sale',
          onHandChange: -1,
          reservedChange: 0,
          referenceType: 'cash_sale',
          referenceId: sale.id,
          occurredAt,
        });
      }
    }
  }, 300_000);

  afterAll(async () => {
    for (const merchant of merchants) {
      await db
        .delete(schema.merchantInsights)
        .where(eq(schema.merchantInsights.merchantId, merchant.merchantId));
      await db
        .delete(schema.merchantAnalyticsSnapshots)
        .where(
          eq(schema.merchantAnalyticsSnapshots.merchantId, merchant.merchantId),
        );
      await destroyMerchantFixture(db, merchant);
    }
    await pool.end();
  }, 300_000);

  it('refreshes a whole batch of merchants well inside the cadence', async () => {
    const enqueuedAt = new Map<string, number>();
    for (const merchant of merchants) {
      enqueuedAt.set(merchant.merchantId, performance.now());
      await queue.enqueue(merchant.merchantId, 'cash_sale_recorded', {
        type: 'merchant_cash_sale',
        id: randomUUID(),
      });
    }

    const startedAt = performance.now();
    const result = await orchestrator.tick(MERCHANT_COUNT);
    const cycleMs = performance.now() - startedAt;

    expect(result.processed).toBe(MERCHANT_COUNT);
    expect(result.failed).toBe(0);

    // Worst case for any single merchant: it arrived just after a sweep, so it
    // waited a full cadence, then the whole batch was processed.
    const worstCaseMs = TICK_MS + cycleMs;
    process.stdout.write(
      `orchestration — ${MERCHANT_COUNT} merchants in ${cycleMs.toFixed(0)}ms; ` +
        `worst case including the ${TICK_MS / 1000}s cadence: ${worstCaseMs.toFixed(0)}ms\n`,
    );

    expect(worstCaseMs).toBeLessThan(TARGET_P95_MS);
  }, 300_000);

  it('keeps the per-merchant cost steady across the batch', async () => {
    const durations: number[] = [];
    for (const merchant of merchants) {
      await queue.enqueue(merchant.merchantId, 'stock_adjusted', {
        type: 'merchant_product',
        id: randomUUID(),
      });
    }

    for (let index = 0; index < MERCHANT_COUNT; index += 1) {
      const startedAt = performance.now();
      const result = await orchestrator.tick(1);
      if (result.processed === 0) break;
      durations.push(performance.now() - startedAt);
    }

    expect(durations.length).toBeGreaterThan(0);
    const p95 = percentile(durations, 95);
    process.stdout.write(
      `per merchant — p50 ${percentile(durations, 50).toFixed(0)}ms, p95 ${p95.toFixed(0)}ms\n`,
    );
    // One merchant must not be able to consume the whole cadence on its own.
    expect(p95).toBeLessThan(TICK_MS);
  }, 300_000);

  it('leaves the queue empty when the work is done', async () => {
    const pending = await db
      .select({ merchantId: schema.merchantAnalyticsWork.merchantId })
      .from(schema.merchantAnalyticsWork)
      .where(
        inArray(
          schema.merchantAnalyticsWork.merchantId,
          merchants.map((merchant) => merchant.merchantId),
        ),
      );
    expect(pending).toEqual([]);
  });
});
