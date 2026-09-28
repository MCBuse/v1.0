import {
  buildInventoryAnalytics,
  type InventoryProduct,
  type StockMovement,
  type SoldLine,
} from './inventory-analytics';

const TIMEZONE = 'Europe/Berlin';
const RANGE = {
  from: new Date('2026-09-01T00:00:00+02:00'),
  to: new Date('2026-09-10T23:59:59+02:00'),
};

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

function build(input: {
  products?: InventoryProduct[];
  movements?: StockMovement[];
  soldLines?: SoldLine[];
}) {
  return buildInventoryAnalytics({
    products: input.products ?? [],
    movements: input.movements ?? [],
    soldLines: input.soldLines ?? [],
    range: RANGE,
    timezone: TIMEZONE,
  });
}

describe('inventory analytics', () => {
  describe('stock position', () => {
    it('reports on-hand, reserved and available separately', () => {
      const result = build({
        products: [
          product({ id: 'a', onHandQuantity: 10, reservedQuantity: 3 }),
        ],
      });
      expect(result.position).toEqual({
        onHandQuantity: 10,
        reservedQuantity: 3,
        availableQuantity: 7,
      });
    });

    it('never reports negative availability', () => {
      const result = build({
        products: [
          product({ id: 'a', onHandQuantity: 2, reservedQuantity: 5 }),
        ],
      });
      expect(result.position.availableQuantity).toBe(0);
    });
  });

  describe('valuation', () => {
    it('values inventory at current selling prices', () => {
      const result = build({
        products: [
          product({ id: 'a', onHandQuantity: 4, unitPriceMinor: 250n }),
          product({ id: 'b', onHandQuantity: 2, unitPriceMinor: 1_000n }),
        ],
      });
      expect(result.valuation.atSellingPriceMinor).toBe('3000');
    });

    it('states plainly that this is not cost, profit or margin', () => {
      const result = build({ products: [product({ id: 'a' })] });
      expect(result.valuation.basis).toBe('current_selling_price');
      expect(result.valuation.note).toMatch(/not.*(cost|purchase)/i);
    });
  });

  describe('movements by type', () => {
    it('totals each movement kind within the period', () => {
      const result = build({
        movements: [
          movement('a', 'restock', 20, '2026-09-02T10:00:00'),
          movement('a', 'restock', 5, '2026-09-03T10:00:00'),
          movement('a', 'sale', -4, '2026-09-04T10:00:00'),
          movement('a', 'adjustment', -1, '2026-09-05T10:00:00'),
        ],
      });
      expect(result.movementsByKind).toEqual([
        { kind: 'restock', quantity: 25, entries: 2 },
        { kind: 'adjustment', quantity: -1, entries: 1 },
        { kind: 'sale', quantity: -4, entries: 1 },
      ]);
    });

    it('ignores movements outside the period', () => {
      const result = build({
        movements: [
          movement('a', 'restock', 20, '2026-08-15T10:00:00'),
          movement('a', 'restock', 5, '2026-09-03T10:00:00'),
        ],
      });
      expect(result.movementsByKind).toEqual([
        { kind: 'restock', quantity: 5, entries: 1 },
      ]);
    });
  });

  describe('movement rankings', () => {
    it('ranks fast movers by units sold per day', () => {
      const result = build({
        products: [product({ id: 'a' }), product({ id: 'b' })],
        soldLines: [
          sold('a', 30, '2026-09-02T10:00:00'),
          sold('b', 10, '2026-09-02T10:00:00'),
        ],
      });
      // The range is ten days, so 30 units is 3 per day.
      expect(result.fastMoving[0]).toMatchObject({
        productId: 'a',
        unitsSold: 30,
        unitsPerDay: 3,
      });
      expect(result.fastMoving[1]).toMatchObject({
        productId: 'b',
        unitsPerDay: 1,
      });
    });

    it('lists slow movers that sold something but very little', () => {
      const result = build({
        products: [product({ id: 'a' }), product({ id: 'b' })],
        soldLines: [
          sold('a', 100, '2026-09-02T10:00:00'),
          sold('b', 1, '2026-09-02T10:00:00'),
        ],
      });
      expect(result.slowMoving.map((p) => p.productId)).toContain('b');
      expect(result.slowMoving.map((p) => p.productId)).not.toContain('a');
    });

    it('lists stocked products that sold nothing at all', () => {
      const result = build({
        products: [
          product({ id: 'a', onHandQuantity: 5 }),
          product({ id: 'b', onHandQuantity: 5 }),
        ],
        soldLines: [sold('a', 3, '2026-09-02T10:00:00')],
      });
      expect(result.stockedButUnsold.map((p) => p.productId)).toEqual(['b']);
    });

    it('lists every product with its current stock and category', () => {
      const result = build({
        products: [
          product({
            id: 'a',
            name: 'Latte',
            category: 'Coffee',
            onHandQuantity: 7,
          }),
          product({
            id: 'b',
            name: 'Scone',
            category: 'Bakery',
            onHandQuantity: 0,
          }),
          product({
            id: 'c',
            name: 'Water',
            category: null,
            onHandQuantity: 4,
          }),
        ],
        soldLines: [sold('a', 3, '2026-09-02T10:00:00')],
      });
      // Sold, out of stock and unsold products all appear, grouped by category.
      expect(result.stock.map((p) => p.productId)).toEqual(['b', 'a', 'c']);
      expect(result.stock[1]).toMatchObject({
        name: 'Latte',
        category: 'Coffee',
        onHandQuantity: 7,
        unitsSold: 3,
      });
      expect(result.stock[2]?.category).toBeNull();
    });

    it('does not call an out-of-stock product unsold stock', () => {
      const result = build({
        products: [product({ id: 'b', onHandQuantity: 0 })],
        soldLines: [],
      });
      expect(result.stockedButUnsold).toEqual([]);
    });
  });

  describe('thresholds', () => {
    it('separates products at or below minimum from those approaching it', () => {
      const result = build({
        products: [
          product({ id: 'at', onHandQuantity: 3, lowStockThreshold: 3 }),
          product({ id: 'below', onHandQuantity: 1, lowStockThreshold: 3 }),
          product({ id: 'near', onHandQuantity: 4, lowStockThreshold: 3 }),
          product({ id: 'fine', onHandQuantity: 50, lowStockThreshold: 3 }),
        ],
      });
      expect(result.atOrBelowMinimum.map((p) => p.productId).sort()).toEqual([
        'at',
        'below',
      ]);
      expect(result.approachingMinimum.map((p) => p.productId)).toEqual([
        'near',
      ]);
    });

    it('reports current stock-outs', () => {
      const result = build({
        products: [
          product({ id: 'empty', onHandQuantity: 0 }),
          product({ id: 'stocked', onHandQuantity: 4 }),
        ],
      });
      expect(result.currentStockOuts.map((p) => p.productId)).toEqual([
        'empty',
      ]);
    });
  });

  describe('turnover', () => {
    it('divides units sold by average daily closing on-hand stock', () => {
      // Opening 100, one sale of 20 on day 2. Closing stock is 100 for the
      // first day and 80 for the remaining nine, averaging 82.
      const result = build({
        products: [product({ id: 'a', onHandQuantity: 80 })],
        movements: [
          movement('a', 'opening_balance', 100, '2026-08-01T00:00:00'),
          movement('a', 'sale', -20, '2026-09-02T10:00:00'),
        ],
        soldLines: [sold('a', 20, '2026-09-02T10:00:00')],
      });

      const turnover = result.turnover.find((t) => t.productId === 'a');
      expect(turnover?.unitsSold).toBe(20);
      expect(turnover?.averageDailyOnHand).toBeCloseTo(82, 1);
      expect(turnover?.turnoverRatio).toBeCloseTo(20 / 82, 4);
    });

    it('reports insufficient history when opening stock is unknown', () => {
      const result = build({
        products: [product({ id: 'a', onHandQuantity: 10 })],
        movements: [],
        soldLines: [sold('a', 5, '2026-09-02T10:00:00')],
      });
      const turnover = result.turnover.find((t) => t.productId === 'a');
      expect(turnover?.eligible).toBe(false);
      expect(turnover?.reason).toMatch(/opening stock/i);
      expect(turnover?.turnoverRatio).toBeNull();
    });

    it('anchors a product that was created part way through the period', () => {
      // Created on the 5th with 30 units, then 6 sold. Before it existed its
      // stock was zero, which the backward walk reproduces.
      const result = build({
        products: [product({ id: 'a', onHandQuantity: 24 })],
        movements: [
          movement('a', 'opening_balance', 30, '2026-09-05T09:00:00'),
          movement('a', 'sale', -6, '2026-09-07T10:00:00'),
        ],
        soldLines: [sold('a', 6, '2026-09-07T10:00:00')],
      });
      const turnover = result.turnover.find((t) => t.productId === 'a');
      expect(turnover?.eligible).toBe(true);
      expect(turnover?.turnoverRatio).not.toBeNull();
    });

    it('refuses a ratio when movements contradict current stock', () => {
      // A sale dated before the product's opening balance leaves the backward
      // walk at a negative level, which is impossible.
      const result = build({
        products: [product({ id: 'a', onHandQuantity: 5 })],
        movements: [
          movement('a', 'opening_balance', 40, '2026-09-09T10:00:00'),
          movement('a', 'sale', -12, '2026-09-02T10:00:00'),
        ],
        soldLines: [sold('a', 12, '2026-09-02T10:00:00')],
      });
      const turnover = result.turnover.find((t) => t.productId === 'a');
      expect(turnover?.eligible).toBe(false);
      expect(turnover?.turnoverRatio).toBeNull();
      expect(turnover?.reason).toMatch(/reconcile/i);
    });

    it('excludes a product whose average stock is zero', () => {
      const result = build({
        products: [product({ id: 'a', onHandQuantity: 0 })],
        movements: [movement('a', 'opening_balance', 0, '2026-08-01T00:00:00')],
        soldLines: [],
      });
      const turnover = result.turnover.find((t) => t.productId === 'a');
      expect(turnover?.eligible).toBe(false);
      expect(turnover?.turnoverRatio).toBeNull();
    });
  });

  describe('category detail', () => {
    it('totals sales by the category recorded on the sale line', () => {
      const result = build({
        products: [
          product({ id: 'a', category: 'Drinks' }),
          product({ id: 'b', category: 'Food' }),
        ],
        soldLines: [
          {
            ...sold('a', 2, '2026-09-02T10:00:00'),
            amountMinor: 1_000n,
            category: 'Drinks',
          },
          {
            ...sold('b', 1, '2026-09-02T10:00:00'),
            amountMinor: 2_500n,
            category: 'Food',
          },
        ],
      });
      expect(result.byCategory).toEqual([
        {
          category: 'Food',
          unitsSold: 1,
          amountMinor: '2500',
          productCount: 1,
          categorySource: 'recorded',
        },
        {
          category: 'Drinks',
          unitsSold: 2,
          amountMinor: '1000',
          productCount: 1,
          categorySource: 'recorded',
        },
      ]);
    });

    it('labels a category that had to fall back to the product’s current one', () => {
      const result = build({
        products: [product({ id: 'a', category: 'Drinks' })],
        soldLines: [
          {
            ...sold('a', 1, '2026-09-02T10:00:00'),
            amountMinor: 500n,
            category: null,
          },
        ],
      });
      expect(result.byCategory[0].categorySource).toBe('current_product');
      expect(result.notes.some((n) => /current category/i.test(n))).toBe(true);
    });
  });

  it('never presents the valuation as profit or margin', () => {
    const result = build({ products: [product({ id: 'a' })] });
    const serialised = JSON.stringify(result).toLowerCase();
    expect(serialised).not.toContain('"profit"');
    expect(serialised).not.toContain('"margin"');
  });
});

function movement(
  productId: string,
  kind: string,
  onHandChange: number,
  isoLocal: string,
): StockMovement {
  return {
    productId,
    kind,
    onHandChange,
    occurredAt: new Date(`${isoLocal}+02:00`),
  };
}

function sold(productId: string, quantity: number, isoLocal: string): SoldLine {
  return {
    productId,
    quantity,
    amountMinor: BigInt(quantity) * 500n,
    category: null,
    occurredAt: new Date(`${isoLocal}+02:00`),
  };
}
