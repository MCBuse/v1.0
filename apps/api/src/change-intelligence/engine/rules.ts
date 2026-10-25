/**
 * Pure calculation rules (plan §5.4–§5.9). Every number comes from settings.
 */
import type {
  CaseResolution,
  ChangeIntelligenceSettings,
  ChangeLocalPeriod,
  ForecastUnavailableReason,
  StockRiskLevel,
} from '@repo/shared';
import { addDays, daysBetween } from './local-time';

export type Direction = 'increase' | 'decrease';

/** Float comparisons on derived values (e.g. 7/28 ≥ 0.25) must not fail on rounding. */
const EPSILON = 1e-9;
const gte = (a: number, b: number) => a >= b - EPSILON;

export const sum = (values: number[]) =>
  values.reduce((total, value) => total + value, 0);
export const mean = (values: number[]) =>
  values.length ? sum(values) / values.length : 0;

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Sample variance (n − 1); 0 for fewer than two values. */
export function sampleVariance(values: number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  return (
    sum(values.map((value) => (value - average) ** 2)) / (values.length - 1)
  );
}

// ---------------------------------------------------------------- windows §5.4

export type Windows = {
  /** D, the most recent completed local day. */
  day: string;
  recent: ChangeLocalPeriod;
  /** W1..W(baselineWeeksMax), newest first. */
  weeks: ChangeLocalPeriod[];
  forecast: ChangeLocalPeriod;
  /** Earliest local date any window reaches. */
  earliest: string;
};

export function windowsFor(
  day: string,
  settings: ChangeIntelligenceSettings,
): Windows {
  const weeks = Array.from(
    { length: settings.baselineWeeksMax },
    (_, index) => ({
      from: addDays(day, -7 * (index + 1) - 6),
      to: addDays(day, -7 * (index + 1)),
    }),
  );
  const forecast = {
    from: addDays(day, -(settings.forecastWindowDays - 1)),
    to: day,
  };
  const oldestWeek = weeks[weeks.length - 1].from;
  return {
    day,
    recent: { from: addDays(day, -6), to: day },
    weeks,
    forecast,
    earliest: oldestWeek < forecast.from ? oldestWeek : forecast.from,
  };
}

/** Complete local days from the history start through D (inclusive); 0 when it starts after D. */
export function historyDaysAt(
  historyStartDate: string | null,
  day: string,
): number {
  if (!historyStartDate) return 0;
  return Math.max(0, daysBetween(historyStartDate, day) + 1);
}

/** min(baselineWeeksMax, floor(historyDays / 7) − 1), never negative. */
export function baselineWeeksUsed(
  historyDays: number,
  settings: ChangeIntelligenceSettings,
): number {
  return Math.max(
    0,
    Math.min(settings.baselineWeeksMax, Math.floor(historyDays / 7) - 1),
  );
}

/** History needed before detection: 7 × (baselineWeeksMin + 1) days. */
export function requiredHistoryDays(
  settings: ChangeIntelligenceSettings,
): number {
  return 7 * (settings.baselineWeeksMin + 1);
}

// ------------------------------------------------------------ materiality §5.6

export type Materiality = {
  expected: number;
  variance: number;
  z: number;
  difference: number;
  /** |R − E| / E; null when E = 0. */
  relative: number | null;
  direction: Direction | null;
  spikeAdjustedRecent: number | null;
  qualifies: boolean;
};

export function assessMateriality(
  input: { recent: number; weeks: number[]; recentDaily: number[] },
  settings: ChangeIntelligenceSettings,
): Materiality {
  const { recent, weeks, recentDaily } = input;
  const expected = mean(weeks);
  const variance = sampleVariance(weeks);
  const difference = recent - expected;
  const z = difference / Math.sqrt(Math.max(expected, variance, 1));
  const direction: Direction | null =
    difference > 0 ? 'increase' : difference < 0 ? 'decrease' : null;
  const relative = expected > 0 ? Math.abs(difference) / expected : null;
  const meetsSize = (diff: number) =>
    gte(Math.abs(diff), settings.minAbsoluteDifference) &&
    gte(Math.abs(diff) / expected, settings.minRelativeDifference);

  let spikeAdjustedRecent: number | null = null;
  let qualifies = false;
  if (
    direction &&
    gte(expected, settings.minExpectedWeekly) &&
    meetsSize(difference) &&
    gte(Math.abs(z), settings.minZ)
  ) {
    // Spike guard: replace the most extreme recent day with E / 7.
    const extreme =
      direction === 'increase'
        ? Math.max(...recentDaily)
        : Math.min(...recentDaily);
    spikeAdjustedRecent = recent - extreme + expected / 7;
    const adjusted = spikeAdjustedRecent - expected;
    qualifies =
      Math.sign(adjusted) === Math.sign(difference) && meetsSize(adjusted);
  }
  return {
    expected,
    variance,
    z,
    difference,
    relative,
    direction,
    spikeAdjustedRecent,
    qualifies,
  };
}

// ----------------------------------------------------- confirmation §5.7

export type Lifecycle = {
  /** Local date D of the last daily evaluation applied; keys confirmation. */
  lastEvaluatedDate: string | null;
  lastReadyDate: string | null;
  streakDirection: Direction | null;
  streak: number;
  recoveryStreak: number;
  nonQualifyingStreak: number;
  active: { direction: Direction; confirmedOn: string } | null;
  notRecheckedSince: string | null;
  /** Resolution applied by the most recent daily evaluation, if any. */
  lastResolution: CaseResolution | null;
};

