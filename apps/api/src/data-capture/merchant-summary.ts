import type { MerchantSummaryBucket } from '@repo/shared';

type SummaryTransaction = {
  displayAmountMinor: bigint;
  occurredAt: Date;
};

type SummaryException = {
  reasonCode: string;
  createdAt: Date;
};

export type MerchantActivitySummary = {
  receivedTodayMinor: bigint;
  received30DaysMinor: bigint;
  paymentCount30Days: number;
  averageSaleMinor: bigint;
  dailyTrend: MerchantSummaryBucket[];
  hourlyRhythm: MerchantSummaryBucket[];
  captureQualityPercent: number;
  lastCapturedAt: string | null;
};

const CAPTURE_FAILURE_REASONS = new Set(['malformed_event', 'missed_event']);

export function calculateCaptureQualityPercent(
  captured: number,
  exceptionReasonCodes: string[],
) {
  const captureFailures = exceptionReasonCodes.filter((reasonCode) =>
    CAPTURE_FAILURE_REASONS.has(reasonCode),
  ).length;
  const denominator = captured + captureFailures;
  return denominator ? Math.round((captured / denominator) * 10_000) / 100 : 0;
}

function dateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return { year: value('year'), month: value('month'), day: value('day') };
}

export function merchantLocalDateKey(date: Date, timeZone: string) {
  const { year, month, day } = dateParts(date, timeZone);
  return `${year}-${month}-${day}`;
}

export function merchantCalendarDaySpan(
  from: Date,
  to: Date,
  timeZone: string,
) {
  const fromKey = merchantLocalDateKey(from, timeZone);
  const toKey = merchantLocalDateKey(to, timeZone);
  const fromUtc = Date.parse(`${fromKey}T00:00:00.000Z`);
  const toUtc = Date.parse(`${toKey}T00:00:00.000Z`);
  if (fromUtc > toUtc) return 0;
  return Math.floor((toUtc - fromUtc) / 86_400_000) + 1;
}

function merchantLocalHour(date: Date, timeZone: string) {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(date)
    .find((part) => part.type === 'hour')?.value;
  return Number(hour ?? 0);
}

function calendarKeysEndingAt(date: Date, timeZone: string, days: number) {
  const endKey = merchantLocalDateKey(date, timeZone);
  const [year, month, day] = endKey.split('-').map(Number);
  const endUtc = Date.UTC(year, month - 1, day);
  return Array.from({ length: days }, (_, index) =>
    new Date(endUtc - (days - 1 - index) * 86_400_000)
      .toISOString()
      .slice(0, 10),
  );
}

export function buildMerchantActivitySummary(input: {
  now: Date;
  timeZone: string;
  transactions: SummaryTransaction[];
  exceptions: SummaryException[];
}): MerchantActivitySummary {
  const dayKeys = calendarKeysEndingAt(input.now, input.timeZone, 30);
  const includedDays = new Set(dayKeys);
  const daily = new Map(
    dayKeys.map((start) => [start, { amount: 0n, count: 0 }]),
  );
  const hourly = new Map<number, { amount: bigint; count: number }>();
  const todayKey = dayKeys.at(-1);
  let receivedTodayMinor = 0n;
  let received30DaysMinor = 0n;
  let paymentCount30Days = 0;
  let lastCapturedAt: Date | null = null;

  for (const transaction of input.transactions) {
    const dayKey = merchantLocalDateKey(transaction.occurredAt, input.timeZone);
    if (!includedDays.has(dayKey)) continue;

    received30DaysMinor += transaction.displayAmountMinor;
    paymentCount30Days += 1;
    if (dayKey === todayKey)
      receivedTodayMinor += transaction.displayAmountMinor;

    const day = daily.get(dayKey)!;
    day.amount += transaction.displayAmountMinor;
    day.count += 1;

    const hourKey = merchantLocalHour(transaction.occurredAt, input.timeZone);
    const hour = hourly.get(hourKey) ?? { amount: 0n, count: 0 };
    hour.amount += transaction.displayAmountMinor;
    hour.count += 1;
    hourly.set(hourKey, hour);

    if (!lastCapturedAt || transaction.occurredAt > lastCapturedAt)
      lastCapturedAt = transaction.occurredAt;
  }

  const exceptionReasonCodes = input.exceptions
    .filter((exception) =>
      includedDays.has(
        merchantLocalDateKey(exception.createdAt, input.timeZone),
      ),
    )
    .map((exception) => exception.reasonCode);

  return {
    receivedTodayMinor,
    received30DaysMinor,
    paymentCount30Days,
    averageSaleMinor: paymentCount30Days
      ? received30DaysMinor / BigInt(paymentCount30Days)
      : 0n,
    dailyTrend: [...daily.entries()].map(([start, bucket]) => ({
      start,
      amountMinor: bucket.amount.toString(),
      paymentCount: bucket.count,
    })),
    hourlyRhythm: Array.from({ length: 24 }, (_, hour) => {
      const bucket = hourly.get(hour) ?? { amount: 0n, count: 0 };
      return {
        start: `${String(hour).padStart(2, '0')}:00`,
        amountMinor: bucket.amount.toString(),
        paymentCount: bucket.count,
      };
    }),
    captureQualityPercent: calculateCaptureQualityPercent(
      paymentCount30Days,
      exceptionReasonCodes,
    ),
    lastCapturedAt: lastCapturedAt?.toISOString() ?? null,
  };
}
