/**
 * Evaluation evidence (plan §9.7, §9.3 backtest). Replays daily evaluations
 * with the real engine (`evaluateMerchant` through the fixtures store) over a
 * merchant's recorded history. Pure: the CLI loads the history read-only.
 *
 * Generated fixtures prove mechanical correctness; they do not establish
 * real-world predictive accuracy.
 */
import type { ChangeIntelligenceSettings } from '@repo/shared';
import { performance } from 'node:perf_hooks';
import {
  asOfAfter,
  createStore,
  run,
  type EngineStore,
} from '../engine/fixtures';
import { addDays, daysBetween, localDate } from '../engine/local-time';
import { instanceKey } from '../engine/registry';
import { DEFAULT_CHANGE_INTELLIGENCE_SETTINGS } from '../engine/settings';
import type {
  AffectedSet,
  BaselineDemandValue,
  CaseOperation,
  DemandChangeValue,
  NodeKey,
  ProductObservation,
  SaleLineObservation,
} from '../engine/types';

export type History = {
  merchantId: string;
  timezone: string;
  products: ProductObservation[];
  sales: SaleLineObservation[];
};

export type DayRecord = {
  day: string;
  units: Record<string, DemandChangeValue>;
  transactions: Record<string, DemandChangeValue>;
  baseline: Record<string, BaselineDemandValue>;
  ops: CaseOperation[];
  ms: number;
};

const settingsWith = (
  overrides: Partial<ChangeIntelligenceSettings>,
): ChangeIntelligenceSettings => ({
  ...DEFAULT_CHANGE_INTELLIGENCE_SETTINGS,
  ...overrides,
});

/** Active products only: archived ones are not assessed. */
const productIds = (history: History) =>
  history.products.filter((p) => p.status === 'active').map((p) => p.id);

function recordDay(
  history: History,
  store: EngineStore,
  day: string,
  ops: CaseOperation[],
  ms: number,
): DayRecord {
  const pick = <T>(node: string) =>
    Object.fromEntries(
      productIds(history)
        .map((id) => [
          id,
          store.states[`${node}:${id}`]?.value as T | undefined,
        ])
        .filter(([, value]) => value !== undefined),
    ) as Record<string, T>;
  return {
    day,
    units: pick<DemandChangeValue>('unit_demand_change'),
    transactions: pick<DemandChangeValue>('transaction_change'),
    baseline: pick<BaselineDemandValue>('baseline_daily_demand'),
    ops,
    ms,
  };
}

/** One daily evaluation (asOf 01:00 local the next day) for each day; the first is the initialization. */
export function replayDays(
  history: History,
  store: EngineStore,
  days: string[],
  sales: SaleLineObservation[] = history.sales,
  initializeFirst = false,
): DayRecord[] {
  return days.map((day, index) => {
    const started = performance.now();
    const result = run(store, {
      asOf: asOfAfter(day, history.timezone, 1),
      reason: initializeFirst && index === 0 ? 'initialization' : 'clock',
      sales,
      products: history.products,
    });
    return recordDay(
      history,
      store,
      day,
      result.caseOperations,
      performance.now() - started,
    );
  });
}

export const dayRange = (from: string, to: string) =>
  Array.from({ length: daysBetween(from, to) + 1 }, (_, i) => addDays(from, i));

// ------------------------------------------------------------ injection

