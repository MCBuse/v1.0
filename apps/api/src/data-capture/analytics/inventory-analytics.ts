/**
 * General Inventory Analytics.
 *
 * Pure calculation over the product catalogue, recorded stock movements and
 * sold lines. Two boundaries matter and are held deliberately:
 *
 *  - Stock is valued at the current selling price. That is not cost, not
 *    profit and not margin, and nothing here is labelled as though it were.
 *  - Turnover needs an anchored stock history. Where opening stock cannot be
 *    established the product is reported as ineligible rather than given a
 *    number derived from a guess.
 */

export interface InventoryProduct {
  id: string;
  name: string;
  category: string | null;
  unitPriceMinor: bigint;
  onHandQuantity: number;
  reservedQuantity: number;
  lowStockThreshold: number;
}

export interface StockMovement {
  productId: string;
  kind: string;
  onHandChange: number;
  occurredAt: Date;
}

export interface SoldLine {
  productId: string;
  quantity: number;
  amountMinor: bigint;
  /** The category captured on the sale line, when the record has one. */
  category: string | null;
  occurredAt: Date;
}

export interface InventoryAnalyticsInput {
  products: InventoryProduct[];
  movements: StockMovement[];
  soldLines: SoldLine[];
  range: { from: Date; to: Date };
  timezone: string;
}

interface ProductRanking {
  reservedQuantity: number;
  availableQuantity: number;
  productId: string;
  name: string;
  unitsSold: number;
  unitsPerDay: number;
  onHandQuantity: number;
  lowStockThreshold: number;
}

export interface StockOutInterval {
  /** Local date keys, inclusive. */
  from: string;
  to: string;
  days: number;
  /** True when the product was still out of stock at the end of the period. */
  ongoing: boolean;
}

interface HistoricalStockOut {
  productId: string;
  name: string;
  intervals: StockOutInterval[];
  totalDays: number;
  /** False when the history cannot support the reconstruction. */
  eligible: boolean;
  reason: string | null;
}

interface TurnoverEntry {
  productId: string;
  name: string;
  unitsSold: number;
  averageDailyOnHand: number | null;
  turnoverRatio: number | null;
  eligible: boolean;
  reason: string | null;
}

export type CategorySource = 'recorded' | 'current_product' | 'mixed';

export interface InventoryAnalytics {
  range: { from: string; to: string; days: number; timezone: string };
  position: {
    onHandQuantity: number;
    reservedQuantity: number;
    availableQuantity: number;
  };
  periodPosition: {
    openingOnHand: number | null;
    closingOnHand: number | null;
    eligible: boolean;
    reason: string | null;
  };
  valuation: {
    atSellingPriceMinor: string;
    basis: 'current_selling_price';
    note: string;
  };
  movementsByKind: Array<{ kind: string; quantity: number; entries: number }>;
  fastMoving: ProductRanking[];
  slowMoving: ProductRanking[];
  stockedButUnsold: ProductRanking[];
  atOrBelowMinimum: ProductRanking[];
  approachingMinimum: ProductRanking[];
  currentStockOuts: ProductRanking[];
  historicalStockOuts: HistoricalStockOut[];
  turnover: TurnoverEntry[];
  byCategory: Array<{
    category: string;
    unitsSold: number;
    amountMinor: string;
    productCount: number;
    categorySource: CategorySource;
  }>;
  notes: string[];
}

function categorySourceOf(entry: {
  recorded: boolean;
  fallback: boolean;
}): CategorySource {
  if (entry.recorded && entry.fallback) return 'mixed';
  return entry.recorded ? 'recorded' : 'current_product';
}

const VALUATION_NOTE =
  'Valued at current selling prices. This is not purchase cost and is not a profit or margin figure.';

/** A product selling fewer than this many units a day counts as slow. */
const SLOW_UNITS_PER_DAY = 1;

/** How close to the minimum counts as approaching it. */
const APPROACHING_MARGIN = 2;

function localDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function dayKeys(fromKey: string, toKey: string): string[] {
  const keys: string[] = [];
  let cursor = Date.parse(`${fromKey}T00:00:00.000Z`);
  const end = Date.parse(`${toKey}T00:00:00.000Z`);
  while (cursor <= end) {
    keys.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 86_400_000;
  }
  return keys;
}

