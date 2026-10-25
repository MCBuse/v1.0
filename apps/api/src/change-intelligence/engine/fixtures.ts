/**
 * Builders for engine inputs and a tiny in-memory store that threads results
 * between runs. Reusable by the backtest replay and evaluation export.
 */
import { DEFAULT_CHANGE_INTELLIGENCE_SETTINGS } from './settings';
import { addDays, localDayStart } from './local-time';
import { evaluateMerchant } from './evaluate';
import type {
  ActiveCase,
  AffectedSet,
  CaseOperation,
  EvaluationInput,
  EvaluationResult,
  NodeState,
  ProductObservation,
  SaleLineObservation,
} from './types';
import type { ChangeIntelligenceSettings, RunReason } from '@repo/shared';

/** The instant `hour`:00 local time on the day after D, so D is the completed day. */
export function asOfAfter(day: string, timezone: string, hour = 1): Date {
  return new Date(
    localDayStart(addDays(day, 1), timezone).getTime() + hour * 3_600_000,
  );
}

/**
 * Sale lines from a daily unit series ending on `lastDay` (dailyUnits[last] is lastDay).
 * Each day's units are split across `salesPerDay` sales (default one sale per day).
 */
export function saleLines(options: {
  productId: string | null;
  lastDay: string;
  dailyUnits: number[];
  timezone: string;
  salesPerDay?: number | number[];
  prefix?: string;
  source?: SaleLineObservation['source'];
}): SaleLineObservation[] {
  const { productId, lastDay, dailyUnits, timezone } = options;
  const prefix = options.prefix ?? productId ?? 'unassigned';
  const lines: SaleLineObservation[] = [];
  dailyUnits.forEach((units, index) => {
    if (units <= 0) return;
    const date = addDays(lastDay, index - dailyUnits.length + 1);
    const perDay = Array.isArray(options.salesPerDay)
      ? options.salesPerDay[index]
      : (options.salesPerDay ?? 1);
    const sales = Math.max(1, Math.min(units, perDay));
    const occurredAt = new Date(
      localDayStart(date, timezone).getTime() + 12 * 3_600_000,
    );
    for (let sale = 0; sale < sales; sale += 1) {
      const quantity =
        Math.floor(units / sales) + (sale < units % sales ? 1 : 0);
      const saleId = `${prefix}-${date}-${sale}`;
      lines.push({
        saleId,
        sourceLineId: `${saleId}-line`,
        productId,
        occurredAt,
        recordedAt: occurredAt,
        quantity,
        source: options.source ?? 'merchant_cash',
        environment: 'unknown',
        eligible: true,
        exclusionReason: null,
      });
    }
  });
  return lines;
}

/** n copies of a value. */
export const repeat = (value: number, n: number) =>
  Array.from({ length: n }, () => value);

export function productFixture(
  partial: Partial<ProductObservation> & { id: string },
): ProductObservation {
  return {
    name: partial.id,
    status: 'active',
    onHand: 40,
    reserved: 0,
    threshold: 5,
    historyStart: null,
    ...partial,
  };
}

export type EngineStore = {
  merchantId: string;
  timezone: string;
  settings: ChangeIntelligenceSettings;
  states: Record<string, NodeState>;
  activeCases: ActiveCase[];
  /** Every case operation applied, with the id it was applied to. */
  caseLog: Array<CaseOperation & { appliedTo: string }>;
  lastDailyEvaluationDate: string | null;
  nextCaseNumber: number;
};

export function createStore(
  options: {
    merchantId?: string;
    timezone?: string;
    settings?: ChangeIntelligenceSettings;
  } = {},
): EngineStore {
  return {
    merchantId: options.merchantId ?? 'merchant-1',
    timezone: options.timezone ?? 'Europe/Berlin',
    settings: options.settings ?? { ...DEFAULT_CHANGE_INTELLIGENCE_SETTINGS },
    states: {},
    activeCases: [],
    caseLog: [],
    lastDailyEvaluationDate: null,
    nextCaseNumber: 1,
  };
}

/** Persists a result into the store the way the worker will (states, cases, daily date). */
export function applyResult(
  store: EngineStore,
  result: EvaluationResult,
): void {
  for (const state of result.states) {
    store.states[state.instanceKey] = {
      value: state.value,
      readiness: state.readiness,
      fingerprint: state.fingerprint,
      version: state.version,
    };
  }
  for (const op of result.caseOperations) {
    if (op.op === 'open') {
      const id = `case-${store.nextCaseNumber++}`;
      store.activeCases.push({
        id,
        productId: op.productId,
        type: op.type,
        severity: op.severity,
        lastChangeDate: result.localDate,
      });
      store.caseLog.push({ ...op, appliedTo: id });
    } else if (op.op === 'append') {
      store.activeCases = store.activeCases.map((item) =>
        item.id === op.caseId
          ? { ...item, severity: op.severity, lastChangeDate: result.localDate }
          : item,
      );
      store.caseLog.push({ ...op, appliedTo: op.caseId });
    } else {
      store.activeCases = store.activeCases.filter(
        (item) => item.id !== op.caseId,
      );
      store.caseLog.push({ ...op, appliedTo: op.caseId });
    }
  }
  if (result.dailyEvaluationDate)
    store.lastDailyEvaluationDate = result.dailyEvaluationDate;
  store.settings = result.settings;
}

/** Evaluates against the store and applies the result. */
export function run(
  store: EngineStore,
  options: {
    asOf: Date;
    reason: RunReason;
    sales: SaleLineObservation[];
    products: ProductObservation[];
    affected?: AffectedSet;
    settings?: ChangeIntelligenceSettings;
    lastDailyEvaluationDate?: string | null;
  },
): EvaluationResult {
  const input: EvaluationInput = {
    merchantId: store.merchantId,
    timezone: store.timezone,
    asOf: options.asOf,
    settings: options.settings ?? store.settings,
    reason: options.reason,
    sales: options.sales,
    products: options.products,
    previousStates: store.states,
    previousActiveCases: store.activeCases,
    lastDailyEvaluationDate:
      options.lastDailyEvaluationDate === undefined
        ? store.lastDailyEvaluationDate
        : options.lastDailyEvaluationDate,
    affected: options.affected ?? 'all',
  };
  const result = evaluateMerchant(input);
  applyResult(store, result);
  return result;
}
