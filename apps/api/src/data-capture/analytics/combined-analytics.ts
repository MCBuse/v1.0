import { STOCK_MOVEMENTS } from '../stock-movements';
/**
 * Combined Analytics: the four analyses the proposal names, each as a plain
 * explanation backed by the figures it was derived from.
 *
 * Everything here is generated deterministically from the transaction and
 * inventory analytics. There is no model call and no randomness: the same
 * inputs always produce the same words. AI wording may be layered on top
 * later, but it can only rephrase — it can never change a number.
 *
 * Sales figures respect whatever filter the merchant applied. Physical stock
 * does not, because stock is a single current position rather than a filtered
 * history. Where both appear in one analysis that difference is stated, so a
 * filtered comparison is never mistaken for a discrepancy.
 */
import type { InventoryAnalytics } from './inventory-analytics';
import type { TransactionAnalytics } from './transaction-analytics';

export interface CombinedAnalyticsInput {
  transactions: TransactionAnalytics;
  inventory: InventoryAnalytics;
  timezone: string;
  /** True when the sales figures were narrowed by a source filter. */
  salesFilterApplied?: boolean;
}

export interface CombinedFigure {
  key: string;
  label: string;
  value: string;
  unit?: 'minor_currency' | 'units' | 'percent' | 'days' | 'hour' | 'text';
}

export interface CombinedAnalysis {
  id:
    | 'sales_versus_stock'
    | 'trading_concentration'
    | 'volume_versus_value'
    | 'velocity_versus_availability';
  title: string;
  explanation: string;
  figures: CombinedFigure[];
  /** False when the data cannot support a conclusion, with the reason said out loud. */
  reliable: boolean;
  caveats: string[];
}

export interface CombinedAnalytics {
  analyses: CombinedAnalysis[];
  stockScopeNote: string;
  generatedBy: 'deterministic-rules-v1';
}

const STOCK_SCOPE_NOTE =
  'Stock figures cover all stock, not a filtered subset. Sales figures follow the filters you have applied.';

const FILTER_CAVEAT =
  'Sales here are filtered but stock is not, so a difference between them is not necessarily a discrepancy.';

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function money(minor: string): string {
  const negative = minor.startsWith('-');
  const digits = negative ? minor.slice(1) : minor;
  const padded = digits.padStart(3, '0');
  const major = padded.slice(0, -2);
  const cents = padded.slice(-2);
  return `${negative ? '-' : ''}${major}.${cents}`;
}

function figure(
  key: string,
  label: string,
  value: string | number,
  unit?: CombinedFigure['unit'],
): CombinedFigure {
  return { key, label, value: String(value), unit };
}

function direction(change: number): string {
  if (change > 0) return 'rose';
  if (change < 0) return 'fell';
  return 'held steady';
}

export function buildCombinedAnalytics(
  input: CombinedAnalyticsInput,
): CombinedAnalytics {
  const filterCaveats = input.salesFilterApplied ? [FILTER_CAVEAT] : [];

  return {
    analyses: [
      salesVersusStock(input, filterCaveats),
      tradingConcentration(input, filterCaveats),
      volumeVersusValue(input, filterCaveats),
      velocityVersusAvailability(input, filterCaveats),
    ],
    stockScopeNote: STOCK_SCOPE_NOTE,
    generatedBy: 'deterministic-rules-v1',
  };
}