export function buildInventoryAnalytics(
  input: InventoryAnalyticsInput,
): InventoryAnalytics {
  const { products, movements, soldLines, range, timezone } = input;

  const fromKey = localDateKey(range.from, timezone);
  const toKey = localDateKey(range.to, timezone);
  const days = dayKeys(fromKey, toKey);
  const dayCount = days.length;
  const notes: string[] = [];

  const onHandQuantity = products.reduce((sum, p) => sum + p.onHandQuantity, 0);
  const reservedQuantity = products.reduce(
    (sum, p) => sum + p.reservedQuantity,
    0,
  );

  const valuationMinor = products.reduce(
    (sum, p) => sum + BigInt(Math.max(0, p.onHandQuantity)) * p.unitPriceMinor,
    0n,
  );

  const inRange = (at: Date) => at >= range.from && at <= range.to;
  const byProduct = new Map<string, StockMovement[]>();
  const throughEnd = new Map<string, StockMovement[]>();
  for (const movement of movements) {
    const own = byProduct.get(movement.productId) ?? [];
    own.push(movement);
    byProduct.set(movement.productId, own);
    if (movement.occurredAt <= range.to) {
      const prior = throughEnd.get(movement.productId) ?? [];
      prior.push(movement);
      throughEnd.set(movement.productId, prior);
    }
  }
  const asOfProducts = products.map((p) => ({
    ...p,
    onHandQuantity:
      p.onHandQuantity -
      (byProduct.get(p.id) ?? [])
        .filter((m) => m.occurredAt > range.to)
        .reduce((sum, m) => sum + m.onHandChange, 0),
  }));
  const reconstructions = new Map(
    asOfProducts.map((p) => [
      p.id,
      reconstructClosings(p, throughEnd.get(p.id) ?? [], days, timezone),
    ]),
  );
  const historyReliable = [...reconstructions.values()].every(
    (result) => result.ok,
  );
  const periodClosing = asOfProducts.reduce(
    (sum, p) => sum + p.onHandQuantity,
    0,
  );

  // Movements grouped by kind, within the period only.
  const kindTotals = new Map<string, { quantity: number; entries: number }>();
  for (const movement of movements) {
    if (!inRange(movement.occurredAt)) continue;
    const entry = kindTotals.get(movement.kind) ?? { quantity: 0, entries: 0 };
    entry.quantity += movement.onHandChange;
    entry.entries += 1;
    kindTotals.set(movement.kind, entry);
  }

  // Units and revenue per product, within the period.
  const soldByProduct = new Map<string, { units: number; amount: bigint }>();
  for (const line of soldLines) {
    if (!inRange(line.occurredAt)) continue;
    const entry = soldByProduct.get(line.productId) ?? {
      units: 0,
      amount: 0n,
    };
    entry.units += line.quantity;
    entry.amount += line.amountMinor;
    soldByProduct.set(line.productId, entry);
  }

  const ranking = (p: InventoryProduct): ProductRanking => {
    const units = soldByProduct.get(p.id)?.units ?? 0;
    return {
      productId: p.id,
      name: p.name,
      unitsSold: units,
      unitsPerDay: dayCount === 0 ? 0 : round(units / dayCount, 4),
      onHandQuantity: p.onHandQuantity,
      reservedQuantity: p.reservedQuantity,
      availableQuantity: Math.max(0, p.onHandQuantity - p.reservedQuantity),
      lowStockThreshold: p.lowStockThreshold,
    };
  };

  const rankings = products.map(ranking);

  const fastMoving = rankings
    .filter((r) => r.unitsSold > 0)
    .sort(
      (a, b) => b.unitsPerDay - a.unitsPerDay || a.name.localeCompare(b.name),
    );

  const slowMoving = rankings
    .filter((r) => r.unitsSold > 0 && r.unitsPerDay < SLOW_UNITS_PER_DAY)
    .sort(
      (a, b) => a.unitsPerDay - b.unitsPerDay || a.name.localeCompare(b.name),
    );

  const stockedButUnsold = rankings
    .filter((r) => r.unitsSold === 0 && r.onHandQuantity > 0)
    .sort((a, b) => b.onHandQuantity - a.onHandQuantity);

  const withThreshold = (p: InventoryProduct) => ranking(p);

  const atOrBelowMinimum = products
    .filter((p) => p.onHandQuantity - p.reservedQuantity <= p.lowStockThreshold)
    .map(withThreshold)
    .sort((a, b) => a.onHandQuantity - b.onHandQuantity);

  const approachingMinimum = products
    .filter(
      (p) =>
        p.onHandQuantity - p.reservedQuantity > p.lowStockThreshold &&
        p.onHandQuantity - p.reservedQuantity <=
          p.lowStockThreshold + APPROACHING_MARGIN,
    )
    .map(withThreshold)
    .sort((a, b) => a.onHandQuantity - b.onHandQuantity);

  const currentStockOuts = rankings
    .filter((r) => r.availableQuantity <= 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  const historicalStockOuts = asOfProducts
    .map((p) =>
      stockOutIntervalsFor(
        p,
        throughEnd.get(p.id) ?? [],
        days,
        timezone,
        reconstructions.get(p.id),
      ),
    )
    .filter((entry) => !entry.eligible || entry.intervals.length > 0)
    .sort((a, b) => b.totalDays - a.totalDays || a.name.localeCompare(b.name));
  if (historicalStockOuts.some((entry) => !entry.eligible)) {
    notes.push(
      'Stock-out history is only reconstructed for products whose recorded movements support it.',
    );
  }

  const turnover = asOfProducts.map((p) =>
    turnoverFor(
      p,
      throughEnd.get(p.id) ?? [],
      soldByProduct.get(p.id)?.units ?? 0,
      days,
      timezone,
      reconstructions.get(p.id),
    ),
  );
  if (turnover.some((t) => !t.eligible)) {
    notes.push(
      'Turnover is only reported for products whose opening stock can be established from recorded movements.',
    );
  }

  // Category totals, preferring what the sale line recorded at the time.
  const productById = new Map(products.map((p) => [p.id, p]));
  const categories = new Map<
    string,
    {
      units: number;
      amount: bigint;
      products: Set<string>;
      recorded: boolean;
      fallback: boolean;
    }
  >();
  for (const line of soldLines) {
    if (!inRange(line.occurredAt)) continue;
    const fallback = line.category === null;
    const name =
      line.category ??
      productById.get(line.productId)?.category ??
      'Uncategorised';
    const entry = categories.get(name) ?? {
      units: 0,
      amount: 0n,
      products: new Set<string>(),
      recorded: false,
      fallback: false,
    };
    entry.units += line.quantity;
    entry.amount += line.amountMinor;
    entry.products.add(line.productId);
    if (fallback) entry.fallback = true;
    else entry.recorded = true;
    categories.set(name, entry);
  }
  if ([...categories.values()].some((entry) => entry.fallback)) {
    notes.push(
      'Some sale lines predate category capture and are grouped by the product’s current category.',
    );
  }

  return {
    range: { from: fromKey, to: toKey, days: dayCount, timezone },
    position: {
      onHandQuantity,
      reservedQuantity,
      availableQuantity: Math.max(0, onHandQuantity - reservedQuantity),
    },
    periodPosition: {
      openingOnHand: historyReliable
        ? periodClosing -
          [...kindTotals.values()].reduce((sum, m) => sum + m.quantity, 0)
        : null,
      closingOnHand: historyReliable ? periodClosing : null,
      eligible: historyReliable,
      reason: historyReliable
        ? null
        : 'Recorded movements do not establish a reliable stock history.',
    },
    valuation: {
      atSellingPriceMinor: valuationMinor.toString(),
      basis: 'current_selling_price',
      note: VALUATION_NOTE,
    },
    movementsByKind: [...kindTotals.entries()]
      .map(([kind, entry]) => ({ kind, ...entry }))
      .sort((a, b) => b.quantity - a.quantity || a.kind.localeCompare(b.kind)),
    fastMoving,
    slowMoving,
    stockedButUnsold,
    atOrBelowMinimum,
    approachingMinimum,
    currentStockOuts,
    historicalStockOuts,
    turnover,
    byCategory: [...categories.entries()]
      .map(([category, entry]) => ({
        category,
        unitsSold: entry.units,
        amountMinor: entry.amount.toString(),
        productCount: entry.products.size,
        categorySource: categorySourceOf(entry),
      }))
      .sort(
        (a, b) =>
          Number(BigInt(b.amountMinor) - BigInt(a.amountMinor)) ||
          a.category.localeCompare(b.category),
      ),
    notes,
  };
}

type Reconstruction =
  | { ok: true; closings: number[] }
  | { ok: false; reason: string };

/**
 * Daily closing on-hand stock for one product, walked backwards from today.
 *
 * Shared by turnover and by the stock-out history so the two can never
 * disagree about what the stock level was on a given day. The anchoring rule
 * is the same in both: without an opening balance the recorded movements are
 * an unknown fraction of what happened, and a reconstruction from them would
 * be a guess presented as a fact.
 */
function reconstructClosings(
  product: InventoryProduct,
  movements: StockMovement[],
  days: string[],
  timezone: string,
): Reconstruction {
  const own = movements.filter((m) => m.productId === product.id);
  const anchored = own.some(
    (m) =>
      m.kind === 'opening_balance' &&
      localDateKey(m.occurredAt, timezone) <= days[days.length - 1],
  );
  if (!anchored) {
    return {
      ok: false,
      reason:
        'Opening stock for this period cannot be established from recorded movements.',
    };
  }

  if (
    own.reduce((sum, m) => sum + m.onHandChange, 0) !== product.onHandQuantity
  ) {
    return {
      ok: false,
      reason: 'Recorded movements do not reconcile with the stock position.',
    };
  }
  const changeByDay = new Map<string, number>();
  for (const movement of own) {
    const key = localDateKey(movement.occurredAt, timezone);
    changeByDay.set(key, (changeByDay.get(key) ?? 0) + movement.onHandChange);
  }

  const closings: number[] = new Array<number>(days.length);
  let closing = product.onHandQuantity;
  for (let index = days.length - 1; index >= 0; index -= 1) {
    closings[index] = closing;
    closing -= changeByDay.get(days[index]) ?? 0;
  }

  if (closings.some((value) => value < 0)) {
    return {
      ok: false,
      reason:
        'Recorded movements do not reconcile with current stock for this period, so the stock history cannot be trusted.',
    };
  }

  return { ok: true, closings };
}

/**
 * The days a product spent at zero on-hand stock, as intervals.
 *
 * Reconstructed from the same daily closings turnover uses, so a period the
 * history cannot support is reported as ineligible rather than as "never out
 * of stock" — which is what an empty list would wrongly imply.
 */
function stockOutIntervalsFor(
  product: InventoryProduct,
  movements: StockMovement[],
  days: string[],
  timezone: string,
  prepared?: Reconstruction,
): HistoricalStockOut {
  const base = { productId: product.id, name: product.name };
  const reconstruction =
    prepared ?? reconstructClosings(product, movements, days, timezone);

  if (!reconstruction.ok) {
    return {
      ...base,
      intervals: [],
      totalDays: 0,
      eligible: false,
      reason: reconstruction.reason,
    };
  }

  const intervals: StockOutInterval[] = [];
  let start: number | null = null;
  for (let index = 0; index < days.length; index += 1) {
    const out = reconstruction.closings[index] <= 0;
    if (out && start === null) start = index;
    if (!out && start !== null) {
      intervals.push({
        from: days[start],
        to: days[index - 1],
        days: index - start,
        ongoing: false,
      });
      start = null;
    }
  }
  if (start !== null) {
    intervals.push({
      from: days[start],
      to: days[days.length - 1],
      days: days.length - start,
      ongoing: true,
    });
  }

  return {
    ...base,
    intervals,
    totalDays: intervals.reduce((sum, interval) => sum + interval.days, 0),
    eligible: true,
    reason: null,
  };
}

/**
 * Units sold divided by the average daily closing on-hand stock.
 *
 * Closing stock is reconstructed backwards from today's figure using the
 * recorded movements, which is only trustworthy when the history is anchored
 * by an opening balance at or before the period. Without that anchor the
 * product is reported as ineligible rather than given a fabricated ratio.
 */
function turnoverFor(
  product: InventoryProduct,
  movements: StockMovement[],
  unitsSold: number,
  days: string[],
  timezone: string,
  prepared?: Reconstruction,
): TurnoverEntry {
  const base = {
    productId: product.id,
    name: product.name,
    unitsSold,
  };

  const reconstruction =
    prepared ?? reconstructClosings(product, movements, days, timezone);
  if (!reconstruction.ok) {
    return {
      ...base,
      averageDailyOnHand: null,
      turnoverRatio: null,
      eligible: false,
      reason: reconstruction.reason,
    };
  }
  const { closings } = reconstruction;

  const averageDailyOnHand =
    closings.reduce((sum, value) => sum + value, 0) / closings.length;

  if (averageDailyOnHand <= 0) {
    return {
      ...base,
      averageDailyOnHand: round(averageDailyOnHand, 4),
      turnoverRatio: null,
      eligible: false,
      reason:
        'Average stock for this period is zero, so turnover is undefined.',
    };
  }

  return {
    ...base,
    averageDailyOnHand: round(averageDailyOnHand, 4),
    turnoverRatio: round(unitsSold / averageDailyOnHand, 4),
    eligible: true,
    reason: null,
  };
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
