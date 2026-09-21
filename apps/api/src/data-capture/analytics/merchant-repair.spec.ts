import { buildInventoryAnalytics } from './inventory-analytics';
import { buildTransactionAnalytics } from './transaction-analytics';
import { buildCombinedAnalytics } from './combined-analytics';
const from = new Date('2026-09-01T00:00:00Z');
const to = new Date('2026-09-02T23:59:59.999Z');
const product = {
  id: 'p',
  name: 'Rice',
  category: 'Food',
  unitPriceMinor: 100n,
  onHandQuantity: 48,
  reservedQuantity: 46,
  lowStockThreshold: 3,
};
const movement = (at: string, kind: string, onHandChange: number) => ({
  productId: 'p',
  kind,
  onHandChange,
  occurredAt: new Date(at),
});
const input = {
  products: [product],
  movements: [
    movement('2026-08-31T00:00:00Z', 'opening_balance', 20),
    movement('2026-09-01T12:00:00Z', 'manual_adjustment', 10),
    movement('2026-09-02T12:00:00Z', 'cash_sale', -2),
    movement('2026-09-03T12:00:00Z', 'restock', 20),
  ],
  soldLines: [
    {
      productId: 'p',
      quantity: 2,
      amountMinor: 200n,
      category: 'Food',
      occurredAt: new Date('2026-09-02T12:00:00Z'),
    },
  ],
  range: { from, to },
  timezone: 'UTC',
};
const transactions = () =>
  buildTransactionAnalytics({
    sales: [],
    previousSales: [],
    range: { from, to },
    timezone: 'UTC',
    grouping: 'day',
    now: new Date('2026-09-20T00:00:00Z'),
  });
describe('review examples', () => {
  it('reverses movements after the selected end, preserving current stock separately', () => {
    const result = buildInventoryAnalytics(input);
    expect(result.position).toEqual({
      onHandQuantity: 48,
      reservedQuantity: 46,
      availableQuantity: 2,
    });
    expect(result.periodPosition).toMatchObject({
      openingOnHand: 20,
      closingOnHand: 28,
      eligible: true,
    });
    expect(result.turnover[0].averageDailyOnHand).toBe(29);
    expect(result.atOrBelowMinimum[0].availableQuantity).toBe(2);
    const combined = buildCombinedAnalytics({
      inventory: result,
      transactions: transactions(),
      timezone: 'UTC',
    });
    const figures = Object.fromEntries(
      combined.analyses[0].figures.map((f) => [f.key, f.value]),
    );
    expect(figures).toMatchObject({
      openingStock: '20',
      closingStock: '28',
      adjusted: '10',
    });
  });
  it('refuses unsupported stock history', () => {
    const result = buildInventoryAnalytics({
      ...input,
      movements: input.movements.slice(1),
    });
    expect(result.periodPosition.eligible).toBe(false);
    expect(result.turnover[0].averageDailyOnHand).toBeNull();
  });
  it.each(['day', 'week', 'month'] as const)(
    'labels clipped %s periods and includes exact timestamp boundaries',
    (grouping) => {
      const result = buildTransactionAnalytics({
        sales: [],
        previousSales: [],
        range: {
          from: new Date('2026-09-01T00:00:00.001Z'),
          to: new Date('2026-09-02T23:59:59.998Z'),
        },
        timezone: 'UTC',
        grouping,
        now: new Date('2026-09-20T00:00:00Z'),
      });
      expect(result.series[0].partialReasons).toContain('range_start');
      expect(result.series.at(-1)?.partialReasons).toContain('range_end');
    },
  );
});
