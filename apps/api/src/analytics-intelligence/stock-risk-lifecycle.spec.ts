import { calculateMerchantIntelligence } from './merchant-insights.engine';

const now = new Date('2026-09-18T12:00:00.000Z');

function activity(daysAgo: number, amountMinor = 500n) {
  return {
    amountMinor,
    occurredAt: new Date(now.getTime() - daysAgo * 86_400_000),
    source: 'mcbuse_payment' as const,
    environment: 'live' as const,
  };
}

function line(daysAgo: number, quantity = 1) {
  return {
    productId: 'p1',
    productName: 'Coffee',
    quantity,
    totalMinor: BigInt(quantity * 500),
    occurredAt: new Date(now.getTime() - daysAgo * 86_400_000),
    source: 'mcbuse_payment' as const,
    stockAccountedFor: false,
  };
}

/** Forty days of steady demand: enough history for the forecast to be eligible. */
function steadyHistory() {
  const activities = Array.from({ length: 40 }, (_, index) =>
    activity(index + 1),
  );
  const productLines = Array.from({ length: 40 }, (_, index) => line(index + 1));
  return {
    activities,
    productLines,
    stockMovements: productLines.map((item) => ({
      productId: item.productId,
      kind: 'digital_sale',
      onHandChange: -1,
      occurredAt: item.occurredAt,
    })),
  };
}

function calculate(product: {
  availableQuantity: number;
  lowStockThreshold: number;
}) {
  return calculateMerchantIntelligence({
    now,
    timezone: 'UTC',
    ...steadyHistory(),
    products: [
      {
        id: 'p1',
        name: 'Coffee',
        category: 'Drinks',
        ...product,
      },
    ],
  });
}

const stockRisk = (result: ReturnType<typeof calculate>) =>
  result.insights.find((insight) => insight.kind === 'stock_risk');

/**
 * X.17 — a stock risk appears when the recorded demand says it should, and
 * stops appearing once the stock has been replenished.
 *
 * Both halves matter. An insight engine that raises a warning and never clears
 * it teaches merchants to ignore warnings.
 */
describe('X.17 — stock risk creation and resolution', () => {
  it('raises a risk when the projection reaches the minimum within a week', () => {
    const insight = stockRisk(
      calculate({ availableQuantity: 8, lowStockThreshold: 5 }),
    );

    expect(insight).toBeDefined();
    expect(insight!.code).toBe('stock_risk.p1');
    expect(insight!.title).toContain('minimum stock level');
  });

  it('says when the minimum is projected to be reached', () => {
    const insight = stockRisk(
      calculate({ availableQuantity: 8, lowStockThreshold: 5 }),
    )!;
    expect(
      insight.evidence.find((fact) => fact.id === 'forecast.minimum_day'),
    ).toBeDefined();
    expect(insight.summary).toContain('minimum threshold');
  });

  it('recommends a quantity rather than only raising an alarm', () => {
    const insight = stockRisk(
      calculate({ availableQuantity: 8, lowStockThreshold: 5 }),
    )!;
    expect(insight.recommendation).toMatch(/at least \d+ additional units/);
  });

  it('clears once the product has been replenished', () => {
    // Same demand, plenty of stock: the projection no longer reaches the
    // minimum inside the window, so there is nothing to warn about.
    expect(
      stockRisk(calculate({ availableQuantity: 500, lowStockThreshold: 5 })),
    ).toBeUndefined();
  });

  it('comes back if the stock is drawn down again', () => {
    expect(
      stockRisk(calculate({ availableQuantity: 500, lowStockThreshold: 5 })),
    ).toBeUndefined();
    expect(
      stockRisk(calculate({ availableQuantity: 8, lowStockThreshold: 5 })),
    ).toBeDefined();
  });

  it('raises the risk earlier for a product with a higher reorder level', () => {
    const low = stockRisk(
      calculate({ availableQuantity: 30, lowStockThreshold: 2 }),
    );
    const high = stockRisk(
      calculate({ availableQuantity: 30, lowStockThreshold: 28 }),
    );

    expect(low).toBeUndefined();
    expect(high).toBeDefined();
  });

  it('does not project at all without enough recorded history', () => {
    const result = calculateMerchantIntelligence({
      now,
      timezone: 'UTC',
      activities: [activity(2)],
      productLines: [line(2)],
      products: [
        {
          id: 'p1',
          name: 'Coffee',
          category: 'Drinks',
          availableQuantity: 1,
          lowStockThreshold: 5,
        },
      ],
      stockMovements: [],
    });

    // Dangerously low stock, but no basis for a projection: the engine says
    // nothing rather than guessing.
    expect(result.metrics.forecastEligible).toBe(false);
    expect(stockRisk(result)).toBeUndefined();
  });

  it('names the limits of the projection every time it raises one', () => {
    const insight = stockRisk(
      calculate({ availableQuantity: 8, lowStockThreshold: 5 }),
    )!;
    expect(insight.limitations.join(' ')).toContain('supplier lead times');
  });

  it('is deterministic for the same recorded history', () => {
    const first = calculate({ availableQuantity: 8, lowStockThreshold: 5 });
    const second = calculate({ availableQuantity: 8, lowStockThreshold: 5 });
    expect(JSON.stringify(second.insights)).toBe(
      JSON.stringify(first.insights),
    );
  });
});
