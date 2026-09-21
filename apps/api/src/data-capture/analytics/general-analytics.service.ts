import type { GeneralAnalyticsResponse as SharedGeneralAnalyticsResponse } from '@repo/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, isNotNull, lte } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.provider';
import * as schema from '../../database/schema';
import { MerchantService } from '../merchant.service';
import {
  buildTransactionAnalytics,
  type AnalyticsSale,
  type Grouping,
  type TransactionAnalytics,
} from './transaction-analytics';
import {
  buildInventoryAnalytics,
  type InventoryAnalytics,
  type SoldLine,
} from './inventory-analytics';
import {
  buildCombinedAnalytics,
  type CombinedAnalytics,
} from './combined-analytics';

export type EvidenceEnvironment = 'live' | 'test' | 'synthetic' | 'unknown';
export type SourceFilter = 'mcbuse_payment' | 'merchant_cash';

export type NamedPeriod = 'today' | '7d' | '30d' | '90d' | '180d' | '365d';

export interface GeneralAnalyticsQuery {
  /** An explicit range wins; otherwise the named period decides. */
  from?: Date;
  to?: Date;
  period?: NamedPeriod;
  grouping?: Grouping;
  source?: SourceFilter;
  environment?: EvidenceEnvironment;
  now?: Date;
}

/**
 * The shape the clients are typed against. Declaring the local interface to
 * extend it makes drift between the API and `@repo/shared` a compile error
 * rather than something a chart discovers at runtime.
 */
export type GeneralAnalyticsContract = SharedGeneralAnalyticsResponse;

export interface GeneralAnalytics extends GeneralAnalyticsContract {
  transactions: TransactionAnalytics;
  inventory: InventoryAnalytics;
  combined: CombinedAnalytics;
  filters: {
    source: SourceFilter | 'all';
    environment: EvidenceEnvironment | 'all';
    applied: boolean;
  };
}

/**
 * Gathers the records the three analytics calculators need and hands them
 * over. All the arithmetic lives in the pure modules; this only reads.
 *
 * Cash sales carry no evidence environment of their own, so an environment
 * filter excludes them unless it is explicitly `unknown` — which is what they
 * are. Guessing otherwise would quietly move merchant-entered money into a
 * bucket it was never recorded in.
 */
