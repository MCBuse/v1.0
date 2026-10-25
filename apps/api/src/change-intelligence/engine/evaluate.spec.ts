import { addDays, daysBetween, localDayStart } from './local-time';
import { VALIDATORS, instanceKey } from './registry';
import {
  parseSettings,
  settingsChanged,
  settingsFingerprint,
  DEFAULT_CHANGE_INTELLIGENCE_SETTINGS,
} from './settings';
import {
  asOfAfter,
  createStore,
  productFixture,
  run,
  saleLines,
  type EngineStore,
} from './fixtures';
import type {
  AffectedSet,
  CaseOperation,
  EvaluationResult,
  NodeKey,
  NodeValues,
  ProductField,
  ProductObservation,
  SaleLineObservation,
} from './types';

const TZ = 'Europe/Berlin';
const D1 = '2026-10-10';
const D0 = addDays(D1, -1);
const D2 = addDays(D1, 1);
const FIRST = addDays(D1, -40);
const LAST = addDays(D1, 30);
const A = 'prod-a';
const B = 'prod-b';

const at = (day: string, hour = 1) => asOfAfter(day, TZ, hour);
const startOf = (day: string) => localDayStart(day, TZ);

function series(
  first: string,
  last: string,
  f: (offsetFromD1: number) => number,
): number[] {
  return Array.from({ length: daysBetween(first, last) + 1 }, (_, index) =>
    f(daysBetween(D1, addDays(first, index))),
  );
}
const lines = (
  productId: string,
  f: (offset: number) => number,
  first = FIRST,
  salesPerDay?: number[],
) =>
  saleLines({
    productId,
    lastDay: LAST,
    dailyUnits: series(first, LAST, f),
    timezone: TZ,
    salesPerDay,
  });

const flat = () => 4;
/** §5.10: weeks 27, 28, 28, 29 before D1 and 6 units a day from D1 − 6. */
const shifted = (k: number) =>
  k >= -6 ? 6 : k === -10 ? 3 : k === -30 ? 5 : 4;

const products = (
  overrides: Partial<Record<string, Partial<ProductObservation>>> = {},
): ProductObservation[] => [
  productFixture({
    id: A,
    name: 'Cappuccino',
    historyStart: startOf(FIRST),
    ...overrides[A],
  }),
  productFixture({
    id: B,
    name: 'Butter croissant',
    historyStart: startOf(FIRST),
    ...overrides[B],
  }),
];

function value<K extends NodeKey>(
  store: EngineStore,
  key: K,
  productId: string | null,
): NodeValues[K] {
  const state = store.states[instanceKey(key, productId)]?.value;
  if (!VALIDATORS[key](state))
    throw new Error(`no state for ${key}:${productId}`);
  return state;
}
const opsOf = (result: EvaluationResult, type?: CaseOperation['type']) =>
  result.caseOperations.filter((op) => !type || op.type === type);
const demandOps = (result: EvaluationResult) =>
  result.caseOperations.filter(
    (op) =>
      op.type.startsWith('unit_demand') ||
      op.type.startsWith('transaction_velocity'),
  );
const fields = (
  productFields: Record<string, ProductField[]>,
): AffectedSet => ({
  products: productFields,
  merchant: [],
});
const DEMAND_NODES: NodeKey[] = [
  'product_unit_activity',
  'product_transaction_activity',
  'unit_demand_change',
  'transaction_change',
  'baseline_daily_demand',
  'adjusted_daily_demand',
];
const invokedNodes = (result: EvaluationResult) =>
  result.invoked.map((key) => key.split(':')[0]);

/** Initialization at D0, daily runs at D1 and D2 on the §5.10 series. */
function confirmedIncrease(
  settings = { ...DEFAULT_CHANGE_INTELLIGENCE_SETTINGS },
) {
  const store = createStore({ timezone: TZ, settings });
  const sales = [...lines(A, shifted), ...lines(B, flat)];
  const init = run(store, {
    asOf: at(D0),
    reason: 'initialization',
    sales,
    products: products(),
  });
  const r1 = run(store, {
    asOf: at(D1),
    reason: 'clock',
    sales,
    products: products(),
  });
  const r2 = run(store, {
    asOf: at(D2),
    reason: 'clock',
    sales,
    products: products(),
  });
  return { store, sales, init, r1, r2 };
}