/** 1. Revenue and units against what happened to stock over the same period. */
function salesVersusStock(
  input: CombinedAnalyticsInput,
  caveats: string[],
): CombinedAnalysis {
  const { transactions, inventory } = input;

  const unitsSold = inventory.fastMoving.reduce(
    (sum, entry) => sum + entry.unitsSold,
    0,
  );
  const byKind = (kind: string) =>
    inventory.movementsByKind.find((m) => m.kind === kind)?.quantity ?? 0;

  const restocked = byKind(STOCK_MOVEMENTS.restock);
  const adjusted = byKind(STOCK_MOVEMENTS.adjustment) + byKind('adjustment');
  const imported = byKind(STOCK_MOVEMENTS.imported);
  const closingStock = inventory.periodPosition?.closingOnHand;
  if (closingStock == null || !inventory.periodPosition?.eligible) return { id: 'sales_versus_stock', title: 'Sales against stock', explanation: 'The stock history cannot establish opening and closing quantities for this period.', figures: [], reliable: false, caveats: [...caveats, inventory.periodPosition?.reason ?? 'Insufficient stock history'] };

  // Net movement recorded in the period, so opening stock follows from the
  // closing position rather than being assumed.
  const netStockChange = inventory.movementsByKind.reduce(
    (sum, entry) => sum + entry.quantity,
    0,
  );
  const openingStock = inventory.periodPosition.openingOnHand!;

  const revenueMinor = transactions.totals.salesMinor;

  const movementWord = direction(netStockChange);
  const explanation =
    `Recorded sales came to ${money(revenueMinor)} across ` +
    `${transactions.totals.transactionCount} transactions, covering ${unitsSold} units. ` +
    `Stock ${movementWord} over the same period, opening at ${openingStock} and closing at ` +
    `${closingStock}` +
    (restocked > 0 ? `, with ${restocked} units restocked` : '') +
    (adjusted !== 0 ? ` and ${Math.abs(adjusted)} units adjusted` : '') +
    `, a net change of ${netStockChange}.`;

  return {
    id: 'sales_versus_stock',
    title: 'Sales against stock',
    explanation,
    figures: [
      figure('revenueMinor', 'Recorded sales', revenueMinor, 'minor_currency'),
      figure(
        'transactionCount',
        'Transactions',
        transactions.totals.transactionCount,
      ),
      figure('unitsSold', 'Units sold', unitsSold, 'units'),
      figure('openingStock', 'Opening stock', openingStock, 'units'),
      figure('closingStock', 'Closing stock', closingStock, 'units'),
      figure('restocked', 'Restocked', restocked, 'units'),
      figure('adjusted', 'Adjustments', adjusted, 'units'),
      figure('imported', 'Imported stock changes', imported, 'units'),
      figure('netStockChange', 'Net stock change', netStockChange, 'units'),
    ],
    reliable: true,
    caveats,
  };
}

/** 2. How concentrated trading is, defaulting to the busiest three hours. */
function tradingConcentration(
  input: CombinedAnalyticsInput,
  caveats: string[],
): CombinedAnalysis {
  const { transactions } = input;
  const window = transactions.busiestWindow;

  if (!window || transactions.totals.transactionCount === 0) {
    return {
      id: 'trading_concentration',
      title: 'Trading concentration',
      explanation:
        'There were no sales in this period, so there is no trading pattern to describe.',
      figures: [figure('transactionCount', 'Transactions', 0)],
      reliable: false,
      caveats,
    };
  }

  const transactionShare =
    transactions.totals.transactionCount === 0
      ? 0
      : Math.round(
          (window.count / transactions.totals.transactionCount) * 10_000,
        ) / 100;

  const explanation =
    `The busiest three hours were ${hourLabel(window.startHour)} to ` +
    `${hourLabel(window.endHour + 1)}, taking ${money(window.amountMinor)} ` +
    `across ${window.count} transactions. That is ${window.amountSharePercent}% of ` +
    `revenue and ${transactionShare}% of transactions in a window covering ` +
    `three of the day's twenty-four hours.`;

  return {
    id: 'trading_concentration',
    title: 'Trading concentration',
    explanation,
    figures: [
      figure('windowStartHour', 'Window start', window.startHour, 'hour'),
      figure('windowEndHour', 'Window end', window.endHour, 'hour'),
      figure(
        'windowRevenueMinor',
        'Revenue in window',
        window.amountMinor,
        'minor_currency',
      ),
      figure('windowTransactions', 'Transactions in window', window.count),
      figure(
        'revenueSharePercent',
        'Share of revenue',
        window.amountSharePercent,
        'percent',
      ),
      figure(
        'transactionSharePercent',
        'Share of transactions',
        transactionShare,
        'percent',
      ),
    ],
    reliable: true,
    caveats,
  };
}

