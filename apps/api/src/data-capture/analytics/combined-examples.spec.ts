import {
  buildTransactionAnalytics,
  type AnalyticsSale,
} from './transaction-analytics';
import {
  buildInventoryAnalytics,
  type InventoryProduct,
  type StockMovement,
  type SoldLine,
} from './inventory-analytics';
import { buildCombinedAnalytics } from './combined-analytics';

const TIMEZONE = 'Europe/Berlin';
const RANGE = {
  from: new Date('2026-09-01T00:00:00+02:00'),
  to: new Date('2026-09-10T23:59:59+02:00'),
};

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

function soldLine(productId: string, quantity: number, day: string): SoldLine {
  return {
    productId,
    quantity,
    amountMinor: BigInt(quantity) * 500n,
    category: 'Drinks',
    occurredAt: new Date(`2026-09-${day}T12:00:00+02:00`),
  };
}

function movement(
  day: string,
  onHandChange: number,
  kind: string,
  productId = 'a',
): StockMovement {
  return {
    productId,
    kind,
    onHandChange,
    occurredAt: new Date(`2026-09-${day}T12:00:00+02:00`),
  };
}

function combine(input: {
  sales?: AnalyticsSale[];
  previousSales?: AnalyticsSale[];
  products?: InventoryProduct[];
  movements?: StockMovement[];
  soldLines?: SoldLine[];
  salesFilterApplied?: boolean;
}) {
  const transactions = buildTransactionAnalytics({
    sales: input.sales ?? [],
    previousSales: input.previousSales ?? [],
    range: RANGE,
    timezone: TIMEZONE,
    grouping: 'day',
    now: new Date('2026-09-11T12:00:00+02:00'),
  });
  const inventory = buildInventoryAnalytics({
    products: input.products ?? [],
    movements: input.movements ?? [],
    soldLines: input.soldLines ?? [],
    range: RANGE,
    timezone: TIMEZONE,
  });
  return buildCombinedAnalytics({
    transactions,
    inventory,
    timezone: TIMEZONE,
    salesFilterApplied: input.salesFilterApplied,
  });
}

const analysis = (
  result: ReturnType<typeof combine>,
  id: string,
) => result.analyses.find((a) => a.id === id)!;

/**
 * X.16 — every combined analysis, in every branch it can take.
 *
 * These are the sentences a merchant actually reads, so each one is checked
 * for saying the right thing, and for refusing to say anything when the data
 * cannot support it.
 */
