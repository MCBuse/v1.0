import {
  buildTransactionAnalytics,
  type AnalyticsSale,
  type Grouping,
} from './transaction-analytics';
import {
  buildInventoryAnalytics,
  type InventoryProduct,
  type StockMovement,
  type SoldLine,
} from './inventory-analytics';
import { buildCombinedAnalytics } from './combined-analytics';

const TIMEZONE = 'Europe/Berlin';

/** A sale at a given Berlin-local instant. */
function sale(
  iso: string,
  minor: bigint,
  source: AnalyticsSale['source'] = 'mcbuse_payment',
): AnalyticsSale {
  return {
    amountMinor: minor,
    occurredAt: new Date(iso),
    source,
    paymentMethod: source === 'merchant_cash' ? 'cash' : 'mcbuse_wallet',
  };
}

function transactions(input: {
  sales?: AnalyticsSale[];
  previousSales?: AnalyticsSale[];
  from?: string;
  to?: string;
  grouping?: Grouping;
  now?: string;
}) {
  return buildTransactionAnalytics({
    sales: input.sales ?? [],
    previousSales: input.previousSales ?? [],
    range: {
      from: new Date(input.from ?? '2026-09-01T00:00:00+02:00'),
      to: new Date(input.to ?? '2026-09-10T23:59:59+02:00'),
    },
    timezone: TIMEZONE,
    grouping: input.grouping ?? 'day',
    now: new Date(input.now ?? '2026-09-11T12:00:00+02:00'),
  });
}

function product(
  overrides: Partial<InventoryProduct> & { id: string },
): InventoryProduct {
  return {
    name: `Product ${overrides.id}`,
    category: 'Drinks',
    unitPriceMinor: 500n,
    onHandQuantity: 10,
    reservedQuantity: 0,
    lowStockThreshold: 3,
    ...overrides,
  };
}

function inventory(input: {
  products?: InventoryProduct[];
  movements?: StockMovement[];
  soldLines?: SoldLine[];
}) {
  return buildInventoryAnalytics({
    products: input.products ?? [],
    movements: input.movements ?? [],
    soldLines: input.soldLines ?? [],
    range: {
      from: new Date('2026-09-01T00:00:00+02:00'),
      to: new Date('2026-09-10T23:59:59+02:00'),
    },
    timezone: TIMEZONE,
  });
}

/**
 * X.15 — the boundary cases analytics has to survive.
 *
 * Each of these is a state where a plausible implementation produces a
 * confident wrong answer: an empty period reported as a 100% decline, a
 * midnight sale counted on the wrong day, a mixed-source total double-counted.
 */