export const INITIAL_LIFECYCLE: Lifecycle = Object.freeze({
  lastEvaluatedDate: null,
  lastReadyDate: null,
  streakDirection: null,
  streak: 0,
  recoveryStreak: 0,
  nonQualifyingStreak: 0,
  active: null,
  notRecheckedSince: null,
  lastResolution: null,
});

export type LifecycleEvaluation = {
  date: string;
  /** A ready evaluation (or, during a recording gap, a qualifying increase). */
  assessable: boolean;
  qualifyingDirection: Direction | null;
  z: number | null;
};

/**
 * Advances qualification, confirmation, recovery, expiry, readiness loss and
 * reversal by one daily evaluation. A date at or before the last evaluated
 * date returns the previous state unchanged (§5.7, re-runs never advance).
 */
export function advanceLifecycle(
  previous: Lifecycle,
  evaluation: LifecycleEvaluation,
  settings: ChangeIntelligenceSettings,
  allowOpen: boolean,
): Lifecycle {
  if (
    previous.lastEvaluatedDate !== null &&
    evaluation.date <= previous.lastEvaluatedDate
  )
    return previous;
  const next: Lifecycle = {
    ...previous,
    lastEvaluatedDate: evaluation.date,
    lastResolution: null,
  };

  if (!evaluation.assessable) {
    next.streak = 0;
    next.streakDirection = null;
    next.recoveryStreak = 0;
    if (next.active) {
      next.notRecheckedSince = previous.lastReadyDate;
      if (
        previous.lastReadyDate &&
        daysBetween(previous.lastReadyDate, evaluation.date) >=
          settings.unassessableDays
      ) {
        return resolve(next, 'no_longer_assessable');
      }
    }
    return next;
  }

  const qualifying = evaluation.qualifyingDirection;
  next.lastReadyDate = evaluation.date;
  next.notRecheckedSince = null;
  next.streak = qualifying
    ? qualifying === previous.streakDirection
      ? previous.streak + 1
      : 1
    : 0;
  next.streakDirection = qualifying;
  next.recoveryStreak =
    evaluation.z !== null && Math.abs(evaluation.z) < settings.recoveryZ
      ? previous.recoveryStreak + 1
      : 0;

  const active = next.active;
  if (active) {
    next.nonQualifyingStreak =
      qualifying === active.direction ? 0 : previous.nonQualifyingStreak + 1;
    if (
      qualifying &&
      qualifying !== active.direction &&
      next.streak >= settings.confirmationDays
    ) {
      return {
        ...next,
        active: { direction: qualifying, confirmedOn: evaluation.date },
        nonQualifyingStreak: 0,
        recoveryStreak: 0,
        lastResolution: 'direction_reversed',
      };
    }
    if (next.recoveryStreak >= settings.recoveryDays)
      return resolve(next, 'returned_to_usual');
    if (next.nonQualifyingStreak >= settings.expiryDays)
      return resolve(next, 'no_longer_detected');
    return next;
  }
  if (qualifying && allowOpen && next.streak >= settings.confirmationDays) {
    return {
      ...next,
      active: { direction: qualifying, confirmedOn: evaluation.date },
      nonQualifyingStreak: 0,
      recoveryStreak: 0,
    };
  }
  return next;
}

function resolve(state: Lifecycle, resolution: CaseResolution): Lifecycle {
  return {
    ...state,
    active: null,
    notRecheckedSince: null,
    nonQualifyingStreak: 0,
    recoveryStreak: 0,
    lastResolution: resolution,
  };
}

// --------------------------------------------------------- forecast §5.8

export type StockForecast = {
  daysToMinimum: number | null;
  daysToZero: number | null;
  suggestedUnits: number | null;
  reason: ForecastUnavailableReason | null;
};

export function forecastStock(
  input: { available: number; minimum: number; dailyUnits: number },
  settings: ChangeIntelligenceSettings,
): StockForecast {
  const { available, minimum, dailyUnits } = input;
  if (available < 0) return unavailable('data_quality_blocked');
  if (!(dailyUnits > 0)) return unavailable('no_positive_demand');
  return {
    daysToMinimum: Math.max(0, available - minimum) / dailyUnits,
    daysToZero: Math.max(0, available) / dailyUnits,
    suggestedUnits: Math.max(
      0,
      Math.ceil(
        settings.replenishmentDays * dailyUnits + minimum - available - EPSILON,
      ),
    ),
    reason: null,
  };
}

const unavailable = (reason: ForecastUnavailableReason): StockForecast => ({
  daysToMinimum: null,
  daysToZero: null,
  suggestedUnits: null,
  reason,
});

// ----------------------------------------------------------- risk §5.9

export function classifyRisk(
  input: {
    available: number;
    minimum: number;
    forecastReason: ForecastUnavailableReason | null;
    daysToMinimum: number | null;
  },
  settings: ChangeIntelligenceSettings,
): StockRiskLevel {
  if (input.available <= 0) return 'out_of_stock';
  if (input.available <= input.minimum) return 'low_stock';
  if (input.forecastReason || input.daysToMinimum === null)
    return 'forecast_unavailable';
  if (input.daysToMinimum <= settings.projectedRiskDays)
    return 'projected_stock_risk';
  return 'normal';
}
