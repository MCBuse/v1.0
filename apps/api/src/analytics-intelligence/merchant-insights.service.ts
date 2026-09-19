import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { MerchantInsightsResponse } from '@repo/shared';
import { and, asc, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import {
  ANALYTICS_CALCULATION_VERSION,
  calculateMerchantIntelligence,
  type IntelligenceActivity,
  type IntelligenceProductLine,
} from './merchant-insights.engine';
import { GroqNarrationService } from './groq-narration.service';

const WORKER_LOCK_ID = 742_026_091;

@Injectable()
export class MerchantInsightsService {
  private readonly logger = new Logger(MerchantInsightsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly config: ConfigService,
    private readonly narration: GroqNarrationService,
  ) {}

  async getForUser(userId: string): Promise<MerchantInsightsResponse> {
    const rows = await this.db.select({ merchantId: schema.merchants.id, publicId: schema.merchants.publicId }).from(schema.merchantMemberships).innerJoin(schema.merchants, eq(schema.merchants.id, schema.merchantMemberships.merchantId)).where(eq(schema.merchantMemberships.userId, userId)).limit(1);
    const merchant = rows[0];
    if (!merchant || !this.enabledForMerchant(merchant.merchantId, merchant.publicId)) return this.emptyResponse('disabled', 'Business intelligence is not enabled for this merchant.');
    const snapshots = await this.db.select().from(schema.merchantAnalyticsSnapshots).where(eq(schema.merchantAnalyticsSnapshots.merchantId, merchant.merchantId)).orderBy(desc(schema.merchantAnalyticsSnapshots.generatedAt)).limit(1);
    const snapshot = snapshots[0];
    if (!snapshot) return this.emptyResponse('updating', 'Insights are being prepared from recorded activity.');
    const rowsForSnapshot = await this.db.select().from(schema.merchantInsights).where(and(eq(schema.merchantInsights.snapshotId, snapshot.id), eq(schema.merchantInsights.active, true))).orderBy(asc(schema.merchantInsights.priority), asc(schema.merchantInsights.code));
    const sourceCoverage = snapshot.sourceCoverage as Record<string, number>;
    const snapshotBody = snapshot.snapshot as { metrics?: Record<string, unknown> };
    const mixedData = (sourceCoverage.test ?? 0) + (sourceCoverage.synthetic ?? 0) + (sourceCoverage.unknown ?? 0) > 0;
    return {
      status: 'ready',
      calculationVersion: snapshot.calculationVersion,
      generatedAt: snapshot.generatedAt.toISOString(),
      stale: Date.now() - snapshot.generatedAt.getTime() > 15 * 60 * 1000,
      snapshot: { metrics: snapshotBody.metrics ?? {} },
      scope: { label: 'all_recorded_activity', periodFrom: snapshot.periodFrom.toISOString(), periodTo: snapshot.periodTo.toISOString(), mixedData, sourceCoverage },
      insights: rowsForSnapshot.map((row) => ({ id: row.id, code: row.code, kind: row.kind as 'stock_risk' | 'discrepancy' | 'anomaly' | 'performance', priority: row.priority, title: row.title, summary: row.summary, recommendation: row.recommendation, evidence: row.evidence as Array<{ id: string; label: string; value: string }>, limitations: row.limitations as string[], narrationSource: row.narrationSource as 'deterministic' | 'groq' })),
      message: mixedData ? 'Mixed recorded activity—included test or unclassified records.' : null,
    };
  }

  async runAll() {
    if (this.config.get<string>('MERCHANT_INTELLIGENCE_ENABLED') !== 'true') return { skipped: true, reason: 'disabled' };
    const lockResult = await this.db.execute(sql`select pg_try_advisory_lock(${WORKER_LOCK_ID}) as acquired`) as unknown as { rows: Array<{ acquired: boolean }> };
    if (!lockResult.rows[0]?.acquired) return { skipped: true, reason: 'already_running' };
    const run = (await this.db.insert(schema.merchantAnalyticsRuns).values({ calculationVersion: ANALYTICS_CALCULATION_VERSION }).returning())[0];
    let processed = 0; let failed = 0; const errors: string[] = [];
    try {
      const merchants = await this.db.select({ id: schema.merchants.id, publicId: schema.merchants.publicId, timezone: schema.merchants.timezone }).from(schema.merchants).where(eq(schema.merchants.isActive, true));
      for (const merchant of merchants.filter((item) => this.enabledForMerchant(item.id, item.publicId))) {
        try {
          await this.processMerchant(merchant);
          processed++;
        } catch (error) {
          failed++;
          const message = error instanceof Error ? error.message : 'unknown error';
          errors.push(`${merchant.publicId}: ${message}`);
          this.logger.error(`Analytics failed for merchant ${merchant.publicId}: ${message}`);
        }
      }
      await this.db.update(schema.merchantAnalyticsRuns).set({ status: failed ? 'partial' : 'completed', processedMerchants: processed, failedMerchants: failed, errorSummary: errors.slice(0, 20).join('\n') || null, completedAt: new Date() }).where(eq(schema.merchantAnalyticsRuns.id, run.id));
      return { skipped: false, processed, failed };
    } catch (error) {
      await this.db.update(schema.merchantAnalyticsRuns).set({ status: 'failed', processedMerchants: processed, failedMerchants: failed, errorSummary: error instanceof Error ? error.message : 'unknown error', completedAt: new Date() }).where(eq(schema.merchantAnalyticsRuns.id, run.id));
      throw error;
    } finally {
      await this.db.execute(sql`select pg_advisory_unlock(${WORKER_LOCK_ID})`);
    }
  }

  private async processMerchant(merchant: { id: string; publicId: string; timezone: string }) {
    const now = new Date(); const from = new Date(now.getTime() - 90 * 86_400_000);
    const [digital, cash, products, digitalLines, cashLines, movements] = await Promise.all([
      this.db.select({ amountMinor: schema.merchantTransactions.displayAmountMinor, occurredAt: schema.merchantTransactions.occurredAt, environment: schema.merchantTransactions.evidenceEnvironment }).from(schema.merchantTransactions).where(and(eq(schema.merchantTransactions.merchantId, merchant.id), eq(schema.merchantTransactions.status, 'finalized'), gte(schema.merchantTransactions.occurredAt, from))),
      this.db.select({ amountMinor: schema.merchantCashSales.amountMinor, occurredAt: schema.merchantCashSales.occurredAt }).from(schema.merchantCashSales).where(and(eq(schema.merchantCashSales.merchantId, merchant.id), eq(schema.merchantCashSales.status, 'recorded'), gte(schema.merchantCashSales.occurredAt, from))),
      this.db.select({ id: schema.merchantProducts.id, name: schema.merchantProducts.name, category: schema.merchantProducts.category, onHandQuantity: schema.merchantProducts.onHandQuantity, reservedQuantity: schema.merchantProducts.reservedQuantity, lowStockThreshold: schema.merchantProducts.lowStockThreshold }).from(schema.merchantProducts).where(eq(schema.merchantProducts.merchantId, merchant.id)),
      this.db.select({ productId: schema.merchantInvoiceItems.productId, productName: schema.merchantInvoiceItems.name, quantity: schema.merchantInvoiceItems.quantity, totalMinor: schema.merchantInvoiceItems.lineTotalMinor, occurredAt: schema.merchantTransactions.occurredAt }).from(schema.merchantInvoiceItems).innerJoin(schema.merchantTransactions, eq(schema.merchantTransactions.paymentRequestId, schema.merchantInvoiceItems.paymentRequestId)).where(and(eq(schema.merchantTransactions.merchantId, merchant.id), eq(schema.merchantTransactions.status, 'finalized'), isNotNull(schema.merchantInvoiceItems.productId), gte(schema.merchantTransactions.occurredAt, from))),
      this.db.select({ productId: schema.merchantCashSaleItems.productId, productName: schema.merchantCashSaleItems.name, quantity: schema.merchantCashSaleItems.quantity, totalMinor: schema.merchantCashSaleItems.lineTotalMinor, occurredAt: schema.merchantCashSales.occurredAt, stockAccountedFor: schema.merchantCashSales.stockAccountedFor }).from(schema.merchantCashSaleItems).innerJoin(schema.merchantCashSales, eq(schema.merchantCashSales.id, schema.merchantCashSaleItems.cashSaleId)).where(and(eq(schema.merchantCashSales.merchantId, merchant.id), eq(schema.merchantCashSales.status, 'recorded'), isNotNull(schema.merchantCashSaleItems.productId), gte(schema.merchantCashSales.occurredAt, from))),
      this.db.select({ productId: schema.merchantStockMovements.productId, kind: schema.merchantStockMovements.kind, onHandChange: schema.merchantStockMovements.onHandChange, occurredAt: schema.merchantStockMovements.occurredAt }).from(schema.merchantStockMovements).where(and(eq(schema.merchantStockMovements.merchantId, merchant.id), gte(schema.merchantStockMovements.occurredAt, from))),
    ]);
    const activities: IntelligenceActivity[] = [
      ...digital.map((item) => ({ amountMinor: item.amountMinor, occurredAt: item.occurredAt, source: 'mcbuse_payment' as const, environment: item.environment as IntelligenceActivity['environment'] })),
      ...cash.map((item) => ({ amountMinor: item.amountMinor, occurredAt: item.occurredAt, source: 'merchant_cash' as const, environment: 'unknown' as const })),
    ];
    const productLines: IntelligenceProductLine[] = [
      ...digitalLines.filter((item): item is typeof item & { productId: string } => Boolean(item.productId)).map((item) => ({ ...item, source: 'mcbuse_payment' as const, stockAccountedFor: false })),
      ...cashLines.filter((item): item is typeof item & { productId: string } => Boolean(item.productId)).map((item) => ({ ...item, source: 'merchant_cash' as const })),
    ];
    const calculation = calculateMerchantIntelligence({ now, timezone: merchant.timezone, activities, productLines, products: products.map((product) => ({ id: product.id, name: product.name, category: product.category?.trim() || 'Uncategorised', availableQuantity: product.onHandQuantity - product.reservedQuantity, lowStockThreshold: product.lowStockThreshold })), stockMovements: movements });
    const fingerprint = createHash('sha256').update(JSON.stringify({ periodFrom: calculation.periodFrom, activities, productLines, products, movements, aiNarrationEnabled: this.config.get<string>('MERCHANT_AI_NARRATION_ENABLED') === 'true' }, (_key, value) => typeof value === 'bigint' ? value.toString() : value)).digest('hex');
    const existing = await this.db.select({ id: schema.merchantAnalyticsSnapshots.id }).from(schema.merchantAnalyticsSnapshots).where(and(eq(schema.merchantAnalyticsSnapshots.merchantId, merchant.id), eq(schema.merchantAnalyticsSnapshots.calculationVersion, ANALYTICS_CALCULATION_VERSION), eq(schema.merchantAnalyticsSnapshots.inputFingerprint, fingerprint))).limit(1);
    if (existing[0]) {
      await this.db.update(schema.merchantAnalyticsSnapshots).set({ periodTo: calculation.periodTo, sourceCoverage: calculation.sourceCoverage, snapshot: { metrics: calculation.metrics, mixedData: calculation.mixedData }, generatedAt: now }).where(eq(schema.merchantAnalyticsSnapshots.id, existing[0].id));
      if (this.config.get<string>('MERCHANT_AI_NARRATION_ENABLED') === 'true') {
        const narrated = await this.narration.narrate(merchant.id, fingerprint, calculation.insights);
        for (const insight of narrated) if ((insight as { narrationSource?: string }).narrationSource === 'groq') await this.db.update(schema.merchantInsights).set({ title: insight.title, summary: insight.summary, recommendation: insight.recommendation, narrationSource: 'groq' }).where(and(eq(schema.merchantInsights.snapshotId, existing[0].id), eq(schema.merchantInsights.code, insight.code)));
      }
      return;
    }
    const narrated = await this.narration.narrate(merchant.id, fingerprint, calculation.insights);
    await this.db.transaction(async (tx) => {
      const snapshot = (await tx.insert(schema.merchantAnalyticsSnapshots).values({ merchantId: merchant.id, calculationVersion: ANALYTICS_CALCULATION_VERSION, inputFingerprint: fingerprint, periodFrom: calculation.periodFrom, periodTo: calculation.periodTo, sourceCoverage: calculation.sourceCoverage, snapshot: { metrics: calculation.metrics, mixedData: calculation.mixedData }, generatedAt: now }).returning())[0];
      await tx.update(schema.merchantInsights).set({ active: false, resolvedAt: now }).where(and(eq(schema.merchantInsights.merchantId, merchant.id), eq(schema.merchantInsights.active, true)));
      if (narrated.length) await tx.insert(schema.merchantInsights).values(narrated.map((insight) => ({ merchantId: merchant.id, snapshotId: snapshot.id, code: insight.code, kind: insight.kind, priority: insight.priority, title: insight.title, summary: insight.summary, recommendation: insight.recommendation, evidence: insight.evidence, limitations: insight.limitations, narrationSource: (insight as { narrationSource?: string }).narrationSource ?? 'deterministic', active: true })));
    });
  }

  private enabledForMerchant(id: string, publicId: string) {
    if (this.config.get<string>('MERCHANT_INTELLIGENCE_ENABLED') !== 'true') return false;
    const allowlist = (this.config.get<string>('MERCHANT_INTELLIGENCE_ALLOWLIST') ?? '').split(',').map((value) => value.trim()).filter(Boolean);
    return !allowlist.length || allowlist.includes(id) || allowlist.includes(publicId);
  }

  private emptyResponse(status: 'updating' | 'disabled', message: string): MerchantInsightsResponse {
    return { status, calculationVersion: ANALYTICS_CALCULATION_VERSION, generatedAt: null, stale: false, snapshot: null, scope: { label: 'all_recorded_activity', periodFrom: null, periodTo: null, mixedData: false, sourceCoverage: {} }, insights: [], message };
  }
}