describe('X.15 — analytics boundaries', () => {
  describe('totals', () => {
    it('adds recorded sales exactly, with no floating point in the path', () => {
      const result = transactions({
        sales: [
          sale('2026-09-02T10:00:00+02:00', 1033n),
          sale('2026-09-02T11:00:00+02:00', 2067n),
          sale('2026-09-03T11:00:00+02:00', 1n),
        ],
      });
      expect(result.totals.salesMinor).toBe('3101');
      expect(result.totals.transactionCount).toBe(3);
    });

    it('keeps the source split summing to the whole', () => {
      const result = transactions({
        sales: [
          sale('2026-09-02T10:00:00+02:00', 1000n, 'mcbuse_payment'),
          sale('2026-09-02T11:00:00+02:00', 3000n, 'merchant_cash'),
        ],
      });

      const digital = BigInt(result.bySource.digital.amountMinor);
      const cash = BigInt(result.bySource.cash.amountMinor);
      expect((digital + cash).toString()).toBe(result.totals.salesMinor);
      expect(
        result.bySource.digital.count + result.bySource.cash.count,
      ).toBe(result.totals.transactionCount);
    });

    it('rounds the average half up, in whole minor units', () => {
      // 3002 over 3 sales is 1000.67, which rounds to 1001. The rule is
      // integer arithmetic throughout: no fraction of a cent is ever carried.
      const result = transactions({
        sales: [
          sale('2026-09-02T10:00:00+02:00', 1000n),
          sale('2026-09-02T11:00:00+02:00', 1001n),
          sale('2026-09-02T12:00:00+02:00', 1001n),
        ],
      });
      expect(result.totals.averageTransactionMinor).toBe('1001');
    });

    it('rounds down when the remainder is below half', () => {
      // 3001 over 3 is 1000.33.
      const result = transactions({
        sales: [
          sale('2026-09-02T10:00:00+02:00', 1000n),
          sale('2026-09-02T11:00:00+02:00', 1000n),
          sale('2026-09-02T12:00:00+02:00', 1001n),
        ],
      });
      expect(result.totals.averageTransactionMinor).toBe('1000');
    });
  });

  describe('timezone boundaries', () => {
    it('counts a sale just after local midnight on the local day', () => {
      // 00:30 Berlin on the 3rd is 22:30 UTC on the 2nd.
      const result = transactions({
        sales: [sale('2026-09-03T00:30:00+02:00', 500n)],
      });
      const third = result.series.find((p) => p.label.includes('2026-09-03'));
      expect(third?.count).toBe(1);
    });

    it('counts a sale just before local midnight on the same local day', () => {
      const result = transactions({
        sales: [sale('2026-09-03T23:30:00+02:00', 500n)],
      });
      const third = result.series.find((p) => p.label.includes('2026-09-03'));
      expect(third?.count).toBe(1);
    });

    it('puts a late-evening sale in the local hour, not the UTC hour', () => {
      const result = transactions({
        sales: [sale('2026-09-03T23:30:00+02:00', 500n)],
      });
      expect(result.hourly[23].count).toBe(1);
      expect(result.hourly[21].count).toBe(0);
    });

    it('reports all twenty-four hours whether or not they traded', () => {
      const result = transactions({
        sales: [sale('2026-09-03T09:30:00+02:00', 500n)],
      });
      expect(result.hourly).toHaveLength(24);
      expect(result.hourly.map((h) => h.hour)).toEqual(
        Array.from({ length: 24 }, (_, hour) => hour),
      );
    });
  });

  describe('empty periods', () => {
    it('reports zero rather than refusing to answer', () => {
      const result = transactions({ sales: [] });
      expect(result.totals).toEqual({
        salesMinor: '0',
        transactionCount: 0,
        averageTransactionMinor: '0',
      });
    });

    it('has no peak hour and no trading window when nothing happened', () => {
      const result = transactions({ sales: [] });
      expect(result.peakHour).toBeNull();
      expect(result.tradingWindow).toBeNull();
      expect(result.busiestWindow).toBeNull();
    });

    it('says there is no trading pattern rather than describing one', () => {
      const combined = buildCombinedAnalytics({
        transactions: transactions({ sales: [] }),
        inventory: inventory({}),
        timezone: TIMEZONE,
      });
      const concentration = combined.analyses.find(
        (a) => a.id === 'trading_concentration',
      )!;
      expect(concentration.reliable).toBe(false);
      expect(concentration.explanation).toContain('no sales in this period');
    });
  });

  describe('missing baselines', () => {
    it('reports no percentage at all rather than 100%', () => {
      const result = transactions({
        sales: [sale('2026-09-02T10:00:00+02:00', 1000n)],
        previousSales: [],
      });
      expect(result.trends.sales.baselineAvailable).toBe(false);
      expect(result.trends.sales.changePercent).toBeNull();
    });

    it('declines to interpret growth without a baseline', () => {
      const combined = buildCombinedAnalytics({
        transactions: transactions({
          sales: [sale('2026-09-02T10:00:00+02:00', 1000n)],
          previousSales: [],
        }),
        inventory: inventory({}),
        timezone: TIMEZONE,
      });
      const volume = combined.analyses.find(
        (a) => a.id === 'volume_versus_value',
      )!;
      expect(volume.reliable).toBe(false);
      expect(volume.explanation).toContain('no baseline');
    });

    it('does give a percentage once a baseline exists', () => {
      const result = transactions({
        sales: [sale('2026-09-02T10:00:00+02:00', 2000n)],
        previousSales: [sale('2026-08-25T10:00:00+02:00', 1000n)],
      });
      expect(result.trends.sales.baselineAvailable).toBe(true);
      expect(result.trends.sales.changePercent).toBe(100);
    });
  });

  describe('mixed sources', () => {
    it('keeps cash and digital in separate buckets', () => {
      const result = transactions({
        sales: [
          sale('2026-09-02T10:00:00+02:00', 1000n, 'mcbuse_payment'),
          sale('2026-09-02T10:30:00+02:00', 1000n, 'merchant_cash'),
        ],
      });
      expect(result.bySource.digital.count).toBe(1);
      expect(result.bySource.cash.count).toBe(1);
    });

    it('splits the shares to a hundred percent between them', () => {
      const result = transactions({
        sales: [
          sale('2026-09-02T10:00:00+02:00', 3000n, 'mcbuse_payment'),
          sale('2026-09-02T10:30:00+02:00', 1000n, 'merchant_cash'),
        ],
      });
      expect(
        result.bySource.digital.amountSharePercent +
          result.bySource.cash.amountSharePercent,
      ).toBe(100);
    });

    it('groups by payment method independently of capture channel', () => {
      const result = transactions({
        sales: [
          sale('2026-09-02T10:00:00+02:00', 1000n, 'mcbuse_payment'),
          sale('2026-09-02T10:30:00+02:00', 1000n, 'merchant_cash'),
        ],
      });
      expect(result.byPaymentMethod.map((m) => m.method).sort()).toEqual([
        'cash',
        'mcbuse_wallet',
      ]);
    });
  });

  describe('incomplete stock history', () => {
    it('refuses a turnover ratio without an opening balance', () => {
      const result = inventory({
        products: [product({ id: 'a' })],
        soldLines: [
          {
            productId: 'a',
            quantity: 5,
            amountMinor: 2500n,
            category: 'Drinks',
            occurredAt: new Date('2026-09-02T10:00:00+02:00'),
          },
        ],
      });
      const turnover = result.turnover.find((t) => t.productId === 'a')!;
      expect(turnover.eligible).toBe(false);
      expect(turnover.turnoverRatio).toBeNull();
    });

    it('says why, rather than reporting a blank', () => {
      const result = inventory({ products: [product({ id: 'a' })] });
      expect(result.turnover[0].reason).toMatch(/opening stock/i);
    });

    it('still reports the stock position it does know', () => {
      const result = inventory({
        products: [product({ id: 'a', onHandQuantity: 7 })],
      });
      expect(result.position.onHandQuantity).toBe(7);
    });
  });

  describe('the filter caveat', () => {
    it('is added only when a filter is applied', () => {
      const withFilter = buildCombinedAnalytics({
        transactions: transactions({
          sales: [sale('2026-09-02T10:00:00+02:00', 1000n)],
        }),
        inventory: inventory({ products: [product({ id: 'a' })] }),
        timezone: TIMEZONE,
        salesFilterApplied: true,
      });
      const without = buildCombinedAnalytics({
        transactions: transactions({
          sales: [sale('2026-09-02T10:00:00+02:00', 1000n)],
        }),
        inventory: inventory({ products: [product({ id: 'a' })] }),
        timezone: TIMEZONE,
      });

      expect(
        withFilter.analyses.every((a) =>
          a.caveats.some((c) => c.includes('filtered but stock is not')),
        ),
      ).toBe(true);
      expect(without.analyses.every((a) => a.caveats.length === 0)).toBe(true);
    });

    it('always carries the stock scope note either way', () => {
      const result = buildCombinedAnalytics({
        transactions: transactions({}),
        inventory: inventory({}),
        timezone: TIMEZONE,
      });
      expect(result.stockScopeNote).toContain('all stock');
    });
  });
});
