import { calculateMerchantIntelligence } from './merchant-insights.engine';

const now = new Date('2026-09-18T12:00:00.000Z');
const product = { id: 'p1', name: 'Coffee', category: 'Drinks', availableQuantity: 8, lowStockThreshold: 5 };

function activity(daysAgo: number, amountMinor = 500n, source: 'mcbuse_payment' | 'merchant_cash' = 'mcbuse_payment') {
  return { amountMinor, occurredAt: new Date(now.getTime() - daysAgo * 86_400_000), source, environment: source === 'merchant_cash' ? 'unknown' as const : 'live' as const };
}

function line(daysAgo: number, quantity = 1, stockAccountedFor = false) {
  return { productId: 'p1', productName: 'Coffee', quantity, totalMinor: BigInt(quantity * 500), occurredAt: new Date(now.getTime() - daysAgo * 86_400_000), source: 'mcbuse_payment' as const, stockAccountedFor };
}

describe('merchant intelligence rules', () => {
  it('returns no forecast when 28 complete days are unavailable', () => {
    const result = calculateMerchantIntelligence({ now, timezone: 'UTC', activities: [activity(17)], productLines: [line(17)], products: [product], stockMovements: [{ productId: 'p1', kind: 'digital_sale', onHandChange: -1, occurredAt: new Date(Date.UTC(2026, 7, 17, 10)) }] });
    expect(result.metrics.forecastEligible).toBe(false);
    expect(result.insights.some((item) => item.kind === 'stock_risk')).toBe(false);
  });

  it('explains weekly changes as observed contributions and labels mixed data', () => {
    const activities = [activity(8, 200n, 'merchant_cash'), activity(9, 200n), activity(1, 1000n), activity(2, 1000n)];
    const productLines = [line(8), line(9), line(1, 2), line(2, 2)];
    const result = calculateMerchantIntelligence({ now, timezone: 'UTC', activities, productLines, products: [product], stockMovements: productLines.map((item) => ({ productId: item.productId, kind: 'digital_sale', onHandChange: -item.quantity, occurredAt: item.occurredAt })) });
    const insight = result.insights.find((item) => item.code === 'performance.weekly_change');
    expect(insight?.summary).toContain('largest observed product contribution');
    expect(insight?.summary).toContain('largest observed category contribution');
    expect(insight?.summary).toContain('largest observed weekday contribution');
    expect(insight?.summary).toContain('largest observed hourly contribution');
    expect(insight?.evidence.some((fact) => fact.id === 'transactions.change')).toBe(true);
    expect(insight?.evidence.some((fact) => fact.id === 'average.change')).toBe(true);
    expect(insight?.evidence.some((fact) => fact.id.startsWith('product:'))).toBe(true);
    expect(insight?.evidence.some((fact) => fact.id.startsWith('category:'))).toBe(true);
    expect(insight?.evidence.some((fact) => fact.id.startsWith('weekday:'))).toBe(true);
    expect(insight?.evidence.some((fact) => fact.id.startsWith('hour:'))).toBe(true);
    expect(insight?.limitations.join(' ')).toContain('do not establish why');
    expect(result.mixedData).toBe(true);
  });

  it('projects stock risk only after sufficient history and linked demand', () => {
    const activities = Array.from({ length: 40 }, (_, index) => activity(index + 1, 500n));
    const productLines = Array.from({ length: 40 }, (_, index) => line(index + 1));
    const stockMovements = productLines.map((item) => ({ productId: item.productId, kind: 'digital_sale', onHandChange: -1, occurredAt: item.occurredAt }));
    const result = calculateMerchantIntelligence({ now, timezone: 'UTC', activities, productLines, products: [product], stockMovements });
    const insight = result.insights.find((item) => item.kind === 'stock_risk');
    expect(result.metrics.forecastEligible).toBe(true);
    expect(insight?.recommendation).toContain('additional units');
  });

  it('flags a stock discrepancy without treating it as wrongdoing', () => {
    const result = calculateMerchantIntelligence({ now, timezone: 'UTC', activities: [activity(17)], productLines: [line(17, 2)], products: [product], stockMovements: [] });
    const insight = result.insights.find((item) => item.kind === 'discrepancy');
    expect(insight?.summary).toContain('stock change');
    expect(insight?.recommendation).toContain('Review');
  });
});
