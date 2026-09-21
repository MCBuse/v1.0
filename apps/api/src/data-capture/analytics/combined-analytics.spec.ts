import { buildCombinedAnalytics } from './combined-analytics';
import { buildTransactionAnalytics } from './transaction-analytics';
import { buildInventoryAnalytics } from './inventory-analytics';

const TIMEZONE = 'Europe/Berlin';
const RANGE = {
  from: new Date('2026-09-01T00:00:00+02:00'),
  to: new Date('2026-09-10T23:59:59+02:00'),
};
const NOW = new Date('2026-09-11T10:00:00+02:00');

function transactions(
  sales: Array<[string, bigint, 'mcbuse_payment' | 'merchant_cash']>,
  previous: bigint[] = [],
) {
  return buildTransactionAnalytics({
    sales: sales.map(([iso, amountMinor, source]) => ({
      amountMinor,
      occurredAt: new Date(`${iso}+02:00`),
      source,
      paymentMethod: source === 'merchant_cash' ? 'cash' : 'mcbuse_wallet',
    })),
    previousSales: previous.map((amountMinor, index) => ({
      amountMinor,
      occurredAt: new Date(`2026-08-2${index % 9}T10:00:00+02:00`),
      source: 'mcbuse_payment' as const,
      paymentMethod: 'mcbuse_wallet',
    })),
    range: RANGE,
    timezone: TIMEZONE,
    grouping: 'day',
    now: NOW,
  });
}

function inventory(options: {
  onHand?: number;
  sold?: number;
  restocked?: number;
  adjusted?: number;
  threshold?: number;
  anchored?: boolean;
}) {
  const {
    onHand = 50,
    sold = 20,
    restocked = 0,
    adjusted = 0,
    threshold = 5,
    anchored = true,
  } = options;

  const movements = [
    ...(anchored
      ? [
          {
            productId: 'p1',
            kind: 'opening_balance',
            onHandChange: onHand + sold - restocked - adjusted,
            occurredAt: new Date('2026-08-01T00:00:00+02:00'),
          },
        ]
      : []),
    {
      productId: 'p1',
      kind: 'sale',
      onHandChange: -sold,
      occurredAt: new Date('2026-09-03T10:00:00+02:00'),
    },
    ...(restocked
      ? [
          {
            productId: 'p1',
            kind: 'restock',
            onHandChange: restocked,
            occurredAt: new Date('2026-09-05T10:00:00+02:00'),
          },
        ]
      : []),
    ...(adjusted
      ? [
          {
            productId: 'p1',
            kind: 'adjustment',
            onHandChange: adjusted,
            occurredAt: new Date('2026-09-06T10:00:00+02:00'),
          },
        ]
      : []),
  ];

  return buildInventoryAnalytics({
    products: [
      {
        id: 'p1',
        name: 'Oat flat white',
        category: 'Drinks',
        unitPriceMinor: 350n,
        onHandQuantity: onHand,
        reservedQuantity: 0,
        lowStockThreshold: threshold,
      },
    ],
    movements,
    soldLines: [
      {
        productId: 'p1',
        quantity: sold,
        amountMinor: BigInt(sold) * 350n,
        category: 'Drinks',
        occurredAt: new Date('2026-09-03T10:00:00+02:00'),
      },
    ],
    range: RANGE,
    timezone: TIMEZONE,
  });
}

