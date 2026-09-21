import { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
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
import * as schema from '../database/schema';
import { MerchantInsightsService } from './merchant-insights.service';
import type { GroqNarrationService } from './groq-narration.service';

/**
 * X.17, second half — the stored insight is created and then resolved.
 *
 * The engine deciding a risk has passed is not enough: the row a merchant's
 * dashboard reads has to stop being active, and the moment it stopped has to
 * be recorded rather than the row quietly disappearing.
 */
describe('stock risk persistence (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let insights: MerchantInsightsService;
  let merchant: MerchantFixture;
  let productId: string;

  /** Narration off: the deterministic text is what is under test here. */
  const narration = {
    narrate: async (
      _merchantId: string,
      _fingerprint: string,
      _version: string,
      calculated: unknown[],
    ) => calculated,
  } as unknown as GroqNarrationService;

  function configFor(): ConfigService {
    return {
      get: (key: string, fallback?: unknown) => {
        if (key === 'MERCHANT_INTELLIGENCE_ENABLED') return 'true';
        if (key === 'MERCHANT_INTELLIGENCE_ALLOWLIST') return '';
        if (key === 'MERCHANT_AI_NARRATION_ENABLED') return 'false';
        return fallback;
      },
    } as unknown as ConfigService;
  }

  beforeAll(async () => {
    const connection = await connectTestDatabase();
    db = connection.db;
    pool = connection.pool;
    insights = new MerchantInsightsService(db, configFor(), narration);

    merchant = await createMerchantFixture(db, 'StockRisk');

    const [product] = await db
      .insert(schema.merchantProducts)
      .values({
        merchantId: merchant.merchantId,
        name: 'Coffee',
        category: 'Drinks',
        unitPriceMinor: 500n,
        onHandQuantity: 8,
        reservedQuantity: 0,
        lowStockThreshold: 5,
      })
      .returning({ id: schema.merchantProducts.id });
    productId = product.id;

    // Forty days of one-unit-a-day cash sales: enough history for a forecast.
    const now = Date.now();
    for (let daysAgo = 1; daysAgo <= 40; daysAgo += 1) {
      const occurredAt = new Date(now - daysAgo * 86_400_000);
      const [sale] = await db
        .insert(schema.merchantCashSales)
        .values({
          merchantId: merchant.merchantId,
          receiptNumber: `SR-${daysAgo}-${merchant.merchantId.slice(0, 6)}`,
          amountMinor: 500n,
          occurredAt,
          stockAccountedFor: true,
          actorUserId: merchant.userId,
          idempotencyKey: `stock-risk-${daysAgo}-${merchant.merchantId}`,
          inputFingerprint: `fingerprint-${daysAgo}`,
        })
        .returning({ id: schema.merchantCashSales.id });
      await db.insert(schema.merchantCashSaleItems).values({
        cashSaleId: sale.id,
        productId,
        type: 'product',
        name: 'Coffee',
        category: 'Drinks',
        quantity: 1,
        unitPriceMinor: 500n,
        lineTotalMinor: 500n,
      });
      await db.insert(schema.merchantStockMovements).values({
        merchantId: merchant.merchantId,
        productId,
        kind: 'cash_sale',
        onHandChange: -1,
        reservedChange: 0,
        referenceType: 'cash_sale',
        referenceId: sale.id,
        occurredAt,
      });
    }
  });

  afterAll(async () => {
    await db
      .delete(schema.merchantInsights)
      .where(eq(schema.merchantInsights.merchantId, merchant.merchantId));
    await db
      .delete(schema.merchantAnalyticsSnapshots)
      .where(
        eq(schema.merchantAnalyticsSnapshots.merchantId, merchant.merchantId),
      );
    await destroyMerchantFixture(db, merchant);
    await pool.end();
  });

  async function stockRiskRows() {
    return db
      .select()
      .from(schema.merchantInsights)
      .where(
        and(
          eq(schema.merchantInsights.merchantId, merchant.merchantId),
          eq(schema.merchantInsights.kind, 'stock_risk'),
        ),
      );
  }

  it('creates an active stock-risk insight from recorded demand', async () => {
    const result = await insights.runForMerchant(merchant.merchantId);
    expect(result.processed).toBe(true);

    const rows = await stockRiskRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].active).toBe(true);
    expect(rows[0].resolvedAt).toBeNull();
    expect(rows[0].code).toBe(`stock_risk.${productId}`);
  });

  it('shows it to the merchant', async () => {
    const view = await insights.getForUser(merchant.userId);
    expect(view.status).toBe('ready');
    expect(view.insights.some((item) => item.kind === 'stock_risk')).toBe(true);
  });

  it('resolves it once the product is replenished', async () => {
    await db
      .update(schema.merchantProducts)
      .set({ onHandQuantity: 500 })
      .where(eq(schema.merchantProducts.id, productId));

    // A stock change is exactly the trigger the orchestrator enqueues.
    await db.insert(schema.merchantStockMovements).values({
      merchantId: merchant.merchantId,
      productId,
      kind: 'restock',
      onHandChange: 492,
      reservedChange: 0,
      referenceType: 'product',
      referenceId: productId,
      occurredAt: new Date(),
    });

    await insights.runForMerchant(merchant.merchantId);

    const rows = await stockRiskRows();
    const resolved = rows.filter((row) => !row.active);
    expect(resolved.length).toBeGreaterThanOrEqual(1);
    expect(resolved[0].resolvedAt).not.toBeNull();
  });

  it('stops showing it to the merchant', async () => {
    const view = await insights.getForUser(merchant.userId);
    expect(view.insights.some((item) => item.kind === 'stock_risk')).toBe(
      false,
    );
  });

  it('keeps the resolved row rather than deleting the history', async () => {
    const rows = await stockRiskRows();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((row) => row.code === `stock_risk.${productId}`)).toBe(
      true,
    );
  });

  it('raises it again if the stock is drawn back down', async () => {
    await db
      .update(schema.merchantProducts)
      .set({ onHandQuantity: 8 })
      .where(eq(schema.merchantProducts.id, productId));
    await db.insert(schema.merchantStockMovements).values({
      merchantId: merchant.merchantId,
      productId,
      kind: 'adjustment',
      onHandChange: -492,
      reservedChange: 0,
      referenceType: 'product',
      referenceId: productId,
      occurredAt: new Date(),
    });

    await insights.runForMerchant(merchant.merchantId);

    const rows = await stockRiskRows();
    expect(rows.some((row) => row.active)).toBe(true);
  });
});