@Injectable()
export class GeneralAnalyticsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly merchants: MerchantService,
  ) {}

  async forMerchant(
    userId: string,
    query: GeneralAnalyticsQuery,
  ): Promise<GeneralAnalytics> {
    const merchant = await this.merchants.requireMerchant(userId);
    const now = query.now ?? new Date();
    const { from, to } = resolveRange(query, now, merchant.timezone);
    const grouping = query.grouping ?? 'day';

    // The comparable preceding window, same length, ending where this begins.
    const span = to.getTime() - from.getTime();
    const previousFrom = new Date(from.getTime() - span);
    const previousTo = from;

    const includesDigital = !query.source || query.source === 'mcbuse_payment';
    const includesCash = !query.source || query.source === 'merchant_cash';
    const environmentAllows = (environment: string) =>
      !query.environment || environment === query.environment;
    // Cash is only ever `unknown`, so any other environment filter excludes it.
    const cashAllowed = includesCash && environmentAllows('unknown');

    const [
      digitalRows,
      cashRows,
      previousDigitalRows,
      previousCashRows,
      products,
      movements,
      digitalLines,
      cashLines,
    ] = await Promise.all([
      this.db
        .select({
          amount: schema.merchantTransactions.displayAmountMinor,
          occurredAt: schema.merchantTransactions.occurredAt,
          environment: schema.merchantTransactions.evidenceEnvironment,
        })
        .from(schema.merchantTransactions)
        .where(
          and(
            eq(schema.merchantTransactions.merchantId, merchant.merchantId),
            eq(schema.merchantTransactions.status, 'finalized'),
            gte(schema.merchantTransactions.occurredAt, from),
            lte(schema.merchantTransactions.occurredAt, to),
          ),
        ),
      this.db
        .select({
          amount: schema.merchantCashSales.amountMinor,
          occurredAt: schema.merchantCashSales.occurredAt,
        })
        .from(schema.merchantCashSales)
        .where(
          and(
            eq(schema.merchantCashSales.merchantId, merchant.merchantId),
            eq(schema.merchantCashSales.status, 'recorded'),
            gte(schema.merchantCashSales.occurredAt, from),
            lte(schema.merchantCashSales.occurredAt, to),
          ),
        ),
      this.db
        .select({
          amount: schema.merchantTransactions.displayAmountMinor,
          occurredAt: schema.merchantTransactions.occurredAt,
          environment: schema.merchantTransactions.evidenceEnvironment,
        })
        .from(schema.merchantTransactions)
        .where(
          and(
            eq(schema.merchantTransactions.merchantId, merchant.merchantId),
            eq(schema.merchantTransactions.status, 'finalized'),
            gte(schema.merchantTransactions.occurredAt, previousFrom),
            lte(schema.merchantTransactions.occurredAt, previousTo),
          ),
        ),
      this.db
        .select({
          amount: schema.merchantCashSales.amountMinor,
          occurredAt: schema.merchantCashSales.occurredAt,
        })
        .from(schema.merchantCashSales)
        .where(
          and(
            eq(schema.merchantCashSales.merchantId, merchant.merchantId),
            eq(schema.merchantCashSales.status, 'recorded'),
            gte(schema.merchantCashSales.occurredAt, previousFrom),
            lte(schema.merchantCashSales.occurredAt, previousTo),
          ),
        ),
      this.db
        .select({
          id: schema.merchantProducts.id,
          name: schema.merchantProducts.name,
          category: schema.merchantProducts.category,
          unitPriceMinor: schema.merchantProducts.unitPriceMinor,
          onHandQuantity: schema.merchantProducts.onHandQuantity,
          reservedQuantity: schema.merchantProducts.reservedQuantity,
          lowStockThreshold: schema.merchantProducts.lowStockThreshold,
        })
        .from(schema.merchantProducts)
        .where(eq(schema.merchantProducts.merchantId, merchant.merchantId)),
      this.db
        .select({
          productId: schema.merchantStockMovements.productId,
          kind: schema.merchantStockMovements.kind,
          onHandChange: schema.merchantStockMovements.onHandChange,
          occurredAt: schema.merchantStockMovements.occurredAt,
        })
        .from(schema.merchantStockMovements)
        .where(
          eq(schema.merchantStockMovements.merchantId, merchant.merchantId),
        ),
      this.db
        .select({
          productId: schema.merchantInvoiceItems.productId,
          quantity: schema.merchantInvoiceItems.quantity,
          amount: schema.merchantInvoiceItems.lineTotalMinor,
          category: schema.merchantInvoiceItems.category,
          occurredAt: schema.merchantTransactions.occurredAt,
          environment: schema.merchantTransactions.evidenceEnvironment,
        })
        .from(schema.merchantInvoiceItems)
        .innerJoin(
          schema.merchantTransactions,
          eq(
            schema.merchantTransactions.paymentRequestId,
            schema.merchantInvoiceItems.paymentRequestId,
          ),
        )
        .where(
          and(
            eq(schema.merchantTransactions.merchantId, merchant.merchantId),
            eq(schema.merchantTransactions.status, 'finalized'),
            isNotNull(schema.merchantInvoiceItems.productId),
            gte(schema.merchantTransactions.occurredAt, from),
            lte(schema.merchantTransactions.occurredAt, to),
          ),
        ),
      this.db
        .select({
          productId: schema.merchantCashSaleItems.productId,
          quantity: schema.merchantCashSaleItems.quantity,
          amount: schema.merchantCashSaleItems.lineTotalMinor,
          category: schema.merchantCashSaleItems.category,
          occurredAt: schema.merchantCashSales.occurredAt,
        })
        .from(schema.merchantCashSaleItems)
        .innerJoin(
          schema.merchantCashSales,
          eq(
            schema.merchantCashSales.id,
            schema.merchantCashSaleItems.cashSaleId,
          ),
        )
        .where(
          and(
            eq(schema.merchantCashSales.merchantId, merchant.merchantId),
            eq(schema.merchantCashSales.status, 'recorded'),
            isNotNull(schema.merchantCashSaleItems.productId),
            gte(schema.merchantCashSales.occurredAt, from),
            lte(schema.merchantCashSales.occurredAt, to),
          ),
        ),
    ]);

    const toSale = (
      row: { amount: bigint; occurredAt: Date },
      source: SourceFilter,
    ): AnalyticsSale => ({
      amountMinor: row.amount,
      occurredAt: row.occurredAt,
      source,
      paymentMethod: source === 'merchant_cash' ? 'cash' : 'mcbuse_wallet',
    });

    const sales: AnalyticsSale[] = [
      ...(includesDigital
        ? digitalRows
            .filter((row) => environmentAllows(row.environment))
            .map((row) => toSale(row, 'mcbuse_payment'))
        : []),
      ...(cashAllowed
        ? cashRows.map((row) => toSale(row, 'merchant_cash'))
        : []),
    ];

    const previousSales: AnalyticsSale[] = [
      ...(includesDigital
        ? previousDigitalRows
            .filter((row) => environmentAllows(row.environment))
            .map((row) => toSale(row, 'mcbuse_payment'))
        : []),
      ...(cashAllowed
        ? previousCashRows.map((row) => toSale(row, 'merchant_cash'))
        : []),
    ];

    const productById = new Map(products.map((p) => [p.id, p]));
    const soldLines: SoldLine[] = [
      ...(includesDigital
        ? digitalLines
            .filter((line) => environmentAllows(line.environment))
            .map((line) => ({
              productId: line.productId!,
              quantity: line.quantity,
              amountMinor: line.amount,
              // Captured on the line since migration 0028. Rows written before
              // it stay null and fall back to the product's current category,
              // labelled as such rather than presented as recorded history.
              category: line.category,
              occurredAt: line.occurredAt,
            }))
        : []),
      ...(cashAllowed
        ? cashLines.map((line) => ({
            productId: line.productId!,
            quantity: line.quantity,
            amountMinor: line.amount,
            category: line.category,
            occurredAt: line.occurredAt,
          }))
        : []),
    ].filter((line) => productById.has(line.productId));

    const transactions = buildTransactionAnalytics({
      sales,
      previousSales,
      range: { from, to },
      timezone: merchant.timezone,
      grouping,
      now,
    });

    const inventory = buildInventoryAnalytics({
      products,
      movements,
      soldLines,
      range: { from, to },
      timezone: merchant.timezone,
    });

    const applied = Boolean(query.source || query.environment);

    return {
      transactions,
      inventory,
      combined: buildCombinedAnalytics({
        transactions,
        inventory,
        timezone: merchant.timezone,
        salesFilterApplied: applied,
      }),
      filters: {
        source: query.source ?? 'all',
        environment: query.environment ?? 'all',
        applied,
      },
    };
  }
}

