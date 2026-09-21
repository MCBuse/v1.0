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

/** A movement on a given local day, at midday so no timezone edge is involved. */
function movement(
  day: string,
  onHandChange: number,
  kind = 'manual_adjustment',
  productId = 'a',
): StockMovement {
  return {
    productId,
    kind,
    onHandChange,
    occurredAt: new Date(`2026-09-${day}T12:00:00+02:00`),
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

/**
 * V.7 — the intervals where a product was out of stock, reconstructed from the
 * recorded movements rather than only reporting what is out of stock today.
 */
describe('historical stock-outs', () => {
  it('finds a closed interval between running out and being restocked', () => {
    // Opens at 5 on the 1st, sells out on the 3rd, restocked on the 6th.
    const result = build({
      products: [product({ id: 'a', onHandQuantity: 4 })],
      movements: [
        movement('01', 5, 'opening_balance'),
        movement('03', -5),
        movement('06', 4, 'restock'),
      ],
    });

    const history = result.historicalStockOuts.find(
      (entry) => entry.productId === 'a',
    )!;
    expect(history.eligible).toBe(true);
    expect(history.intervals).toEqual([
      { from: '2026-09-03', to: '2026-09-05', days: 3, ongoing: false },
    ]);
    expect(history.totalDays).toBe(3);
  });

  it('marks an interval that is still open at the end of the period', () => {
    const result = build({
      products: [product({ id: 'a', onHandQuantity: 0 })],
      movements: [
        movement('01', 5, 'opening_balance'),
        movement('08', -5),
      ],
    });

    const history = result.historicalStockOuts.find(
      (entry) => entry.productId === 'a',
    )!;
    expect(history.intervals).toEqual([
      { from: '2026-09-08', to: '2026-09-10', days: 3, ongoing: true },
    ]);
  });

  it('reports several separate intervals in one period', () => {
    const result = build({
      products: [product({ id: 'a', onHandQuantity: 2 })],
      movements: [
        movement('01', 3, 'opening_balance'),
        movement('02', -3),
        movement('04', 3, 'restock'),
        movement('06', -3),
        movement('09', 2, 'restock'),
      ],
    });

    const history = result.historicalStockOuts.find(
      (entry) => entry.productId === 'a',
    )!;
    expect(history.intervals).toEqual([
      { from: '2026-09-02', to: '2026-09-03', days: 2, ongoing: false },
      { from: '2026-09-06', to: '2026-09-08', days: 3, ongoing: false },
    ]);
    expect(history.totalDays).toBe(5);
  });

  it('leaves out a product that was never out of stock', () => {
    const result = build({
      products: [product({ id: 'a', onHandQuantity: 10 })],
      movements: [movement('01', 10, 'opening_balance')],
    });

    expect(
      result.historicalStockOuts.find((entry) => entry.productId === 'a'),
    ).toBeUndefined();
  });

  it('reports a product whose history cannot be reconstructed as ineligible', () => {
    // No opening balance: the movements are an unknown fraction of the truth.
    const result = build({
      products: [product({ id: 'a', onHandQuantity: 0 })],
      movements: [movement('05', -3)],
    });

    const history = result.historicalStockOuts.find(
      (entry) => entry.productId === 'a',
    )!;
    expect(history.eligible).toBe(false);
    expect(history.intervals).toEqual([]);
    expect(history.reason).toMatch(/opening stock/i);
  });

  it('does not claim "never out of stock" for an unreconstructable product', () => {
    const result = build({
      products: [product({ id: 'a', onHandQuantity: 0 })],
      movements: [],
    });

    const history = result.historicalStockOuts.find(
      (entry) => entry.productId === 'a',
    )!;
    // Present in the list precisely so its absence cannot be read as "fine".
    expect(history).toBeDefined();
    expect(history.eligible).toBe(false);
  });

  it('refuses a history that contradicts the current stock level', () => {
    // Backdated movements reconstruct a negative level.
    const result = build({
      products: [product({ id: 'a', onHandQuantity: 1 })],
      movements: [
        movement('01', 2, 'opening_balance'),
        movement('02', -8),
        movement('09', 7, 'restock'),
      ],
    });

    const history = result.historicalStockOuts.find(
      (entry) => entry.productId === 'a',
    )!;
    expect(history.eligible).toBe(false);
    expect(history.reason).toMatch(/do not reconcile/i);
  });

  it('agrees with turnover about whether the history can be used', () => {
    const result = build({
      products: [product({ id: 'a', onHandQuantity: 0 })],
      movements: [movement('05', -3)],
    });

    const turnover = result.turnover.find((t) => t.productId === 'a')!;
    const history = result.historicalStockOuts.find(
      (entry) => entry.productId === 'a',
    )!;
    expect(turnover.eligible).toBe(history.eligible);
    expect(turnover.reason).toBe(history.reason);
  });

  it('orders the worst-affected products first', () => {
    const result = build({
      products: [
        product({ id: 'a', onHandQuantity: 0 }),
        product({ id: 'b', onHandQuantity: 0 }),
      ],
      movements: [
        movement('01', 5, 'opening_balance', 'a'),
        movement('09', -5, 'manual_adjustment', 'a'),
        movement('01', 5, 'opening_balance', 'b'),
        movement('03', -5, 'manual_adjustment', 'b'),
      ],
    });

    expect(result.historicalStockOuts.map((entry) => entry.productId)).toEqual([
      'b',
      'a',
    ]);
  });

  it('adds a note when any product could not be reconstructed', () => {
    const result = build({
      products: [product({ id: 'a', onHandQuantity: 0 })],
      movements: [],
    });

    expect(result.notes.join(' ')).toContain('Stock-out history');
  });

  it('keeps reporting current stock-outs alongside the history', () => {
    const result = build({
      products: [product({ id: 'a', onHandQuantity: 0 })],
      movements: [
        movement('01', 5, 'opening_balance'),
        movement('08', -5),
      ],
    });

    expect(result.currentStockOuts.map((r) => r.productId)).toEqual(['a']);
    expect(result.historicalStockOuts[0].intervals[0].ongoing).toBe(true);
  });
});