/** Deterministic PRNG (mulberry32) seeded from text. */
export function seededRandom(seedText: string): () => number {
  let h = 2166136261;
  for (const c of seedText) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sustained shift for one product from `fromDay` (local) onward. Each
 * recorded unit independently becomes `multiplier` units in expectation:
 * kept with probability m (m < 1), or joined by ⌊m−1⌋ extra units plus one
 * more with probability frac(m−1) (m > 1). Lines that drop to zero vanish.
 */
export function injectShift(
  history: History,
  productId: string,
  multiplier: number,
  fromDay: string,
  random: () => number,
): SaleLineObservation[] {
  const out: SaleLineObservation[] = [];
  for (const line of history.sales) {
    if (
      line.productId !== productId ||
      !line.eligible ||
      localDate(line.occurredAt, history.timezone) < fromDay
    ) {
      out.push(line);
      continue;
    }
    let quantity = 0;
    for (let unit = 0; unit < line.quantity; unit += 1) {
      if (multiplier < 1) quantity += random() < multiplier ? 1 : 0;
      else {
        const extra = multiplier - 1;
        quantity += 1 + Math.floor(extra) + (random() < extra % 1 ? 1 : 0);
      }
    }
    if (quantity > 0) out.push({ ...line, quantity });
  }
  return out;
}

// ------------------------------------------------------------ measures

export type QualifyingCounts = {
  minZ: number;
  evaluations: number;
  qualifying: number;
  qualifyingIncrease: number;
  qualifyingDecrease: number;
  confirmedCases: Array<{
    day: string;
    productId: string;
    productName: string;
    type: string;
  }>;
};

const DEMAND_TYPES = new Set(['unit_demand_increase', 'unit_demand_decrease']);

/** §2.3: ready unit-demand evaluations and those that qualify, plus confirmed unit-demand cases. */
export function qualifyingCounts(
  history: History,
  records: DayRecord[],
  minZ: number,
): QualifyingCounts {
  const names = new Map(history.products.map((p) => [p.id, p.name]));
  let evaluations = 0;
  let increase = 0;
  let decrease = 0;
  for (const record of records)
    for (const value of Object.values(record.units)) {
      if (value.day !== record.day || value.assessment.readiness !== 'ready')
        continue;
      evaluations += 1;
      if (value.assessment.materiality?.qualifies)
        if (value.assessment.materiality.direction === 'increase')
          increase += 1;
        else decrease += 1;
    }
  return {
    minZ,
    evaluations,
    qualifying: increase + decrease,
    qualifyingIncrease: increase,
    qualifyingDecrease: decrease,
    confirmedCases: records.flatMap((record) =>
      record.ops
        .filter((op) => op.op === 'open' && DEMAND_TYPES.has(op.type))
        .map((op) => ({
          day: record.day,
          productId: op.productId ?? '',
          productName: names.get(op.productId ?? '') ?? '',
          type: op.type,
        })),
    ),
  };
}

/** Eligible linked units per product per local date, computed independently of the engine. */
export function dailyUnits(history: History): Map<string, Map<string, number>> {
  const byProduct = new Map<string, Map<string, number>>();
  for (const line of history.sales) {
    if (!line.eligible || !line.productId) continue;
    const day = localDate(line.occurredAt, history.timezone);
    const days = byProduct.get(line.productId) ?? new Map<string, number>();
    days.set(day, (days.get(day) ?? 0) + line.quantity);
    byProduct.set(line.productId, days);
  }
  return byProduct;
}

const sumDays = (
  days: Map<string, number> | undefined,
  from: string,
  to: string,
) =>
  dayRange(from, to).reduce((total, day) => total + (days?.get(day) ?? 0), 0);

export type Wape = {
  evaluations: number;
  forecastReadyEvaluations: number;
  actualUnits: number;
  absoluteError: number;
  wape: number | null;
  readyOnlyWape: number | null;
  firstDay: string | null;
  lastDay: string | null;
};

/**
 * 7-day forecast WAPE: forecast = 7 × the engine's 28-day baseline rate at D,
 * actual = recorded units D+1…D+7. Only days whose 28-day window lies inside
 * the history and whose next 7 days are recorded.
 */
export function forecastWape(
  history: History,
  records: DayRecord[],
  historyStart: string,
  lastDay: string,
): Wape {
  const units = dailyUnits(history);
  let actualUnits = 0;
  let absoluteError = 0;
  let readyActual = 0;
  let readyError = 0;
  let evaluations = 0;
  let ready = 0;
  const used: string[] = [];
  for (const record of records) {
    if (
      addDays(record.day, -27) < historyStart ||
      addDays(record.day, 7) > lastDay
    )
      continue;
    used.push(record.day);
    for (const [id, baseline] of Object.entries(record.baseline)) {
      const forecast = 7 * baseline.perDay;
      const actual = sumDays(
        units.get(id),
        addDays(record.day, 1),
        addDays(record.day, 7),
      );
      evaluations += 1;
      actualUnits += actual;
      absoluteError += Math.abs(actual - forecast);
      if (baseline.forecastReason === null) {
        ready += 1;
        readyActual += actual;
        readyError += Math.abs(actual - forecast);
      }
    }
  }
  return {
    evaluations,
    forecastReadyEvaluations: ready,
    actualUnits,
    absoluteError,
    wape: actualUnits ? absoluteError / actualUnits : null,
    readyOnlyWape: readyActual ? readyError / readyActual : null,
    firstDay: used[0] ?? null,
    lastDay: used[used.length - 1] ?? null,
  };
}

/** Recomputes R, E, s², z and the 28-day rate from raw daily totals and compares with the engine. */
export function arithmeticChecks(history: History, records: DayRecord[]) {
  const units = dailyUnits(history);
  const close = (a: number, b: number) =>
    Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
  let checked = 0;
  const mismatches: Array<{
    day: string;
    productId: string;
    field: string;
    engine: number;
    independent: number;
  }> = [];
  for (const record of records)
    for (const [id, value] of Object.entries(record.units)) {
      if (value.day !== record.day) continue;
      const days = units.get(id);
      const d = record.day;
      const recent = sumDays(days, addDays(d, -6), d);
      const weeks = value.assessment.usedWeeks.map((_, k) =>
        sumDays(days, addDays(d, -7 * (k + 1) - 6), addDays(d, -7 * (k + 1))),
      );
      const fields: Array<[string, number, number]> = [
        ['recent', value.assessment.recent, recent],
        ...weeks.map((w, k): [string, number, number] => [
          `week_${k + 1}`,
          value.assessment.usedWeeks[k],
          w,
        ]),
      ];
      const m = value.assessment.materiality;
      if (m && weeks.length) {
        const e = weeks.reduce((a, b) => a + b, 0) / weeks.length;
        const s2 =
          weeks.length > 1
            ? weeks.reduce((a, w) => a + (w - e) ** 2, 0) / (weeks.length - 1)
            : 0;
        fields.push(
          ['expected', m.expected, e],
          ['variance', m.variance, s2],
          ['z', m.z, (recent - e) / Math.sqrt(Math.max(e, s2, 1))],
        );
      }
      const baseline = record.baseline[id];
      if (baseline)
        fields.push([
          'perDay',
          baseline.perDay,
          sumDays(days, addDays(d, -27), d) / 28,
        ]);
      for (const [field, engine, independent] of fields) {
        checked += 1;
        if (!close(engine, independent))
          mismatches.push({
            day: d,
            productId: id,
            field,
            engine,
            independent,
          });
      }
    }
  return {
    checked,
    mismatches: mismatches.length,
    examples: mismatches.slice(0, 10),
  };
}

/** Every case operation carries a headline, summary, before/after values and, for demand cases, the observation period. */
export function explanationCompleteness(records: DayRecord[]) {
  let operations = 0;
  const incomplete: Array<{
    day: string;
    type: string;
    op: string;
    missing: string[];
  }> = [];
  for (const record of records)
    for (const op of record.ops) {
      operations += 1;
      const missing = [
        !op.explanation.headline && 'headline',
        !op.explanation.summary && 'summary',
        op.op === 'open' && !op.after.length && 'after',
        !op.facts.productName && 'productName',
        DEMAND_TYPES.has(op.type) &&
          op.op !== 'resolve' &&
          !op.observation &&
          'observation',
        DEMAND_TYPES.has(op.type) &&
          op.op === 'open' &&
          !op.explanation.consequence &&
          'consequence',
      ].filter((x): x is string => Boolean(x));
      if (missing.length)
        incomplete.push({ day: record.day, type: op.type, op: op.op, missing });
    }
  return {
    operations,
    incomplete: incomplete.length,
    examples: incomplete.slice(0, 10),
  };
}

// ------------------------------------------------------------ detection power

export type PowerCell = {
  multiplier: number;
  minZ: number;
  baselineWeeks: string;
  trials: number;
  detected: number;
  rate: number;
  medianLagDays: number | null;
  wrongDirection: number;
};

/**
 * Injected sustained shifts from `shiftStart` to `lastDay`, `trials` seeded
 * trials per product. Detected = a confirmed unit-demand case in the injected
 * direction opened on or after the shift start. Lag = days from shift start
 * (day 0) to the confirming evaluation.
 */
export function detectionPower(
  history: History,
  options: {
    initDay: string;
    shiftStart: string;
    lastDay: string;
    multipliers: number[];
    trials: number;
    settings: Partial<ChangeIntelligenceSettings>;
    seed: string;
  },
): { cells: PowerCell[]; latenciesMs: number[] } {
  const settings = settingsWith(options.settings);
  const store = createStore({
    merchantId: history.merchantId,
    timezone: history.timezone,
    settings,
  });
  replayDays(
    history,
    store,
    dayRange(options.initDay, addDays(options.shiftStart, -1)),
    history.sales,
    true,
  );
  const window = dayRange(options.shiftStart, options.lastDay);
  const latenciesMs: number[] = [];
  const cells = options.multipliers.map((multiplier) => {
    const wanted =
      multiplier > 1 ? 'unit_demand_increase' : 'unit_demand_decrease';
    const lags: number[] = [];
    let trials = 0;
    let wrong = 0;
    for (const productId of productIds(history))
      for (let trial = 0; trial < options.trials; trial += 1) {
        trials += 1;
        const random = seededRandom(
          `${options.seed}:${multiplier}:${productId}:${trial}`,
        );
        const sales = injectShift(
          history,
          productId,
          multiplier,
          options.shiftStart,
          random,
        );
        const records = replayDays(
          history,
          structuredClone(store),
          window,
          sales,
        );
        for (const r of records) latenciesMs.push(r.ms);
        const opens = records.flatMap((r) =>
          r.ops
            .filter(
              (op) =>
                op.op === 'open' &&
                op.productId === productId &&
                DEMAND_TYPES.has(op.type),
            )
            .map((op) => ({ day: r.day, type: op.type })),
        );
        const hit = opens.find((o) => o.type === wanted);
        if (hit) lags.push(daysBetween(options.shiftStart, hit.day));
        else if (opens.length) wrong += 1;
      }
    lags.sort((a, b) => a - b);
    return {
      multiplier,
      minZ: settings.minZ,
      baselineWeeks: `${settings.baselineWeeksMin}–${settings.baselineWeeksMax}`,
      trials,
      detected: lags.length,
      rate: lags.length / trials,
      medianLagDays: lags.length
        ? lags[Math.floor((lags.length - 1) / 2)]
        : null,
      wrongDirection: wrong,
    };
  });
  return { cells, latenciesMs };
}

// ------------------------------------------------------------ propagation

/**
 * Expected vs actual invoked nodes for a stock-only and a threshold-only
 * change on one product, and selective vs full re-evaluation consistency
 * (same final fingerprints) on the same snapshot.
 */
export function propagationChecks(
  history: History,
  store: EngineStore,
  day: string,
  productId: string,
) {
  const stockNodes = [
    'available_stock',
    'stock_cover',
    'projected_stock_dates',
    'replenishment_guidance',
    'stock_risk',
  ];
  const scenarios: Array<{
    name: string;
    field: 'on_hand' | 'threshold';
    change: (p: ProductObservation) => ProductObservation;
    allowed: string[];
    required: string[];
  }> = [
    {
      name: 'stock-only (on hand +25)',
      field: 'on_hand',
      change: (p) => ({ ...p, onHand: p.onHand + 25 }),
      allowed: [
        ...stockNodes.map((n) => instanceKey(n as NodeKey, productId)),
        'merchant_change_summary',
      ],
      required: [instanceKey('available_stock', productId)],
    },
    {
      name: 'threshold-only (threshold +3)',
      field: 'threshold',
      change: (p) => ({ ...p, threshold: p.threshold + 3 }),
      allowed: [
        instanceKey('minimum_stock_policy', productId),
        ...stockNodes.map((n) => instanceKey(n as NodeKey, productId)),
        'merchant_change_summary',
      ],
      required: [instanceKey('minimum_stock_policy', productId)],
    },
  ];
  return scenarios.map((scenario) => {
    const products = history.products.map((p) =>
      p.id === productId ? scenario.change(p) : p,
    );
    const affected: AffectedSet = {
      products: { [productId]: [scenario.field] },
      merchant: [],
    };
    /** Selective vs full re-evaluation from the same snapshot at one instant. */
    const compare = (hour: number) => {
      const asOf = asOfAfter(day, history.timezone, hour);
      const selectiveStore = structuredClone(store);
      const fullStore = structuredClone(store);
      const started = performance.now();
      const selective = run(selectiveStore, {
        asOf,
        reason: 'source_change',
        sales: history.sales,
        products,
        affected,
      });
      const ms = performance.now() - started;
      run(fullStore, {
        asOf,
        reason: 'reconciliation',
        sales: history.sales,
        products,
        affected: 'all',
      });
      const keys = new Set([
        ...Object.keys(selectiveStore.states),
        ...Object.keys(fullStore.states),
      ]);
      const differing = [...keys].filter(
        (key) =>
          selectiveStore.states[key]?.fingerprint !==
          fullStore.states[key]?.fingerprint,
      );
      return { selective, ms, states: keys.size, differing };
    };
    // Same instant as the last daily evaluation, and eight hours later.
    const same = compare(1);
    const later = compare(9);
    const selective = same.selective;
    const selectiveMs = same.ms;
    const unexpected = selective.invoked.filter(
      (key) => !scenario.allowed.includes(key),
    );
    const missing = scenario.required.filter(
      (key) => !selective.invoked.includes(key),
    );
    return {
      scenario: scenario.name,
      expectedAllowed: scenario.allowed,
      invoked: selective.invoked,
      unexpected,
      missing,
      demandCalculatorsInvoked: selective.invoked.filter(
        (k) =>
          /demand|activity|change:/.test(k) &&
          !k.startsWith('merchant_change_summary'),
      ),
      selectiveVsFull: { states: same.states, differing: same.differing },
      laterSameDay: { differing: later.differing },
      selectiveMs,
    };
  });
}

export const percentile = (values: number[], p: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  ];
};

export { settingsWith };