describe('combined analytics', () => {
  it('produces all four analyses the proposal names', () => {
    const result = buildCombinedAnalytics({
      transactions: transactions([
        ['2026-09-03T10:00:00', 7_000n, 'mcbuse_payment'],
      ]),
      inventory: inventory({}),
      timezone: TIMEZONE,
    });

    expect(result.analyses.map((a) => a.id)).toEqual([
      'sales_versus_stock',
      'trading_concentration',
      'volume_versus_value',
      'velocity_versus_availability',
    ]);
    for (const analysis of result.analyses) {
      expect(analysis.explanation.length).toBeGreaterThan(0);
      expect(analysis.figures.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic — identical inputs give identical output', () => {
    const build = () =>
      buildCombinedAnalytics({
        transactions: transactions([
          ['2026-09-03T10:00:00', 7_000n, 'mcbuse_payment'],
          ['2026-09-04T11:00:00', 2_000n, 'merchant_cash'],
        ]),
        inventory: inventory({ restocked: 10 }),
        timezone: TIMEZONE,
      });
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });

  describe('sales versus stock', () => {
    it('reports revenue, units, opening and closing stock and the net change', () => {
      const result = buildCombinedAnalytics({
        transactions: transactions([
          ['2026-09-03T10:00:00', 7_000n, 'mcbuse_payment'],
        ]),
        inventory: inventory({ onHand: 50, sold: 20, restocked: 10 }),
        timezone: TIMEZONE,
      });

      const analysis = result.analyses[0];
      const figures = Object.fromEntries(
        analysis.figures.map((f) => [f.key, f.value]),
      );
      expect(figures.revenueMinor).toBe('7000');
      expect(figures.unitsSold).toBe('20');
      expect(figures.restocked).toBe('10');
      expect(figures.closingStock).toBe('50');
      // Opening 60, sold 20, restocked 10, closing 50 -> net -10.
      expect(figures.openingStock).toBe('60');
      expect(figures.netStockChange).toBe('-10');
    });

    it('says so plainly when stock fell over the period', () => {
      const result = buildCombinedAnalytics({
        transactions: transactions([
          ['2026-09-03T10:00:00', 7_000n, 'mcbuse_payment'],
        ]),
        inventory: inventory({ onHand: 50, sold: 20 }),
        timezone: TIMEZONE,
      });
      expect(result.analyses[0].explanation).toMatch(/fell|decreased|down/i);
    });
  });

  describe('trading concentration', () => {
    it('defaults to the busiest contiguous three-hour window', () => {
      const result = buildCombinedAnalytics({
        transactions: transactions([
          ['2026-09-03T08:00:00', 1_000n, 'mcbuse_payment'],
          ['2026-09-03T12:00:00', 4_000n, 'mcbuse_payment'],
          ['2026-09-03T13:00:00', 4_000n, 'mcbuse_payment'],
        ]),
        inventory: inventory({}),
        timezone: TIMEZONE,
      });

      const analysis = result.analyses[1];
      const figures = Object.fromEntries(
        analysis.figures.map((f) => [f.key, f.value]),
      );
      expect(figures.windowStartHour).toBe('11');
      expect(figures.windowEndHour).toBe('13');
      expect(figures.revenueSharePercent).toBe('88.89');
      expect(analysis.explanation).toMatch(/11:00/);
    });

    it('reports honestly when there was no trading at all', () => {
      const result = buildCombinedAnalytics({
        transactions: transactions([]),
        inventory: inventory({ sold: 0 }),
        timezone: TIMEZONE,
      });
      expect(result.analyses[1].explanation).toMatch(/no .*(sales|trading)/i);
      expect(result.analyses[1].reliable).toBe(false);
    });
  });

  describe('volume versus value', () => {
    it('interprets transaction growth and revenue growth together', () => {
      const result = buildCombinedAnalytics({
        transactions: transactions(
          [
            ['2026-09-03T10:00:00', 1_000n, 'mcbuse_payment'],
            ['2026-09-04T10:00:00', 1_000n, 'mcbuse_payment'],
            ['2026-09-05T10:00:00', 1_000n, 'mcbuse_payment'],
            ['2026-09-06T10:00:00', 1_000n, 'mcbuse_payment'],
          ],
          [4_000n],
        ),
        inventory: inventory({}),
        timezone: TIMEZONE,
      });

      const analysis = result.analyses[2];
      const figures = Object.fromEntries(
        analysis.figures.map((f) => [f.key, f.value]),
      );
      // Four times the transactions for the same revenue: the ticket fell.
      expect(figures.transactionChangePercent).toBe('300');
      expect(figures.revenueChangePercent).toBe('0');
      expect(figures.averageTicketChangePercent).toBe('-75');
      expect(analysis.explanation).toMatch(/smaller|lower|fell/i);
    });

    it('declines to interpret without a baseline', () => {
      const result = buildCombinedAnalytics({
        transactions: transactions([
          ['2026-09-03T10:00:00', 1_000n, 'mcbuse_payment'],
        ]),
        inventory: inventory({}),
        timezone: TIMEZONE,
      });
      expect(result.analyses[2].reliable).toBe(false);
      expect(result.analyses[2].explanation).toMatch(
        /no .*(baseline|preceding)/i,
      );
    });
  });

  describe('velocity versus availability', () => {
    it('relates sales speed to stock on hand and the threshold', () => {
      const result = buildCombinedAnalytics({
        transactions: transactions([
          ['2026-09-03T10:00:00', 7_000n, 'mcbuse_payment'],
        ]),
        inventory: inventory({ onHand: 10, sold: 20, threshold: 5 }),
        timezone: TIMEZONE,
      });

      const analysis = result.analyses[3];
      const figures = Object.fromEntries(
        analysis.figures.map((f) => [f.key, f.value]),
      );
      expect(figures.productName).toBe('Oat flat white');
      expect(figures.unitsPerDay).toBe('2');
      expect(figures.availableQuantity).toBe('10');
      // 10 on hand less a threshold of 5, at 2 a day, is 2.5 days.
      expect(figures.daysOfCoverRemaining).toBe('2.5');
      expect(analysis.explanation).toMatch(/replenish|reorder|restock/i);
    });

    it('has nothing to say when nothing is selling', () => {
      const result = buildCombinedAnalytics({
        transactions: transactions([]),
        inventory: inventory({ sold: 0 }),
        timezone: TIMEZONE,
      });
      expect(result.analyses[3].reliable).toBe(false);
    });
  });

  it('labels physical stock as whole-stock data', () => {
    const result = buildCombinedAnalytics({
      transactions: transactions([
        ['2026-09-03T10:00:00', 7_000n, 'mcbuse_payment'],
      ]),
      inventory: inventory({}),
      timezone: TIMEZONE,
      salesFilterApplied: true,
    });
    expect(result.stockScopeNote).toMatch(/all stock|whole/i);
    expect(result.analyses[0].caveats.join(' ')).toMatch(/filter/i);
  });

  it('adds no filter caveat when no sales filter is in play', () => {
    const result = buildCombinedAnalytics({
      transactions: transactions([
        ['2026-09-03T10:00:00', 7_000n, 'mcbuse_payment'],
      ]),
      inventory: inventory({}),
      timezone: TIMEZONE,
      salesFilterApplied: false,
    });
    expect(result.analyses[0].caveats.join(' ')).not.toMatch(/filter/i);
  });
});
