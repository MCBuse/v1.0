/**
 * General Transaction Analytics.
 *
 * Pure calculation over recorded sales: no database, no clock of its own, no
 * randomness. The same rows and the same `now` always produce the same
 * answer, which is what lets the combined explanations be generated
 * deterministically and what makes any of this testable.
 *
 * Every boundary is the merchant's local calendar, not UTC. A sale at 00:30
 * Berlin time belongs to that Berlin day even though UTC still calls it
 * yesterday.
 */

export type AnalyticsSource = 'mcbuse_payment' | 'merchant_cash';
export type Grouping = 'day' | 'week' | 'month';

export interface AnalyticsSale {
  amountMinor: bigint;
  occurredAt: Date;
  source: AnalyticsSource;
  /** How the customer paid, kept distinct from how the sale was captured. */
  paymentMethod: string;
}

export interface TransactionAnalyticsInput {
  sales: AnalyticsSale[];
  previousSales: AnalyticsSale[];
  range: { from: Date; to: Date };
  timezone: string;
  grouping: Grouping;
  now: Date;
}

interface SourceBreakdown {
  amountMinor: string;
  count: number;
  amountSharePercent: number;
  countSharePercent: number;
}

interface SeriesPoint {
  periodStart: string;
  periodEnd: string;
  label: string;
  amountMinor: string;
  count: number;
  averageMinor: string;
  /** True when the period has not finished yet, so the figure will still move. */
  partial: boolean;
  partialReasons?: string[];
}

interface Trend<T> {
  current: T;
  previous: T;
  changePercent: number | null;
  baselineAvailable: boolean;
}

export interface TransactionAnalytics {
  range: { from: string; to: string; timezone: string; grouping: Grouping };
  totals: {
    salesMinor: string;
    transactionCount: number;
    averageTransactionMinor: string;
  };
  bySource: { digital: SourceBreakdown; cash: SourceBreakdown };
  byPaymentMethod: Array<{
    method: string;
    amountMinor: string;
    count: number;
    amountSharePercent: number;
  }>;
  series: SeriesPoint[];
  hourly: Array<{ hour: number; amountMinor: string; count: number }>;
  peakHour: { hour: number; amountMinor: string; count: number } | null;
  busiestWindow: {
    startHour: number;
    endHour: number;
    amountMinor: string;
    count: number;
    amountSharePercent: number;
  } | null;
  tradingWindow: { firstHour: number; lastHour: number } | null;
  trends: {
    sales: Trend<never> & { currentMinor: string; previousMinor: string };
    transactionCount: Trend<number>;
    averageValue: Trend<never> & {
      currentMinor: string;
      previousMinor: string;
    };
  };
  labels: {
    partialPeriod: boolean;
    missingBaseline: boolean;
    notes: string[];
  };
}

const WINDOW_HOURS = 3;

function localDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function localHour(date: Date, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(date),
  );
}

function localClock(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(date);
}

/** Whole days between two calendar dates, both expressed as YYYY-MM-DD. */
function dayKeysBetween(fromKey: string, toKey: string): string[] {
  const keys: string[] = [];
  let cursor = Date.parse(`${fromKey}T00:00:00.000Z`);
  const end = Date.parse(`${toKey}T00:00:00.000Z`);
  while (cursor <= end) {
    keys.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 86_400_000;
  }
  return keys;
}

