import { performance } from 'node:perf_hooks';
import {
  buildTransactionAnalytics,
  type AnalyticsSale,
} from './transaction-analytics';
import {
  buildInventoryAnalytics,
  type InventoryProduct,
  type SoldLine,
  type StockMovement,
} from './inventory-analytics';
import { buildCombinedAnalytics } from './combined-analytics';

/**
 * P.1 — the General Analytics calculators at the plan's benchmark scale:
 * 100,000 transactions across 1,000 products.
 *
 * These three calculators were added after the original benchmark was written,
 * so the existing insight-engine harness said nothing about them. They are
 * pure functions over arrays, which is exactly the shape that quietly becomes
 * quadratic, so the figure is worth having and worth bounding.
 *
 *   pnpm --filter api analytics:load
 */

const TRANSACTIONS = Number(process.env.LOAD_TRANSACTIONS ?? 100_000);
const PRODUCTS = Number(process.env.LOAD_PRODUCTS ?? 1_000);
const TIMEZONE = 'Africa/Accra';
/** The whole run must stay inside this, or the demonstration is not viable. */
const BUDGET_MS = Number(process.env.LOAD_BUDGET_MS ?? 120_000);

const now = new Date('2026-09-18T12:00:00.000Z');
const from = new Date(now.getTime() - 90 * 86_400_000);

const products: InventoryProduct[] = Array.from(
  { length: PRODUCTS },
  (_, index) => ({
    id: `product-${index}`,
    name: `Product ${index}`,
    category: `Category ${index % 20}`,
    unitPriceMinor: BigInt(100 + (index % 900)),
    onHandQuantity: 200,
    reservedQuantity: index % 7,
    lowStockThreshold: 10,
  }),
);

const sales: AnalyticsSale[] = Array.from(
  { length: TRANSACTIONS },
  (_, index) => ({
    amountMinor: BigInt(100 + (index % 5_000)),
    occurredAt: new Date(
      now.getTime() - (index % 90) * 86_400_000 - (index % 24) * 3_600_000,
    ),
    source: index % 4 ? 'mcbuse_payment' : 'merchant_cash',
    paymentMethod: index % 4 ? 'mcbuse_wallet' : 'cash',
  }),
);

// A comparable preceding period, so the trend path is exercised too.
const previousSales: AnalyticsSale[] = sales
  .slice(0, Math.floor(TRANSACTIONS / 2))
  .map((sale) => ({
    ...sale,
    occurredAt: new Date(sale.occurredAt.getTime() - 90 * 86_400_000),
  }));

const soldLines: SoldLine[] = sales.map((sale, index) => ({
  productId: products[index % PRODUCTS]!.id,
  quantity: 1 + (index % 3),
  amountMinor: sale.amountMinor,
  category: index % 5 ? products[index % PRODUCTS]!.category : null,
  occurredAt: sale.occurredAt,
}));

const movements: StockMovement[] = [
  ...products.map((product) => ({
    productId: product.id,
    kind: 'opening_balance',
    onHandChange: 500,
    occurredAt: from,
  })),
  ...soldLines.map((line) => ({
    productId: line.productId,
    kind: 'digital_sale',
    onHandChange: -line.quantity,
    occurredAt: line.occurredAt,
  })),
];

function measure<T>(label: string, work: () => T): { label: string; ms: number; value: T } {
  const started = performance.now();
  const value = work();
  return { label, ms: Math.round(performance.now() - started), value };
}

const transactions = measure('transactions', () =>
  buildTransactionAnalytics({
    sales,
    previousSales,
    range: { from, to: now },
    timezone: TIMEZONE,
    grouping: 'day',
    now,
  }),
);

const inventory = measure('inventory', () =>
  buildInventoryAnalytics({
    products,
    movements,
    soldLines,
    range: { from, to: now },
    timezone: TIMEZONE,
  }),
);

const combined = measure('combined', () =>
  buildCombinedAnalytics({
    transactions: transactions.value,
    inventory: inventory.value,
    timezone: TIMEZONE,
  }),
);

const totalMs = transactions.ms + inventory.ms + combined.ms;

process.stdout.write(
  `${JSON.stringify(
    {
      transactionCount: TRANSACTIONS,
      productCount: PRODUCTS,
      movementCount: movements.length,
      transactionsMs: transactions.ms,
      inventoryMs: inventory.ms,
      combinedMs: combined.ms,
      totalMs,
      budgetMs: BUDGET_MS,
      seriesPoints: transactions.value.series.length,
      turnoverRows: inventory.value.turnover.length,
      analyses: combined.value.analyses.length,
    },
    null,
    2,
  )}\n`,
);

if (totalMs > BUDGET_MS) {
  throw new Error(
    `General Analytics took ${totalMs}ms at ${TRANSACTIONS} transactions, over the ${BUDGET_MS}ms budget`,
  );
}
