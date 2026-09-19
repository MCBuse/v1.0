import type { MerchantInsightKind } from '@repo/shared';
import { merchantLocalDateKey } from '../data-capture/merchant-summary';

export const ANALYTICS_CALCULATION_VERSION = 'merchant-intelligence-v1';

export type IntelligenceActivity = {
  amountMinor: bigint;
  occurredAt: Date;
  source: 'mcbuse_payment' | 'merchant_cash';
  environment: 'live' | 'test' | 'synthetic' | 'unknown';
};

export type IntelligenceProductLine = {
  productId: string;
  productName: string;
  quantity: number;
  totalMinor: bigint;
  occurredAt: Date;
  source: 'mcbuse_payment' | 'merchant_cash';
  stockAccountedFor: boolean;
};

export type IntelligenceProduct = {
  id: string;
  name: string;
  category: string;
  availableQuantity: number;
  lowStockThreshold: number;
};

export type IntelligenceStockMovement = {
  productId: string;
  kind: string;
  onHandChange: number;
  occurredAt: Date;
};

export type CalculatedInsight = {
  code: string;
  kind: MerchantInsightKind;
  priority: number;
  title: string;
  summary: string;
  recommendation: string | null;
  evidence: Array<{ id: string; label: string; value: string }>;
  limitations: string[];
};

export type IntelligenceCalculation = {
  periodFrom: Date;
  periodTo: Date;
  sourceCoverage: Record<string, number>;
  mixedData: boolean;
  metrics: Record<string, unknown>;
  insights: CalculatedInsight[];
};

function shiftDay(key: string, days: number) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function dayRange(end: string, length: number) {
  return Array.from({ length }, (_, index) => shiftDay(end, index - length + 1));
}