/** 3. Transaction growth and revenue growth read together. */
function volumeVersusValue(
  input: CombinedAnalyticsInput,
  caveats: string[],
): CombinedAnalysis {
  const { transactions } = input;
  const { sales, transactionCount, averageValue } = transactions.trends;

  if (!sales.baselineAvailable) {
    return {
      id: 'volume_versus_value',
      title: 'Volume against value',
      explanation:
        'There is no activity in the preceding period, so there is no baseline to compare growth against.',
      figures: [
        figure(
          'revenueMinor',
          'Recorded sales',
          transactions.totals.salesMinor,
          'minor_currency',
        ),
        figure(
          'transactionCount',
          'Transactions',
          transactions.totals.transactionCount,
        ),
      ],
      reliable: false,
      caveats,
    };
  }

  const revenueChange = sales.changePercent ?? 0;
  const countChange = transactionCount.changePercent ?? 0;
  const ticketChange = averageValue.changePercent ?? 0;

  // The interesting part is the relationship, not the three numbers.
  let reading: string;
  if (countChange > 0 && ticketChange < 0) {
    reading =
      'More customers are buying, but each is spending less, so the average ticket fell.';
  } else if (countChange > 0 && ticketChange > 0) {
    reading = 'Both the number of sales and the size of each sale grew.';
  } else if (countChange < 0 && ticketChange > 0) {
    reading =
      'Fewer transactions, but larger ones, so revenue held up better than volume.';
  } else if (countChange < 0 && ticketChange < 0) {
    reading = 'Both the number of sales and their size declined.';
  } else {
    reading = 'Volume and ticket size moved broadly in step.';
  }

  const explanation =
    `Transactions ${direction(countChange)} ${Math.abs(countChange)}% and revenue ` +
    `${direction(revenueChange)} ${Math.abs(revenueChange)}%, putting the average ticket at ` +
    `${money(averageValue.currentMinor)} against ${money(averageValue.previousMinor)} ` +
    `before, a change of ${ticketChange}%. ${reading}`;

  return {
    id: 'volume_versus_value',
    title: 'Volume against value',
    explanation,
    figures: [
      figure(
        'revenueChangePercent',
        'Revenue change',
        revenueChange,
        'percent',
      ),
      figure(
        'transactionChangePercent',
        'Transaction change',
        countChange,
        'percent',
      ),
      figure(
        'averageTicketChangePercent',
        'Average ticket change',
        ticketChange,
        'percent',
      ),
      figure(
        'averageTicketMinor',
        'Average ticket',
        averageValue.currentMinor,
        'minor_currency',
      ),
      figure(
        'previousAverageTicketMinor',
        'Previous average ticket',
        averageValue.previousMinor,
        'minor_currency',
      ),
    ],
    reliable: true,
    caveats,
  };
}

/** 4. How fast the leading product sells against what is left on the shelf. */
function velocityVersusAvailability(
  input: CombinedAnalyticsInput,
  caveats: string[],
): CombinedAnalysis {
  const { inventory } = input;
  const leader = inventory.fastMoving[0];

  if (!leader || leader.unitsPerDay <= 0) {
    return {
      id: 'velocity_versus_availability',
      title: 'Selling speed against availability',
      explanation:
        'No product recorded any sales in this period, so selling speed cannot be compared with stock.',
      figures: [figure('productsSold', 'Products sold', 0)],
      reliable: false,
      caveats,
    };
  }

  const threshold = leader.lowStockThreshold;

  // Cover is counted down to the threshold, not to zero: hitting zero is
  // already too late to reorder.
  const usable = Math.max(0, leader.availableQuantity - threshold);
  const daysOfCover = Math.round((usable / leader.unitsPerDay) * 100) / 100;

  const guidance =
    daysOfCover <= 0
      ? `${leader.name} is already at or below its reorder level and needs replenishing now.`
      : daysOfCover < 3
        ? `At that rate ${leader.name} reaches its reorder level in about ${daysOfCover} days, so it should be replenished shortly.`
        : `At that rate ${leader.name} has about ${daysOfCover} days before it reaches its reorder level.`;

  const explanation =
    `${leader.name} sold ${leader.unitsSold} units, about ${leader.unitsPerDay} a day. ` +
    `There are ${leader.availableQuantity} available against a reorder level of ${threshold}. ` +
    guidance;

  return {
    id: 'velocity_versus_availability',
    title: 'Selling speed against availability',
    explanation,
    figures: [
      figure('productName', 'Product', leader.name, 'text'),
      figure('unitsSold', 'Units sold', leader.unitsSold, 'units'),
      figure('unitsPerDay', 'Units per day', leader.unitsPerDay, 'units'),
      figure('availableQuantity', 'Available', leader.availableQuantity, 'units'),
      figure('lowStockThreshold', 'Reorder level', threshold, 'units'),
      figure('daysOfCoverRemaining', 'Days of cover', daysOfCover, 'days'),
    ],
    reliable: true,
    caveats,
  };
}