describe('change intelligence engine (§9.1)', () => {
  it('9.1.1 stable baseline → no case', () => {
    const store = createStore({ timezone: TZ });
    const sales = [...lines(A, flat), ...lines(B, flat)];
    const results = [0, 1, 2, 3, 4, 5].map((n) =>
      run(store, {
        asOf: at(addDays(D1, n)),
        reason: n ? 'clock' : 'initialization',
        sales,
        products: products(),
      }),
    );
    expect(results.flatMap((result) => result.caseOperations)).toEqual([]);
    expect(value(store, 'unit_demand_change', A).assessment.readiness).toBe(
      'ready',
    );
    expect(value(store, 'stock_cover', A)).toEqual({
      daysToMinimum: 8.75,
      daysToZero: 10,
      reason: null,
    });
    expect(value(store, 'replenishment_guidance', A).suggestedUnits).toBe(0);
    expect(value(store, 'stock_risk', A).level).toBe('normal');
  });

  it('9.1.2 sustained +50% unit increase (§5.10 numbers) → qualifies day 1, confirmed day 2', () => {
    const { init, r1, r2, store } = confirmedIncrease();
    expect(demandOps(init)).toEqual([]);
    expect(demandOps(r1)).toEqual([]);
    const day1 = r1.states.find(
      (state) => state.instanceKey === instanceKey('unit_demand_change', A),
    );
    if (!day1 || !VALIDATORS.unit_demand_change(day1.value))
      throw new Error('missing day-1 state');
    expect(day1.value.assessment.usedWeeks).toEqual([27, 28, 28, 29]);
    expect(day1.value.assessment.materiality).toMatchObject({
      expected: 28,
      difference: 14,
      z: 14 / Math.sqrt(28),
      spikeAdjustedRecent: 40,
      qualifies: true,
    });
    expect(day1.value.lifecycle).toMatchObject({
      streak: 1,
      streakDirection: 'increase',
      active: null,
    });

    const [open] = opsOf(r2, 'unit_demand_increase');
    expect(open).toMatchObject({
      op: 'open',
      productId: A,
      identifiedDuringInitialAnalysis: false,
    });
    expect(open.facts).toMatchObject({
      recent: 42,
      usual: 28.5,
      weeksUsed: 4,
      direction: 'increase',
    });
    expect(open.facts.daysToMinimumAfter).toBe(35 / 6);
    expect(open.explanation.headline).toBe('Cappuccino is selling faster');
    expect(open.explanation.summary).toBe(
      '42 units were recorded in the last 7 days, against a usual 28.5.',
    );
    expect(open.explanation.consequence).toBe(
      'Stock is now expected to reach its minimum in about 6 days instead of 8.',
    );
    expect(open.explanation.suggestedAction).toBe(
      'Review replenishment for the coming week.',
    );
    expect(JSON.stringify(open.explanation)).not.toMatch(
      /\bz\b|z-score|unit_demand|prod-a/i,
    );

    expect(value(store, 'adjusted_daily_demand', A)).toMatchObject({
      perDay: 6,
      basis: 'recent_7_days',
    });
    expect(value(store, 'stock_cover', A).daysToMinimum).toBe(35 / 6);
    expect(value(store, 'stock_cover', A).daysToZero).toBe(40 / 6);
    expect(value(store, 'replenishment_guidance', A).suggestedUnits).toBe(7);
    expect(value(store, 'stock_risk', A).level).toBe('projected_stock_risk');
    expect(opsOf(r2, 'stock_risk')).toMatchObject([
      { op: 'open', productId: A, severity: 'low' },
    ]);
    expect(demandOps(r2)).toHaveLength(1); // transactions stayed at one sale a day
  });

  it('9.1.3 small fluctuations (|z| < 2.5) → no case', () => {
    const store = createStore({ timezone: TZ });
    const wobble = [3, 5, 4, 4, 6, 2, 4];
    const pattern = (k: number) =>
      k >= -6 ? [5, 5, 4, 5, 4, 5, 4][(k + 700) % 7] : wobble[(k + 700) % 7];
    const sales = [...lines(A, pattern), ...lines(B, flat)];
    const results = [0, 1, 2, 3].map((n) =>
      run(store, {
        asOf: at(addDays(D0, n)),
        reason: n ? 'clock' : 'initialization',
        sales,
        products: products(),
      }),
    );
    expect(results.flatMap(demandOps)).toEqual([]);
    expect(
      Math.abs(
        value(store, 'unit_demand_change', A).assessment.materiality?.z ?? 99,
      ),
    ).toBeLessThan(2.5);
  });

  it('9.1.5 E < 5 → insufficient_history', () => {
    const store = createStore({ timezone: TZ });
    const sales = [
      ...lines(A, (k) => (k % 3 === 0 ? 1 : 0)),
      ...lines(B, flat),
    ];
    run(store, {
      asOf: at(D1),
      reason: 'initialization',
      sales,
      products: products(),
    });
    const change = value(store, 'unit_demand_change', A);
    expect(change.assessment.readiness).toBe('insufficient_history');
    expect(change.assessment.materiality?.expected).toBeLessThan(5);
    expect(value(store, 'baseline_daily_demand', A).forecastReason).toBe(
      'insufficient_units',
    );
  });

  it('9.1.6 transactions rise while units stay flat → transaction case only, forecast unchanged', () => {
    const store = createStore({ timezone: TZ });
    const salesPerDay = series(FIRST, LAST, (k) => (k >= -6 ? 4 : 2));
    const sales = [...lines(A, flat, FIRST, salesPerDay), ...lines(B, flat)];
    run(store, {
      asOf: at(D0),
      reason: 'initialization',
      sales,
      products: products(),
    });
    const coverBefore = store.states[instanceKey('stock_cover', A)];
    const adjustedBefore =
      store.states[instanceKey('adjusted_daily_demand', A)];
    const r1 = run(store, {
      asOf: at(D1),
      reason: 'clock',
      sales,
      products: products(),
    });
    expect(demandOps(r1).map((op) => [op.op, op.type])).toEqual([
      ['open', 'transaction_velocity_increase'],
    ]);
    expect(demandOps(r1)[0].explanation.headline).toBe(
      'Cappuccino is being bought more often',
    );
    expect(store.states[instanceKey('adjusted_daily_demand', A)]).toEqual(
      adjustedBefore,
    );
    expect(store.states[instanceKey('stock_cover', A)]).toEqual(coverBefore);
    expect(r1.states.map((state) => state.instanceKey)).not.toContain(
      instanceKey('stock_cover', A),
    );
  });

  it('9.1.7 stock-only propagation → demand calculators not invoked', () => {
    const { store, sales } = confirmedIncrease();
    const result = run(store, {
      asOf: at(D2, 9),
      reason: 'source_change',
      sales,
      products: products({ [A]: { onHand: 30 } }),
      affected: fields({ [A]: ['on_hand'] }),
    });
    expect(result.dailyEvaluationDate).toBeNull();
    expect(
      invokedNodes(result).filter((key) =>
        DEMAND_NODES.includes(key as NodeKey),
      ),
    ).toEqual([]);
    expect(result.invoked).toEqual(
      expect.arrayContaining([
        instanceKey('available_stock', A),
        instanceKey('stock_cover', A),
        instanceKey('stock_risk', A),
      ]),
    );
    expect(value(store, 'available_stock', A).available).toBe(30);
    expect(value(store, 'stock_cover', A).daysToMinimum).toBe(25 / 6);
  });

  it('9.1.8 threshold-only propagation, and a threshold case that expires', () => {
    const store = createStore({ timezone: TZ });
    const sales = [...lines(A, flat), ...lines(B, flat)];
    run(store, {
      asOf: at(D1),
      reason: 'initialization',
      sales,
      products: products(),
    });
    const result = run(store, {
      asOf: at(D1, 10),
      reason: 'source_change',
      sales,
      products: products({ [A]: { threshold: 10 } }),
      affected: fields({ [A]: ['threshold'] }),
    });
    expect(
      invokedNodes(result).filter((key) =>
        DEMAND_NODES.includes(key as NodeKey),
      ),
    ).toEqual([]);
    expect(result.invoked).toEqual([
      instanceKey('minimum_stock_policy', A),
      instanceKey('stock_cover', A),
      instanceKey('projected_stock_dates', A),
      instanceKey('replenishment_guidance', A),
      instanceKey('stock_risk', A),
      'merchant_change_summary',
    ]);
    const [open] = opsOf(result, 'stock_threshold_change');
    expect(open).toMatchObject({
      op: 'open',
      facts: { previousMinimum: 5, minimum: 10 },
    });
    expect(open.explanation.summary).toBe(
      'Minimum stock changed from 5 to 10 units.',
    );
    expect(value(store, 'stock_cover', A).daysToMinimum).toBe(30 / 4);

    const daily = [1, 2, 3, 4, 5, 6, 7].map((n) =>
      run(store, {
        asOf: at(addDays(D1, n)),
        reason: 'clock',
        sales,
        products: products({ [A]: { threshold: 10 } }),
      }),
    );
    expect(
      daily.slice(0, 6).flatMap((r) => opsOf(r, 'stock_threshold_change')),
    ).toEqual([]);
    expect(opsOf(daily[6], 'stock_threshold_change')).toMatchObject([
      { op: 'resolve', resolution: 'no_longer_detected' },
    ]);
  });

  it('9.1.9 restock resolves stock risk; the demand case stays open', () => {
    const { store, sales } = confirmedIncrease();
    const result = run(store, {
      asOf: at(D2, 9),
      reason: 'source_change',
      sales,
      products: products({ [A]: { onHand: 100 } }),
      affected: fields({ [A]: ['on_hand'] }),
    });
    expect(result.caseOperations.map((op) => [op.op, op.type])).toEqual([
      ['resolve', 'stock_risk'],
    ]);
    expect(opsOf(result, 'stock_risk')[0]).toMatchObject({
      resolution: 'stock_normal',
    });
    expect(store.activeCases.map((item) => item.type)).toEqual([
      'unit_demand_increase',
    ]);
  });

  it('9.1.10 an unchanged intermediate node stops propagation', () => {
    const { store, sales } = confirmedIncrease();
    // Available stock is unchanged (on hand +1, reserved +1).
    const stock = run(store, {
      asOf: at(D2, 9),
      reason: 'source_change',
      sales,
      products: products({ [A]: { onHand: 41, reserved: 1 } }),
      affected: fields({ [A]: ['on_hand', 'reserved'] }),
    });
    // On hand and reserved are part of the value, but stock cover is unchanged, so projected dates never run.
    expect(stock.invoked).toEqual([
      instanceKey('available_stock', A),
      instanceKey('stock_cover', A),
      instanceKey('replenishment_guidance', A),
      instanceKey('stock_risk', A),
    ]);
    expect(stock.states.map((state) => state.instanceKey)).toEqual([
      instanceKey('available_stock', A),
    ]);
    expect(stock.counts).toMatchObject({ evaluated: 4, changed: 1 });
    expect(stock.counts.skipped).toBeGreaterThan(0);
    expect(stock.caseOperations).toEqual([]);

    // A sale today does not change any completed-day window.
    const today = addDays(D2, 1);
    const late: SaleLineObservation = {
      ...lines(A, flat)[0],
      saleId: 'today',
      sourceLineId: 'today-1',
      occurredAt: new Date(startOf(today).getTime() + 9 * 3_600_000),
    };
    const sale = run(store, {
      asOf: at(D2, 10),
      reason: 'source_change',
      sales: [...sales, late],
      products: products({ [A]: { onHand: 41, reserved: 1 } }),
      affected: fields({ [A]: ['sales'] }),
    });
    expect(sale.invoked).toEqual([
      'merchant_recording_activity',
      instanceKey('product_transaction_activity', A),
      instanceKey('product_unit_activity', A),
    ]);
    expect(sale.caseOperations).toEqual([]);
  });

  it('9.1.11 a change to product A leaves product B unchanged at a fixed clock', () => {
    const { store, sales } = confirmedIncrease();
    const before = Object.fromEntries(
      Object.entries(store.states).filter(([key]) => key.endsWith(B)),
    );
    const result = run(store, {
      asOf: at(D2, 9),
      reason: 'source_change',
      sales,
      products: products({ [A]: { onHand: 12 } }),
      affected: fields({ [A]: ['on_hand'] }),
    });
    expect(result.invoked.some((key) => key.endsWith(B))).toBe(false);
    expect(
      Object.fromEntries(
        Object.entries(store.states).filter(([key]) => key.endsWith(B)),
      ),
    ).toEqual(before);
  });

  it('9.1.12 the merchant summary updates', () => {
    const { r2, store, sales } = confirmedIncrease();
    expect(
      r2.states.find((state) => state.nodeKey === 'merchant_change_summary')
        ?.value,
    ).toEqual({
      activeChanges: 2,
      productsNeedingStockReview: 1,
      byType: { unit_demand_increase: 1, stock_risk: 1 },
    });
    run(store, {
      asOf: at(D2, 9),
      reason: 'source_change',
      sales,
      products: products({ [A]: { onHand: 100 } }),
      affected: fields({ [A]: ['on_hand'] }),
    });
    expect(value(store, 'merchant_change_summary', null)).toEqual({
      activeChanges: 1,
      productsNeedingStockReview: 0,
      byType: { unit_demand_increase: 1 },
    });
  });

  it('9.1.13 re-running the same local day does not advance confirmation', () => {
    const store = createStore({ timezone: TZ });
    const sales = [...lines(A, shifted), ...lines(B, flat)];
    run(store, {
      asOf: at(D0),
      reason: 'initialization',
      sales,
      products: products(),
    });
    run(store, { asOf: at(D1), reason: 'clock', sales, products: products() });
    // A retried daily run for D1 (its completion was not recorded).
    const retry = run(store, {
      asOf: at(D1, 5),
      reason: 'clock',
      sales,
      products: products(),
      lastDailyEvaluationDate: D0,
    });
    expect(retry.dailyEvaluationDate).toBe(D1);
    expect(demandOps(retry)).toEqual([]);
    expect(value(store, 'unit_demand_change', A).lifecycle).toMatchObject({
      streak: 1,
      active: null,
      lastEvaluatedDate: D1,
    });
    const next = run(store, {
      asOf: at(D2),
      reason: 'clock',
      sales,
      products: products(),
    });
    expect(opsOf(next, 'unit_demand_increase')).toMatchObject([{ op: 'open' }]);
  });

  it('9.1.16 void and reassignment affect the correct products, producing historical_correction', () => {
    const base = [...lines(A, flat), ...lines(B, flat)];
    const target = `${A}-${addDays(D1, -2)}-0`;

    const voidStore = createStore({ timezone: TZ });
    run(voidStore, {
      asOf: at(D1),
      reason: 'initialization',
      sales: base,
      products: products(),
    });
    const voided = base.map((line) =>
      line.saleId === target
        ? { ...line, eligible: false, exclusionReason: 'voided' as const }
        : line,
    );
    const v = run(voidStore, {
      asOf: at(D1, 9),
      reason: 'source_change',
      sales: voided,
      products: products(),
      affected: fields({ [A]: ['sales'] }),
    });
    expect(
      v.caseOperations.map((op) => [op.op, op.type, op.productId]),
    ).toEqual([['open', 'historical_correction', A]]);
    expect(v.caseOperations[0].facts.correction).toMatchObject({
      recentBefore: 28,
      recentAfter: 24,
    });
    expect(v.caseOperations[0].explanation.summary).toBe(
      'Units recorded in the last 7 days changed from 28 to 24.',
    );
    // Merchant-level totals changed, so B's demand checks re-run, but none of B's states change.
    expect(v.states.some((state) => state.productId === B)).toBe(false);
    expect(
      v.invoked
        .filter((key) => key.endsWith(B))
        .map((key) => key.split(':')[0]),
    ).toEqual([
      'transaction_change',
      'unit_demand_change',
      'baseline_daily_demand',
    ]);

    const moveStore = createStore({ timezone: TZ });
    run(moveStore, {
      asOf: at(D1),
      reason: 'initialization',
      sales: base,
      products: products(),
    });
    const moved = base.map((line) =>
      line.saleId === target ? { ...line, productId: B } : line,
    );
    const m = run(moveStore, {
      asOf: at(D1, 9),
      reason: 'source_change',
      sales: moved,
      products: products(),
      affected: fields({ [A]: ['sales'], [B]: ['sales'] }),
    });
    expect(
      m.caseOperations.map((op) => [
        op.op,
        op.type,
        op.productId,
        op.facts.correction?.recentAfter,
      ]),
    ).toEqual([
      ['open', 'historical_correction', A, 24],
      ['open', 'historical_correction', B, 32],
    ]);
  });

  it('9.1.17 clock-only daily rollover', () => {
    const store = createStore({ timezone: TZ });
    const sales = [...lines(A, flat), ...lines(B, flat)];
    run(store, {
      asOf: at(D1),
      reason: 'initialization',
      sales,
      products: products(),
    });
    const rollover = run(store, {
      asOf: at(D2),
      reason: 'clock',
      sales,
      products: products(),
    });
    expect(rollover.dailyEvaluationDate).toBe(D2);
    expect(rollover.invoked).toEqual(
      expect.arrayContaining([
        instanceKey('product_unit_activity', A),
        instanceKey('product_unit_activity', B),
        'merchant_recording_activity',
      ]),
    );
    expect(invokedNodes(rollover)).not.toContain('available_stock');
    expect(invokedNodes(rollover)).not.toContain('minimum_stock_policy');
    // Flat demand: the moving window changes activity, but stock cover is unchanged.
    expect(rollover.states.map((state) => state.nodeKey)).not.toContain(
      'stock_cover',
    );
    const sameDay = run(store, {
      asOf: at(D2, 7),
      reason: 'clock',
      sales,
      products: products(),
    });
    expect(sameDay.invoked).toEqual([]);
    expect(sameDay.dailyEvaluationDate).toBeNull();
  });

  it('9.1.18 recording gap: no decrease cases, forecasts suppressed, low-stock cases remain', () => {
    const store = createStore({ timezone: TZ });
    const stop = (k: number) => (k <= -10 ? 4 : 0);
    const sales = [...lines(A, stop), ...lines(B, stop)];
    const p = products({ [A]: { onHand: 3 } });
    const init = run(store, {
      asOf: at(D1),
      reason: 'initialization',
      sales,
      products: p,
    });
    expect(value(store, 'merchant_recording_activity', null)).toMatchObject({
      recordingGap: true,
      lastSaleDate: addDays(D1, -10),
    });
    expect(value(store, 'unit_demand_change', A).assessment.readiness).toBe(
      'recording_gap',
    );
    expect(value(store, 'stock_cover', B)).toEqual({
      daysToMinimum: null,
      daysToZero: null,
      reason: 'no_recent_activity',
    });
    expect(value(store, 'stock_risk', B).level).toBe('forecast_unavailable');
    expect(value(store, 'stock_risk', A).level).toBe('low_stock');
    expect(
      init.caseOperations.map((op) => [op.op, op.type, op.productId]),
    ).toEqual([['open', 'stock_risk', A]]);
    const later = [1, 2, 3].map((n) =>
      run(store, {
        asOf: at(addDays(D1, n)),
        reason: 'clock',
        sales,
        products: p,
      }),
    );
    expect(later.flatMap(demandOps)).toEqual([]);
    expect(store.activeCases.map((item) => item.type)).toEqual(['stock_risk']);
  });

  it('9.1.19 past recording gap in a baseline week → building_baseline, no false increase', () => {
    const settings = parseSettings('{"confirmationDays":1}');
    const store = createStore({ timezone: TZ, settings });
    const gapWeek = [2, 2, 2, 2, 2, 1, 1];
    const recent = [7, 7, 7, 7, 6, 6, 6];
    const first = addDays(D1, -34);
    const a = (k: number) =>
      k <= -28 ? gapWeek[k + 34] : k >= -6 ? recent[k + 6] : 4;
    const b = (k: number) => (k <= -28 ? gapWeek[k + 34] : 4);
    const sales = [...lines(A, a, first), ...lines(B, b, first)];
    const p = products({
      [A]: { historyStart: startOf(first) },
      [B]: { historyStart: startOf(first) },
    });
    run(store, { asOf: at(D0), reason: 'initialization', sales, products: p });
    const result = run(store, {
      asOf: at(D1),
      reason: 'clock',
      sales,
      products: p,
    });
    const change = value(store, 'unit_demand_change', A);
    expect(change.assessment.usedWeeks).toEqual([28, 28, 28, 12]);
    expect(change.assessment.materiality?.qualifies).toBe(true); // would be a false increase without the rule
    expect(change.assessment.readiness).toBe('building_baseline');
    expect(demandOps(result)).toEqual([]);
  });

  it('9.1.20 single-day spike (a catering order) → rejected by the spike guard', () => {
    const settings = parseSettings('{"confirmationDays":1}');
    const store = createStore({ timezone: TZ, settings });
    const spike = (k: number) => (k === 0 ? 30 : 4);
    const sales = [...lines(A, spike), ...lines(B, flat)];
    run(store, {
      asOf: at(D0),
      reason: 'initialization',
      sales,
      products: products(),
    });
    const result = run(store, {
      asOf: at(D1),
      reason: 'clock',
      sales,
      products: products(),
    });
    const m = value(store, 'unit_demand_change', A).assessment.materiality;
    expect(m).toMatchObject({
      expected: 28,
      difference: 26,
      spikeAdjustedRecent: 28,
      qualifies: false,
    });
    expect(Math.abs(m?.z ?? 0)).toBeGreaterThan(2.5);
    expect(demandOps(result)).toEqual([]);
  });

  it('9.1.26 baseline weeks: 27 days → building_baseline; 28–34 → 3 weeks; ≥ 35 → 4; the explanation reports the count', () => {
    const at26 = (historyDays: number, settingsJson?: string) => {
      const store = createStore({
        timezone: TZ,
        settings: parseSettings(settingsJson),
      });
      const first = addDays(D1, -(historyDays - 1));
      const result = run(store, {
        asOf: at(D1),
        reason: 'initialization',
        sales: lines(A, flat, first),
        products: [
          productFixture({
            id: A,
            name: 'Cappuccino',
            historyStart: startOf(first),
          }),
        ],
      });
      const transition = result.transitions.find(
        (t) => t.instanceKey === instanceKey('unit_demand_change', A),
      );
      return {
        assessment: value(store, 'unit_demand_change', A).assessment,
        facts: transition?.explanation ?? [],
      };
    };
    const d27 = at26(27);
    expect(d27.assessment).toMatchObject({
      readiness: 'building_baseline',
      weeksUsed: 2,
      daysNeeded: 1,
    });
    expect(d27.facts).toContainEqual(
      expect.objectContaining({ key: 'days_needed', value: 1 }),
    );
    for (const [days, weeks] of [
      [28, 3],
      [34, 3],
      [35, 4],
      [60, 4],
    ]) {
      const result = at26(days);
      expect(result.assessment).toMatchObject({
        readiness: 'ready',
        weeksUsed: weeks,
        daysNeeded: 0,
      });
      expect(result.facts).toContainEqual({
        key: 'baseline_weeks_used',
        label: 'Earlier weeks used for usual',
        value: weeks,
        unit: 'weeks',
      });
    }
    // §9.3: 33 days with baselineWeeksMin = 4 → "2 more days needed".
    expect(at26(33, '{"baselineWeeksMin":4}').assessment).toMatchObject({
      readiness: 'building_baseline',
      daysNeeded: 2,
    });
  });

  it('9.1.27 a settings change produces a different fingerprint and a settings_change run; old cases keep their settings', () => {
    const { store, sales } = confirmedIncrease();
    const original = settingsFingerprint(DEFAULT_CHANGE_INTELLIGENCE_SETTINGS);
    const opened = store.caseLog.find(
      (op) => op.type === 'unit_demand_increase',
    );
    expect(opened?.settingsFingerprint).toBe(original);

    const stricter = parseSettings('{"minZ":3}');
    expect(settingsChanged(original, stricter)).toBe(true);
    const result = run(store, {
      asOf: at(D2, 9),
      reason: 'settings_change',
      sales,
      products: products(),
      settings: stricter,
    });
    expect(result.reason).toBe('settings_change');
    expect(result.settingsFingerprint).toBe(settingsFingerprint(stricter));
    expect(result.settingsFingerprint).not.toBe(original);
    expect(result.settings.minZ).toBe(3);
    expect(
      store.caseLog.find((op) => op.type === 'unit_demand_increase')
        ?.settingsFingerprint,
    ).toBe(original);
    // Re-checked under the new rules: the assessment changed, history and case kept.
    expect(result.states.map((state) => state.instanceKey)).toContain(
      instanceKey('unit_demand_change', A),
    );
    expect(
      value(store, 'unit_demand_change', A).assessment.materiality?.qualifies,
    ).toBe(false);
    expect(store.activeCases.map((item) => item.type)).toContain(
      'unit_demand_increase',
    );
  });

  it('initialization never opens demand cases and labels existing stock risks', () => {
    const store = createStore({
      timezone: TZ,
      settings: parseSettings('{"confirmationDays":1}'),
    });
    const sales = [...lines(A, shifted), ...lines(B, flat)];
    const init = run(store, {
      asOf: at(D1),
      reason: 'initialization',
      sales,
      products: products({ [B]: { onHand: 3 } }),
    });
    expect(
      value(store, 'unit_demand_change', A).assessment.materiality?.qualifies,
    ).toBe(true);
    expect(demandOps(init)).toEqual([]);
    expect(opsOf(init, 'stock_risk')).toMatchObject([
      { op: 'open', productId: B, identifiedDuringInitialAnalysis: true },
    ]);
    const next = run(store, {
      asOf: at(D2),
      reason: 'clock',
      sales,
      products: products({ [B]: { onHand: 3 } }),
    });
    expect(opsOf(next, 'unit_demand_increase')).toMatchObject([
      { op: 'open', identifiedDuringInitialAnalysis: false },
    ]);
  });

  it('archiving resolves the product cases with product_archived', () => {
    const { store, sales } = confirmedIncrease();
    const result = run(store, {
      asOf: at(D2, 9),
      reason: 'source_change',
      sales,
      products: products({ [A]: { status: 'archived' } }),
      affected: fields({ [A]: ['status'] }),
    });
    expect(
      result.caseOperations.map((op) => [
        op.op,
        op.type,
        op.op === 'resolve' ? op.resolution : null,
      ]),
    ).toEqual([
      ['resolve', 'unit_demand_increase', 'product_archived'],
      ['resolve', 'stock_risk', 'product_archived'],
    ]);
    expect(store.activeCases).toEqual([]);
  });

  it('negative availability blocks forecasting with a data-quality reason but stays out of stock', () => {
    const store = createStore({ timezone: TZ });
    const sales = [...lines(A, flat), ...lines(B, flat)];
    const result = run(store, {
      asOf: at(D1),
      reason: 'initialization',
      sales,
      products: products({ [A]: { onHand: 2, reserved: 5 } }),
    });
    expect(value(store, 'stock_cover', A).reason).toBe('data_quality_blocked');
    expect(value(store, 'stock_risk', A).level).toBe('out_of_stock');
    expect(result.counts.blocked).toBeGreaterThan(0);
    expect(opsOf(result, 'stock_risk')[0].explanation.headline).toBe(
      'Cappuccino is out of stock',
    );
  });

  it('an invalid saved state is recalculated instead of trusted', () => {
    const store = createStore({ timezone: TZ });
    const sales = [...lines(A, flat), ...lines(B, flat)];
    run(store, {
      asOf: at(D1),
      reason: 'initialization',
      sales,
      products: products(),
    });
    const key = instanceKey('available_stock', A);
    store.states[key] = { ...store.states[key], value: { broken: true } };
    const result = run(store, {
      asOf: at(D1, 9),
      reason: 'source_change',
      sales,
      products: products(),
      affected: fields({}),
    });
    expect(result.invoked[0]).toBe(key);
    expect(result.states.map((state) => state.instanceKey)).toEqual([key]);
    expect(value(store, 'available_stock', A).available).toBe(40);
  });
});