const PERIOD_DAYS: Record<Exclude<NamedPeriod, 'today'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '180d': 180,
  '365d': 365,
};

/**
 * Turns a query into a concrete window.
 *
 * "Today" means the merchant's own calendar day, not the last twenty-four
 * hours: a shop that opened at 07:00 wants today's takings, not a rolling
 * window that still includes yesterday evening.
 */
function resolveRange(
  query: GeneralAnalyticsQuery,
  now: Date,
  timezone: string,
): { from: Date; to: Date } {
  if (query.from || query.to) {
    return {
      from: query.from ?? new Date(now.getTime() - 30 * 86_400_000),
      to: query.to ?? now,
    };
  }

  if (query.period === 'today') {
    return { from: startOfLocalDay(now, timezone), to: now };
  }

  const days = PERIOD_DAYS[query.period ?? '30d'];
  return { from: new Date(now.getTime() - days * 86_400_000), to: now };
}

/** Midnight of the merchant-local calendar day containing `at`. */
function startOfLocalDay(at: Date, timeZone: string): Date {
  const key = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
  const naive = Date.parse(`${key}T00:00:00.000Z`);
  // The offset the zone was at that instant, so DST is respected.
  const asLocal = new Date(
    new Date(naive).toLocaleString('en-US', { timeZone }),
  ).getTime();
  const asUtc = new Date(
    new Date(naive).toLocaleString('en-US', { timeZone: 'UTC' }),
  ).getTime();
  return new Date(naive - (asLocal - asUtc));
}