describe('X.16 — the combined analyses', () => {
  it('produces all four, every time', () => {
    const result = combine({});
    expect(result.analyses.map((a) => a.id)).toEqual([
      'sales_versus_stock',
      'trading_concentration',
      'volume_versus_value',
      'velocity_versus_availability',
    ]);
    expect(result.generatedBy).toBe('deterministic-rules-v1');
  });

  describe('1. sales against stock', () => {
    it('reads opening stock back from the closing position and the movements', () => {
      const result = analysis(
        combine({
          sales: [sale('2026-09-02T10:00:00+02:00', 2500n)],
          products: [product({ id: 'a', onHandQuantity: 12 })],
          movements: [
            movement('01', 20, 'opening_balance'),
            movement('03', -5, 'cash_sale'),
            movement('05', 10, 'restock'),
            movement('07', -13, 'adjustment'),
          ],
          soldLines: [soldLine('a', 5, '03')],
        }),
        'sales_versus_stock',
      );

      const figures = Object.fromEntries(
        result.figures.map((f) => [f.key, f.value]),
      );
      // Net change is +12, so the period opened at 12 - 12 = 0.
      expect(figures.netStockChange).toBe('12');
      expect(figures.openingStock).toBe('0');
      expect(figures.closingStock).toBe('12');
      expect(figures.restocked).toBe('10');
      expect(figures.adjusted).toBe('-13');
    });

    it('names restocking and adjustments in the sentence', () => {
      const result = analysis(
        combine({
          sales: [sale('2026-09-02T10:00:00+02:00', 2500n)],
          products: [product({ id: 'a', onHandQuantity: 14 })],
          movements: [
            movement('01', 10, 'opening_balance'),
            movement('05', 6, 'restock'),
            movement('07', -2, 'adjustment'),
          ],
          soldLines: [soldLine('a', 5, '03')],
        }),
        'sales_versus_stock',
      );

      expect(result.explanation).toContain('6 units restocked');
      expect(result.explanation).toContain('2 units adjusted');
      expect(result.reliable).toBe(true);
    });

    it('leaves restocking out of the sentence when there was none', () => {
      const result = analysis(
        combine({
          sales: [sale('2026-09-02T10:00:00+02:00', 2500n)],
          products: [product({ id: 'a' })],
          movements: [movement('01', 10, 'opening_balance')],
          soldLines: [soldLine('a', 5, '03')],
        }),
        'sales_versus_stock',
      );
      expect(result.explanation).not.toContain('restocked');
    });
  });

  describe('2. trading concentration', () => {
    it('names the busiest three hours and both shares', () => {
      const result = analysis(
        combine({
          sales: [
            sale('2026-09-02T09:00:00+02:00', 1000n),
            sale('2026-09-02T10:00:00+02:00', 4000n),
            sale('2026-09-02T11:00:00+02:00', 4000n),
            sale('2026-09-02T18:00:00+02:00', 1000n),
          ],
        }),
        'trading_concentration',
      );

      expect(result.reliable).toBe(true);
      expect(result.explanation).toMatch(/busiest three hours were \d{2}:00/);
      expect(result.explanation).toContain('% of revenue');
      expect(result.explanation).toContain('% of transactions');
    });

    it('covers exactly three of the day’s hours', () => {
      const result = analysis(
        combine({
          sales: [
            sale('2026-09-02T09:00:00+02:00', 1000n),
            sale('2026-09-02T10:00:00+02:00', 4000n),
          ],
        }),
        'trading_concentration',
      );
      const figures = Object.fromEntries(
        result.figures.map((f) => [f.key, Number(f.value)]),
      );
      expect(figures.windowEndHour - figures.windowStartHour).toBe(2);
    });

    it('declines when nothing was sold', () => {
      const result = analysis(combine({}), 'trading_concentration');
      expect(result.reliable).toBe(false);
      expect(result.figures).toEqual([
        { key: 'transactionCount', label: 'Transactions', value: '0', unit: undefined },
      ]);
    });
  });

  describe('3. volume against value', () => {
    const previous = [
      sale('2026-08-22T10:00:00+02:00', 1000n),
      sale('2026-08-23T10:00:00+02:00', 1000n),
    ];

    it('reads more customers spending less', () => {
      const result = analysis(
        combine({
          sales: [
            sale('2026-09-02T10:00:00+02:00', 500n),
            sale('2026-09-02T11:00:00+02:00', 500n),
            sale('2026-09-02T12:00:00+02:00', 500n),
          ],
          previousSales: previous,
        }),
        'volume_versus_value',
      );
      expect(result.explanation).toContain('each is spending less');
      expect(result.reliable).toBe(true);
    });

    it('reads both growing', () => {
      const result = analysis(
        combine({
          sales: [
            sale('2026-09-02T10:00:00+02:00', 3000n),
            sale('2026-09-02T11:00:00+02:00', 3000n),
            sale('2026-09-02T12:00:00+02:00', 3000n),
          ],
          previousSales: previous,
        }),
        'volume_versus_value',
      );
      expect(result.explanation).toContain(
        'Both the number of sales and the size of each sale grew',
      );
    });

    it('reads fewer but larger sales', () => {
      const result = analysis(
        combine({
          sales: [sale('2026-09-02T10:00:00+02:00', 5000n)],
          previousSales: previous,
        }),
        'volume_versus_value',
      );
      expect(result.explanation).toContain('Fewer transactions, but larger');
    });

    it('reads both declining', () => {
      const result = analysis(
        combine({
          sales: [sale('2026-09-02T10:00:00+02:00', 400n)],
          previousSales: previous,
        }),
        'volume_versus_value',
      );
      expect(result.explanation).toContain(
        'Both the number of sales and their size declined',
      );
    });

    it('reads a flat period as moving in step', () => {
      const result = analysis(
        combine({
          sales: [
            sale('2026-09-02T10:00:00+02:00', 1000n),
            sale('2026-09-02T11:00:00+02:00', 1000n),
          ],
          previousSales: previous,
        }),
        'volume_versus_value',
      );
      expect(result.explanation).toContain('broadly in step');
    });

    it('refuses to interpret anything without a baseline', () => {
      const result = analysis(
        combine({ sales: [sale('2026-09-02T10:00:00+02:00', 1000n)] }),
        'volume_versus_value',
      );
      expect(result.reliable).toBe(false);
      expect(result.explanation).toContain('no baseline');
    });
  });

  describe('4. selling speed against availability', () => {
    it('counts cover down to the reorder level, not to zero', () => {
      const result = analysis(
        combine({
          sales: [sale('2026-09-02T10:00:00+02:00', 5000n)],
          products: [
            product({ id: 'a', onHandQuantity: 13, lowStockThreshold: 3 }),
          ],
          movements: [movement('01', 20, 'opening_balance')],
          soldLines: [soldLine('a', 10, '02')],
        }),
        'velocity_versus_availability',
      );

      const figures = Object.fromEntries(
        result.figures.map((f) => [f.key, f.value]),
      );
      // 10 units over 10 days is 1 a day; 13 on hand less a reorder level of 3
      // leaves 10 usable, so 10 days of cover.
      expect(figures.unitsPerDay).toBe('1');
      expect(figures.daysOfCoverRemaining).toBe('10');
    });

    it('says to reorder now when already at the reorder level', () => {
      const result = analysis(
        combine({
          sales: [sale('2026-09-02T10:00:00+02:00', 5000n)],
          products: [
            product({ id: 'a', onHandQuantity: 3, lowStockThreshold: 3 }),
          ],
          movements: [movement('01', 20, 'opening_balance')],
          soldLines: [soldLine('a', 10, '02')],
        }),
        'velocity_versus_availability',
      );
      expect(result.explanation).toContain('needs replenishing now');
    });

    it('warns when the reorder level is days away', () => {
      const result = analysis(
        combine({
          sales: [sale('2026-09-02T10:00:00+02:00', 5000n)],
          products: [
            product({ id: 'a', onHandQuantity: 5, lowStockThreshold: 3 }),
          ],
          movements: [movement('01', 20, 'opening_balance')],
          soldLines: [soldLine('a', 10, '02')],
        }),
        'velocity_versus_availability',
      );
      expect(result.explanation).toContain('replenished shortly');
    });

    it('declines when no product sold anything', () => {
      const result = analysis(
        combine({ products: [product({ id: 'a' })] }),
        'velocity_versus_availability',
      );
      expect(result.reliable).toBe(false);
      expect(result.explanation).toContain('No product recorded any sales');
    });
  });

  describe('determinism', () => {
    const input = {
      sales: [
        sale('2026-09-02T10:00:00+02:00', 2500n),
        sale('2026-09-03T14:00:00+02:00', 1500n),
      ],
      previousSales: [sale('2026-08-22T10:00:00+02:00', 1000n)],
      products: [product({ id: 'a' })],
      movements: [movement('01', 20, 'opening_balance')],
      soldLines: [soldLine('a', 8, '02')],
    };

    it('gives byte-identical output for identical input', () => {
      expect(JSON.stringify(combine(input))).toBe(
        JSON.stringify(combine(input)),
      );
    });

    it('carries no model, no randomness and no clock of its own', () => {
      const serialized = JSON.stringify(combine(input));
      expect(serialized).not.toMatch(/gpt|llama|groq|model/i);
      expect(combine(input).generatedBy).toBe('deterministic-rules-v1');
    });
  });
});