function weekday(key: string) {
  return new Date(`${key}T00:00:00.000Z`).getUTCDay();
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values: number[]) {
  if (!values.length) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function percentageChange(current: number, previous: number) {
  return previous === 0 ? null : Math.round(((current - previous) / previous) * 10_000) / 100;
}

function formatEur(minor: number | bigint) {
  return `EUR ${(Number(minor) / 100).toFixed(2)}`;
}

function anomaly(current: number, baseline: number[]) {
  if (baseline.length < 4) return false;
  const average = mean(baseline);
  const difference = Math.abs(current - average);
  return difference >= 5 && difference >= average * 0.5 && difference > standardDeviation(baseline) * 3;
}

export function calculateMerchantIntelligence(input: {
  now: Date;
  timezone: string;
  activities: IntelligenceActivity[];
  productLines: IntelligenceProductLine[];
  products: IntelligenceProduct[];
  stockMovements: IntelligenceStockMovement[];
}): IntelligenceCalculation {
  const today = merchantLocalDateKey(input.now, input.timezone);
  const lastCompleteDay = shiftDay(today, -1);
  const currentDays = dayRange(lastCompleteDay, 7);
  const previousDays = dayRange(shiftDay(currentDays[0], -1), 7);
  const allDays = dayRange(lastCompleteDay, 90);
  const currentSet = new Set(currentDays);
  const previousSet = new Set(previousDays);
  const localDay = (date: Date) => merchantLocalDateKey(date, input.timezone);
  const activitiesByDay = new Map<string, IntelligenceActivity[]>();
  for (const activity of input.activities) {
    const key = localDay(activity.occurredAt);
    activitiesByDay.set(key, [...(activitiesByDay.get(key) ?? []), activity]);
  }
  const linesByDay = new Map<string, IntelligenceProductLine[]>();
  const linesByProduct = new Map<string, IntelligenceProductLine[]>();
  for (const line of input.productLines) {
    const key = localDay(line.occurredAt);
    linesByDay.set(key, [...(linesByDay.get(key) ?? []), line]);
    linesByProduct.set(line.productId, [...(linesByProduct.get(line.productId) ?? []), line]);
  }
  const movementsByProduct = new Map<string, IntelligenceStockMovement[]>();
  for (const movement of input.stockMovements) movementsByProduct.set(movement.productId, [...(movementsByProduct.get(movement.productId) ?? []), movement]);

  const currentActivities = input.activities.filter((item) => currentSet.has(localDay(item.occurredAt)));
  const previousActivities = input.activities.filter((item) => previousSet.has(localDay(item.occurredAt)));
  const currentSales = currentActivities.reduce((sum, item) => sum + item.amountMinor, 0n);
  const previousSales = previousActivities.reduce((sum, item) => sum + item.amountMinor, 0n);
  const currentAverage = currentActivities.length ? currentSales / BigInt(currentActivities.length) : 0n;
  const previousAverage = previousActivities.length ? previousSales / BigInt(previousActivities.length) : 0n;
  const sourceCoverage = {
    mcbuse_payment: input.activities.filter((item) => item.source === 'mcbuse_payment').length,
    merchant_cash: input.activities.filter((item) => item.source === 'merchant_cash').length,
    live: input.activities.filter((item) => item.environment === 'live').length,
    test: input.activities.filter((item) => item.environment === 'test').length,
    synthetic: input.activities.filter((item) => item.environment === 'synthetic').length,
    unknown: input.activities.filter((item) => item.environment === 'unknown').length,
  };
  const mixedData = sourceCoverage.test + sourceCoverage.synthetic + sourceCoverage.unknown > 0;
  const limitations = mixedData
    ? ['Mixed recorded activity—included test or unclassified records.']
    : [];
  const insights: CalculatedInsight[] = [];

  if (previousActivities.length && currentSales !== previousSales) {
    const productCategory = new Map(input.products.map((product) => [product.id, product.category || 'Uncategorised']));
    const productContribution = new Map<string, { name: string; current: bigint; previous: bigint }>();
    const categoryContribution = new Map<string, { current: bigint; previous: bigint }>();
    for (const line of input.productLines) {
      const key = localDay(line.occurredAt);
      if (!currentSet.has(key) && !previousSet.has(key)) continue;
      const entry = productContribution.get(line.productId) ?? { name: line.productName, current: 0n, previous: 0n };
      const category = productCategory.get(line.productId) ?? 'Uncategorised';
      const categoryEntry = categoryContribution.get(category) ?? { current: 0n, previous: 0n };
      if (currentSet.has(key)) entry.current += line.totalMinor;
      if (previousSet.has(key)) entry.previous += line.totalMinor;
      if (currentSet.has(key)) categoryEntry.current += line.totalMinor;
      if (previousSet.has(key)) categoryEntry.previous += line.totalMinor;
      productContribution.set(line.productId, entry);
      categoryContribution.set(category, categoryEntry);
    }
    const contributionDriver = <T extends { current: bigint; previous: bigint }>(entries: Array<[string, T]>) => entries.sort((left, right) => {
      const leftChange = left[1].current - left[1].previous;
      const rightChange = right[1].current - right[1].previous;
      return Math.abs(Number(rightChange)) - Math.abs(Number(leftChange));
    })[0];
    const productDriver = contributionDriver([...productContribution.entries()]);
    const categoryDriver = contributionDriver([...categoryContribution.entries()]);
    const weekdayContribution = new Map<string, { current: bigint; previous: bigint }>();
    const hourContribution = new Map<string, { current: bigint; previous: bigint }>();
    for (const activity of [...currentActivities, ...previousActivities]) {
      const key = localDay(activity.occurredAt);
      const period = currentSet.has(key) ? 'current' : 'previous';
      const weekdayLabel = new Intl.DateTimeFormat('en-GB', { timeZone: input.timezone, weekday: 'long' }).format(activity.occurredAt);
      const hourLabel = `${new Intl.DateTimeFormat('en-GB', { timeZone: input.timezone, hour: '2-digit', hourCycle: 'h23' }).format(activity.occurredAt)}:00`;
      for (const [map, label] of [[weekdayContribution, weekdayLabel], [hourContribution, hourLabel]] as const) {
        const entry = map.get(label) ?? { current: 0n, previous: 0n };
        entry[period] += activity.amountMinor;
        map.set(label, entry);
      }
    }
    const weekdayDriver = contributionDriver([...weekdayContribution.entries()]);
    const hourDriver = contributionDriver([...hourContribution.entries()]);
    const salesChange = percentageChange(Number(currentSales), Number(previousSales));
    const countChange = percentageChange(currentActivities.length, previousActivities.length);
    const averageChange = percentageChange(Number(currentAverage), Number(previousAverage));
    const direction = currentSales > previousSales ? 'increased' : 'decreased';
    insights.push({
      code: 'performance.weekly_change',
      kind: 'performance',
      priority: 40,
      title: `Recorded sales ${direction} compared with the previous week`,
      summary: `${formatEur(currentSales)} was recorded in the last seven complete days, ${salesChange === null ? 'with no comparable percentage' : `${Math.abs(salesChange).toFixed(1)}% ${direction}`} versus the preceding seven days.${productDriver ? ` ${productDriver[1].name} had the largest observed product contribution.` : ''}${categoryDriver ? ` ${categoryDriver[0]} had the largest observed category contribution.` : ''}${weekdayDriver ? ` ${weekdayDriver[0]} had the largest observed weekday contribution.` : ''}${hourDriver ? ` ${hourDriver[0]} had the largest observed hourly contribution.` : ''}`,
      recommendation: 'Review the contributing products and trading periods before changing stock or staffing.',
      evidence: [
        { id: 'sales.current', label: 'Current seven-day sales', value: formatEur(currentSales) },
        { id: 'sales.previous', label: 'Previous seven-day sales', value: formatEur(previousSales) },
        { id: 'transactions.change', label: 'Transaction-count change', value: countChange === null ? 'Unavailable' : `${countChange.toFixed(1)}%` },
        { id: 'average.change', label: 'Average-transaction change', value: averageChange === null ? 'Unavailable' : `${averageChange.toFixed(1)}%` },
        ...(productDriver ? [{ id: `product:${productDriver[0]}`, label: productDriver[1].name, value: formatEur(productDriver[1].current - productDriver[1].previous) }] : []),
        ...(categoryDriver ? [{ id: `category:${categoryDriver[0]}`, label: `${categoryDriver[0]} category contribution`, value: formatEur(categoryDriver[1].current - categoryDriver[1].previous) }] : []),
        ...(weekdayDriver ? [{ id: `weekday:${weekdayDriver[0]}`, label: `${weekdayDriver[0]} contribution`, value: formatEur(weekdayDriver[1].current - weekdayDriver[1].previous) }] : []),
        ...(hourDriver ? [{ id: `hour:${hourDriver[0]}`, label: `${hourDriver[0]} contribution`, value: formatEur(hourDriver[1].current - hourDriver[1].previous) }] : []),
      ],
      limitations: [...limitations, 'Observed contributions do not establish why sales changed.'],
    });
  }

  const earliestActivity = input.activities.reduce<Date | null>((earliest, item) => !earliest || item.occurredAt < earliest ? item.occurredAt : earliest, null);
  const hasForecastHistory = Boolean(earliestActivity && localDay(earliestActivity) <= shiftDay(today, -28));
  for (const product of input.products) {
    const productLines = linesByProduct.get(product.id) ?? [];
    const last28Start = shiftDay(today, -28);
    const recentLines = productLines.filter((line) => localDay(line.occurredAt) >= last28Start && localDay(line.occurredAt) < today);
    const recentUnits = recentLines.reduce((sum, line) => sum + line.quantity, 0);
    if (!hasForecastHistory || recentUnits < 10) continue;
    let projectedRemaining = product.availableQuantity;
    let minimumDay: string | null = null;
    let zeroDay: string | null = null;
    let sevenDayDemand = 0;
    for (let offset = 0; offset < 28; offset++) {
      const futureDay = shiftDay(today, offset);
      const matchingDays = allDays.filter((day) => weekday(day) === weekday(futureDay)).slice(-4);
      const forecast = mean(matchingDays.map((day) => (linesByDay.get(day) ?? []).filter((line) => line.productId === product.id).reduce((sum, line) => sum + line.quantity, 0)));
      if (offset < 7) sevenDayDemand += forecast;
      projectedRemaining -= forecast;
      if (!minimumDay && projectedRemaining <= product.lowStockThreshold) minimumDay = futureDay;
      if (!zeroDay && projectedRemaining <= 0) zeroDay = futureDay;
    }
    if (minimumDay && minimumDay <= shiftDay(today, 6)) {
      const suggested = Math.max(0, Math.ceil(sevenDayDemand + product.lowStockThreshold - product.availableQuantity));
      insights.push({
        code: `stock_risk.${product.id}`,
        kind: 'stock_risk',
        priority: 10,
        title: `${product.name} may reach its minimum stock level soon`,
        summary: `Recorded demand suggests the minimum threshold may be reached around ${minimumDay}${zeroDay ? ` and stock may reach zero around ${zeroDay}` : ''}.`,
        recommendation: `Review replenishment timing and consider at least ${suggested} additional units for the next seven days.`,
        evidence: [
          { id: `product:${product.id}`, label: product.name, value: `${product.availableQuantity} units available` },
          { id: 'forecast.seven_day_units', label: 'Projected seven-day demand', value: `${Math.ceil(sevenDayDemand)} units` },
          { id: 'forecast.minimum_day', label: 'Projected minimum-stock date', value: minimumDay },
        ],
        limitations: [...limitations, 'Projection uses recorded demand only; supplier lead times and incoming orders are unavailable.'],
      });
    }
  }

  const lastDayActivities = activitiesByDay.get(lastCompleteDay) ?? [];
  const matchingBaselineDays = allDays.filter((day) => day < lastCompleteDay && weekday(day) === weekday(lastCompleteDay)).slice(-4);
  const baselineCounts = matchingBaselineDays.map((day) => (activitiesByDay.get(day) ?? []).length);
  if (anomaly(lastDayActivities.length, baselineCounts)) {
    insights.push({
      code: 'anomaly.daily_volume',
      kind: 'anomaly',
      priority: 30,
      title: 'Yesterday’s transaction volume was unusual',
      summary: `${lastDayActivities.length} transactions were recorded, compared with an average of ${mean(baselineCounts).toFixed(1)} on the previous four matching weekdays.`,
      recommendation: 'Review operations and source records for that day to understand the change.',
      evidence: [{ id: 'volume.latest', label: 'Latest completed day', value: `${lastDayActivities.length} transactions` }, { id: 'volume.baseline', label: 'Matching-weekday average', value: mean(baselineCounts).toFixed(1) }],
      limitations: [...limitations, 'This is a signal for investigation, not evidence of wrongdoing.'],
    });
  }

  for (const product of input.products) {
    const currentUnits = (linesByDay.get(lastCompleteDay) ?? []).filter((line) => line.productId === product.id).reduce((sum, line) => sum + line.quantity, 0);
    const baseline = matchingBaselineDays.map((day) => (linesByDay.get(day) ?? []).filter((line) => line.productId === product.id).reduce((sum, line) => sum + line.quantity, 0));
    const average = mean(baseline); const difference = Math.abs(currentUnits - average);
    if (baseline.length === 4 && difference >= 3 && difference >= average * 0.5 && difference > standardDeviation(baseline) * 3) insights.push({
      code: `anomaly.product.${product.id}`,
      kind: 'anomaly',
      priority: 31,
      title: `${product.name} sold at an unusual rate yesterday`,
      summary: `${currentUnits} units were recorded, compared with an average of ${average.toFixed(1)} on the previous four matching weekdays.`,
      recommendation: 'Check whether demand, availability, pricing, or recording practices changed.',
      evidence: [{ id: `product:${product.id}`, label: product.name, value: `${currentUnits} units` }, { id: 'product.baseline', label: 'Matching-weekday average', value: `${average.toFixed(1)} units` }],
      limitations: [...limitations, 'This is a signal for investigation, not evidence of wrongdoing.'],
    });
  }

  for (let hour = 0; hour < 24; hour++) {
    const current = lastDayActivities.filter((item) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: input.timezone, hour: '2-digit', hourCycle: 'h23' }).format(item.occurredAt)) === hour).length;
    const baseline = matchingBaselineDays.map((day) => (activitiesByDay.get(day) ?? []).filter((item) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: input.timezone, hour: '2-digit', hourCycle: 'h23' }).format(item.occurredAt)) === hour).length);
    if (anomaly(current, baseline)) insights.push({ code: `anomaly.hour.${hour}`, kind: 'anomaly', priority: 32, title: `${String(hour).padStart(2, '0')}:00 trading volume was unusual yesterday`, summary: `${current} transactions were recorded in that hour, versus a matching-weekday average of ${mean(baseline).toFixed(1)}.`, recommendation: 'Review staffing, availability, and source records for this period.', evidence: [{ id: `hour:${hour}`, label: `${String(hour).padStart(2, '0')}:00 transactions`, value: String(current) }], limitations: [...limitations, 'This is a signal for investigation, not evidence of wrongdoing.'] });
  }

  if (currentActivities.length >= 20 && previousActivities.length >= 20) {
    const currentCashShare = currentActivities.filter((item) => item.source === 'merchant_cash').length / currentActivities.length;
    const previousCashShare = previousActivities.filter((item) => item.source === 'merchant_cash').length / previousActivities.length;
    const points = Math.round((currentCashShare - previousCashShare) * 10_000) / 100;
    if (Math.abs(points) >= 20) insights.push({ code: 'anomaly.payment_mix', kind: 'anomaly', priority: 33, title: 'The recorded cash and digital mix changed materially', summary: `The merchant-recorded cash share changed by ${Math.abs(points).toFixed(1)} percentage points versus the preceding seven days.`, recommendation: 'Review whether customer behaviour or recording coverage changed.', evidence: [{ id: 'mix.current', label: 'Current cash share', value: `${(currentCashShare * 100).toFixed(1)}%` }, { id: 'mix.previous', label: 'Previous cash share', value: `${(previousCashShare * 100).toFixed(1)}%` }], limitations: [...limitations, 'Payment-method shares do not establish complete business turnover.'] });
  }

  for (const product of input.products) {
    const expectedChange = (linesByProduct.get(product.id) ?? []).filter((line) => line.source === 'mcbuse_payment' || !line.stockAccountedFor).reduce((sum, line) => sum - line.quantity, 0);
    const actualChange = (movementsByProduct.get(product.id) ?? []).filter((movement) => ['digital_sale', 'cash_sale', 'cash_sale_void'].includes(movement.kind)).reduce((sum, movement) => sum + movement.onHandChange, 0);
    if (expectedChange !== actualChange) insights.push({ code: `discrepancy.stock.${product.id}`, kind: 'discrepancy', priority: 20, title: `${product.name} has a sales and stock-movement discrepancy`, summary: `Recorded product sales imply a ${expectedChange}-unit stock change, while recorded sale movements total ${actualChange} units.`, recommendation: 'Review linked sales, voids, and stock movements before relying on forecasts for this product.', evidence: [{ id: `product:${product.id}`, label: product.name, value: `${product.availableQuantity} units available` }, { id: 'stock.expected_change', label: 'Expected sale change', value: `${expectedChange} units` }, { id: 'stock.actual_change', label: 'Recorded sale movements', value: `${actualChange} units` }], limitations: [...limitations, 'Manual adjustments, source snapshots, and stock already accounted for are excluded from this comparison.'] });
  }

  const kindOrder: Record<MerchantInsightKind, number> = { stock_risk: 0, discrepancy: 1, anomaly: 2, performance: 3 };
  insights.sort((left, right) => kindOrder[left.kind] - kindOrder[right.kind] || left.priority - right.priority || left.code.localeCompare(right.code));
  return {
    periodFrom: new Date(`${allDays[0]}T00:00:00.000Z`),
    periodTo: input.now,
    sourceCoverage,
    mixedData,
    metrics: { currentSevenDaySalesMinor: currentSales.toString(), previousSevenDaySalesMinor: previousSales.toString(), forecastEligible: hasForecastHistory },
    insights,
  };
}
