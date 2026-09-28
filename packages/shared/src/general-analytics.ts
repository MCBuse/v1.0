/**
 * The General Analytics response, shared between the API and its clients.
 *
 * The API annotates its service with this type, so a change to either side
 * that the other does not follow is a compile error rather than a runtime
 * surprise in a chart.
 */

export type AnalyticsGrouping = "day" | "week" | "month";
export type AnalyticsSourceFilter = "mcbuse_payment" | "merchant_cash";

export type AnalyticsSourceBreakdown = {
  amountMinor: string;
  count: number;
  amountSharePercent: number;
  countSharePercent: number;
};

export type AnalyticsSeriesPoint = {
  periodStart: string;
  periodEnd: string;
  label: string;
  amountMinor: string;
  count: number;
  averageMinor: string;
  /** True while the period is still running, so the figure will keep moving. */
  partial: boolean;
  partialReasons?: string[];
};

export type AnalyticsTrend<T> = {
  current: T;
  previous: T;
  /** Null when there is no baseline: never zero, never a hundred. */
  changePercent: number | null;
  baselineAvailable: boolean;
};

export type TransactionAnalytics = {
  range: {
    from: string;
    to: string;
    timezone: string;
    grouping: AnalyticsGrouping;
  };
  totals: {
    salesMinor: string;
    transactionCount: number;
    averageTransactionMinor: string;
  };
  bySource: {
    digital: AnalyticsSourceBreakdown;
    cash: AnalyticsSourceBreakdown;
  };
  byPaymentMethod: Array<{
    method: string;
    amountMinor: string;
    count: number;
    amountSharePercent: number;
  }>;
  series: AnalyticsSeriesPoint[];
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
    sales: AnalyticsTrend<never> & {
      currentMinor: string;
      previousMinor: string;
    };
    transactionCount: AnalyticsTrend<number>;
    averageValue: AnalyticsTrend<never> & {
      currentMinor: string;
      previousMinor: string;
    };
  };
  labels: {
    partialPeriod: boolean;
    missingBaseline: boolean;
    notes: string[];
  };
};

export type ProductRanking = {
  reservedQuantity: number;
  availableQuantity: number;
  productId: string;
  name: string;
  category: string | null;
  unitsSold: number;
  unitsPerDay: number;
  onHandQuantity: number;
  lowStockThreshold: number;
};

export type TurnoverEntry = {
  productId: string;
  name: string;
  unitsSold: number;
  averageDailyOnHand: number | null;
  turnoverRatio: number | null;
  eligible: boolean;
  reason: string | null;
};

export type StockOutInterval = {
  from: string;
  to: string;
  days: number;
  ongoing: boolean;
};

export type HistoricalStockOut = {
  productId: string;
  name: string;
  intervals: StockOutInterval[];
  totalDays: number;
  eligible: boolean;
  reason: string | null;
};

export type CategorySource = "recorded" | "current_product" | "mixed";

export type InventoryAnalytics = {
  range: { from: string; to: string; days: number; timezone: string };
  position: {
    onHandQuantity: number;
    reservedQuantity: number;
    availableQuantity: number;
  };
  periodPosition: { openingOnHand: number | null; closingOnHand: number | null; eligible: boolean; reason: string | null };
  valuation: {
    atSellingPriceMinor: string;
    basis: "current_selling_price";
    note: string;
  };
  movementsByKind: Array<{ kind: string; quantity: number; entries: number }>;
  /** Every product with its current stock and units sold in the period. */
  stock: ProductRanking[];
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
};

export type CombinedFigure = {
  key: string;
  label: string;
  value: string;
  unit?: "minor_currency" | "units" | "percent" | "days" | "hour" | "text";
};

export type CombinedAnalysis = {
  id:
    | "sales_versus_stock"
    | "trading_concentration"
    | "volume_versus_value"
    | "velocity_versus_availability";
  title: string;
  explanation: string;
  figures: CombinedFigure[];
  /** False when the data cannot support a conclusion; the reason is said. */
  reliable: boolean;
  caveats: string[];
};

export type CombinedAnalytics = {
  analyses: CombinedAnalysis[];
  stockScopeNote: string;
  generatedBy: "deterministic-rules-v1";
};

export type GeneralAnalyticsResponse = {
  transactions: TransactionAnalytics;
  inventory: InventoryAnalytics;
  combined: CombinedAnalytics;
  filters: {
    source: AnalyticsSourceFilter | "all";
    applied: boolean;
  };
};