/** The ISO week's Monday, as a calendar date. */
function weekStartKey(dayKey: string): string {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  const weekday = (date.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(date.getTime() - weekday * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function monthStartKey(dayKey: string): string {
  return `${dayKey.slice(0, 7)}-01`;
}

function periodKeyFor(dayKey: string, grouping: Grouping): string {
  if (grouping === 'week') return weekStartKey(dayKey);
  if (grouping === 'month') return monthStartKey(dayKey);
  return dayKey;
}

function periodEndKey(periodStart: string, grouping: Grouping): string {
  if (grouping === 'day') return periodStart;
  if (grouping === 'week') {
    return new Date(Date.parse(`${periodStart}T00:00:00.000Z`) + 6 * 86_400_000)
      .toISOString()
      .slice(0, 10);
  }
  const [year, month] = periodStart.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function percentage(part: bigint | number, whole: bigint | number): number {
  const wholeNumber = Number(whole);
  if (wholeNumber === 0) return 0;
  return Math.round((Number(part) / wholeNumber) * 10_000) / 100;
}

function changePercent(
  current: bigint | number,
  previous: bigint | number,
): number | null {
  // No baseline means no comparison. Reporting "up 100%" against nothing
  // would be inventing a fact.
  if (Number(previous) === 0) return null;
  return (
    Math.round(
      ((Number(current) - Number(previous)) / Number(previous)) * 10_000,
    ) / 100
  );
}

function meanMinor(totalMinor: bigint, count: number): bigint {
  if (count === 0) return 0n;
  const countBig = BigInt(count);
  // Round half up, in integer arithmetic.
  return (totalMinor * 2n + countBig) / (countBig * 2n);
}

function breakdown(
  sales: AnalyticsSale[],
  totalMinor: bigint,
  totalCount: number,
): SourceBreakdown {
  const amount = sales.reduce((sum, item) => sum + item.amountMinor, 0n);
  return {
    amountMinor: amount.toString(),
    count: sales.length,
    amountSharePercent: percentage(amount, totalMinor),
    countSharePercent: percentage(sales.length, totalCount),
  };
}

export function buildTransactionAnalytics(
  input: TransactionAnalyticsInput,
): TransactionAnalytics {
  const { sales, previousSales, range, timezone, grouping, now } = input;

  const totalMinor = sales.reduce((sum, item) => sum + item.amountMinor, 0n);
  const totalCount = sales.length;
  const digital = sales.filter((item) => item.source === 'mcbuse_payment');
  const cash = sales.filter((item) => item.source === 'merchant_cash');

  // Payment method, deliberately independent of capture channel.
  const methodTotals = new Map<string, { amount: bigint; count: number }>();
  for (const item of sales) {
    const entry = methodTotals.get(item.paymentMethod) ?? {
      amount: 0n,
      count: 0,
    };
    entry.amount += item.amountMinor;
    entry.count += 1;
    methodTotals.set(item.paymentMethod, entry);
  }

  // Every day in range, so empty days are visible rather than missing.
  const dayKeys = dayKeysBetween(
    localDateKey(range.from, timezone),
    localDateKey(range.to, timezone),
  );
  const periods = new Map<string, { amount: bigint; count: number }>();
  for (const dayKey of dayKeys) {
    const periodKey = periodKeyFor(dayKey, grouping);
    if (!periods.has(periodKey))
      periods.set(periodKey, { amount: 0n, count: 0 });
  }

  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    amount: 0n,
    count: 0,
  }));

  for (const item of sales) {
    const dayKey = localDateKey(item.occurredAt, timezone);
    const periodKey = periodKeyFor(dayKey, grouping);
    const bucket = periods.get(periodKey) ?? { amount: 0n, count: 0 };
    bucket.amount += item.amountMinor;
    bucket.count += 1;
    periods.set(periodKey, bucket);

    const hour = hourly[localHour(item.occurredAt, timezone)];
    hour.amount += item.amountMinor;
    hour.count += 1;
  }

  const todayKey = localDateKey(now, timezone);
  const series: SeriesPoint[] = [...periods.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodStart, bucket]) => {
      const periodEnd = periodEndKey(periodStart, grouping);
      return {
        periodStart,
        periodEnd,
        label: periodStart,
        amountMinor: bucket.amount.toString(),
        count: bucket.count,
        averageMinor: meanMinor(bucket.amount, bucket.count).toString(),
        // The period is still running if today falls inside it.
        partial: (todayKey >= periodStart && todayKey <= periodEnd) || periodStart < localDateKey(range.from, timezone) || periodEnd > localDateKey(range.to, timezone) || (periodStart === localDateKey(range.from, timezone) && (localClock(range.from, timezone) !== '00:00:00' || range.from.getMilliseconds() !== 0)) || (periodEnd === localDateKey(range.to, timezone) && (localClock(range.to, timezone) !== '23:59:59' || range.to.getMilliseconds() !== 999)),
        partialReasons: [
          ...(todayKey >= periodStart && todayKey <= periodEnd ? ['period_running'] : []),
          ...(periodStart <= localDateKey(range.from, timezone) && (periodStart < localDateKey(range.from, timezone) || (localClock(range.from, timezone) !== '00:00:00' || range.from.getMilliseconds() !== 0)) ? ['range_start'] : []),
          ...(periodEnd >= localDateKey(range.to, timezone) && (periodEnd > localDateKey(range.to, timezone) || (localClock(range.to, timezone) !== '23:59:59' || range.to.getMilliseconds() !== 999)) ? ['range_end'] : []),
        ],
      };
    });

  const soldHours = hourly.filter((entry) => entry.count > 0);
  const peak = soldHours.reduce<(typeof hourly)[number] | null>(
    (best, entry) =>
      best === null || entry.amount > best.amount ? entry : best,
    null,
  );

  let busiestWindow: TransactionAnalytics['busiestWindow'] = null;
  if (soldHours.length > 0) {
    for (let start = 0; start <= 24 - WINDOW_HOURS; start += 1) {
      const slice = hourly.slice(start, start + WINDOW_HOURS);
      const amount = slice.reduce((sum, entry) => sum + entry.amount, 0n);
      const count = slice.reduce((sum, entry) => sum + entry.count, 0);
      if (
        busiestWindow === null ||
        amount > BigInt(busiestWindow.amountMinor)
      ) {
        busiestWindow = {
          startHour: start,
          endHour: start + WINDOW_HOURS - 1,
          amountMinor: amount.toString(),
          count,
          amountSharePercent: percentage(amount, totalMinor),
        };
      }
    }
  }

  const previousTotalMinor = previousSales.reduce(
    (sum, item) => sum + item.amountMinor,
    0n,
  );
  const previousCount = previousSales.length;
  const currentAverage = meanMinor(totalMinor, totalCount);
  const previousAverage = meanMinor(previousTotalMinor, previousCount);
  const baselineAvailable = previousCount > 0;

  const notes: string[] = [];
  const partialPeriod = series.some((point) => point.partial);
  if (partialPeriod) {
    notes.push(
      'Some periods are still running or clipped by the selected reporting range.',
    );
  }
  if (!baselineAvailable) {
    notes.push(
      'There is no activity in the preceding period, so trends cannot be calculated.',
    );
  }

  return {
    range: {
      from: localDateKey(range.from, timezone),
      to: localDateKey(range.to, timezone),
      timezone,
      grouping,
    },
    totals: {
      salesMinor: totalMinor.toString(),
      transactionCount: totalCount,
      averageTransactionMinor: currentAverage.toString(),
    },
    bySource: {
      digital: breakdown(digital, totalMinor, totalCount),
      cash: breakdown(cash, totalMinor, totalCount),
    },
    byPaymentMethod: [...methodTotals.entries()]
      .map(([method, entry]) => ({
        method,
        amountMinor: entry.amount.toString(),
        count: entry.count,
        amountSharePercent: percentage(entry.amount, totalMinor),
      }))
      .sort(
        (a, b) =>
          Number(BigInt(b.amountMinor) - BigInt(a.amountMinor)) ||
          a.method.localeCompare(b.method),
      ),
    series,
    hourly: hourly.map((entry) => ({
      hour: entry.hour,
      amountMinor: entry.amount.toString(),
      count: entry.count,
    })),
    peakHour: peak
      ? {
          hour: peak.hour,
          amountMinor: peak.amount.toString(),
          count: peak.count,
        }
      : null,
    busiestWindow,
    tradingWindow:
      soldHours.length > 0
        ? {
            firstHour: soldHours[0].hour,
            lastHour: soldHours[soldHours.length - 1].hour,
          }
        : null,
    trends: {
      sales: {
        currentMinor: totalMinor.toString(),
        previousMinor: previousTotalMinor.toString(),
        changePercent: changePercent(totalMinor, previousTotalMinor),
        baselineAvailable,
      } as TransactionAnalytics['trends']['sales'],
      transactionCount: {
        current: totalCount,
        previous: previousCount,
        changePercent: changePercent(totalCount, previousCount),
        baselineAvailable,
      },
      averageValue: {
        currentMinor: currentAverage.toString(),
        previousMinor: previousAverage.toString(),
        changePercent: changePercent(currentAverage, previousAverage),
        baselineAvailable,
      } as TransactionAnalytics['trends']['averageValue'],
    },
    labels: { partialPeriod, missingBaseline: !baselineAvailable, notes },
  };
}
