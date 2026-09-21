export type MerchantCurrency = "EUR";

export type MoneyValue = {
  minor: string;
  currency: MerchantCurrency;
  estimated: boolean;
  rateTimestamp: string | null;
};

export type MerchantSummaryBucket = {
  start: string;
  amountMinor: string;
  paymentCount: number;
};

export type MerchantProblem = {
  id: string;
  code:
    | "payment_failed"
    | "payment_delayed"
    | "capture_malformed"
    | "capture_missed"
    | "payment_issue";
  severity: "info" | "warning" | "critical";
  title: string;
  action: string;
  occurredAt: string;
};

export type MerchantSummary = {
  availableValue: MoneyValue;
  receivedToday: MoneyValue;
  received30Days: MoneyValue;
  paymentCount30Days: number;
  averageSale: MoneyValue;
  dailyTrend: MerchantSummaryBucket[];
  hourlyRhythm: MerchantSummaryBucket[];
  captureQualityPercent: number;
  lastCapturedAt: string | null;
  pendingRequestCount: number;
  problemCount: number;
  problems: MerchantProblem[];
  lastUpdatedAt: string;
};

export type MerchantWorkspaceSummary = MerchantSummary & {
  recordedToday: MoneyValue;
  recordedSaleCountToday: number;
  recordedAverageSaleToday: MoneyValue;
  topProductToday: { productId: string; name: string; quantitySold: number; totalSales: MoneyValue } | null;
  peakSellingHourToday: string | null;
  recorded30Days: MoneyValue;
  recordedSaleCount30Days: number;
  recordedAverageSale: MoneyValue;
  recordedDailyTrend: MerchantSummaryBucket[];
  recordedHourlyRhythm: MerchantSummaryBucket[];
  lowStockProductCount: number;
  readinessStage: MerchantReadinessStage;
};

export type MerchantTransactionStatus = "received";

export type MerchantTransaction = {
  id: string;
  receiptNumber: string;
  amount: MoneyValue;
  description: string | null;
  status: MerchantTransactionStatus;
  receivedAt: string;
  /**
   * Q.13 — the financial attributes a merchant needs to answer "what did this
   * sale actually do?" without opening three other screens.
   */
  settlement: {
    amount: string;
    currency: string;
    /** The rate the amount above was quoted at, scaled by 1e9. */
    quoteRateScaled: string;
  };
  /** Explicit rather than omitted: zero is a fact, an absent field is not. */
  fees: {
    merchantFeeMinor: string;
    networkFeePaidBy: "treasury";
    note: string;
  };
  netAmount: MoneyValue;
  stockImpact: {
    /** Null when the sale had no product lines to move stock. */
    unitsSold: number | null;
    lines: number;
    note: string | null;
  };
  reconciliation: {
    state:
      | "matched"
      | "unmatched"
      | "no_source_records";
    /** The imported settlement reference, when one matched. */
    reference: string | null;
    note: string;
  };
  environment: MerchantEvidenceEnvironment;
};

export type MerchantTransactionPage = {
  items: MerchantTransaction[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type MerchantPaymentRequestStatus =
  | "pending"
  | "processing"
  | "completed"
  | "expired"
  | "cancelled"
  | "failed";

export type MerchantPaymentRequest = {
  id: string;
  amount: MoneyValue;
  description: string | null;
  status: MerchantPaymentRequestStatus;
  expiresAt: string;
  qrPayload: string;
  completedAt: string | null;
  createdAt: string;
};

export type MerchantPaymentRequestPage = {
  items: MerchantPaymentRequest[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type MerchantProductStatus = 'active' | 'archived';

export type MerchantProduct = {
  id: string;
  name: string;
  category: string | null;
  sku: string | null;
  description: string | null;
  unitPrice: MoneyValue;
  onHandQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  lowStockThreshold: number;
  lowStock: boolean;
  imageUrl: string | null;
  status: MerchantProductStatus;
  createdAt: string;
  updatedAt: string;
};

export type MerchantProductPage = {
  items: MerchantProduct[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type MerchantInvoiceLine = {
  id: string;
  type: 'product' | 'custom';
  productId: string | null;
  name: string;
  sku: string | null;
  quantity: number;
  unitPrice: MoneyValue;
  lineTotal: MoneyValue;
};

export type MerchantInvoice = {
  id: string;
  invoiceNumber: string;
  description: string | null;
  lines: MerchantInvoiceLine[];
  amount: MoneyValue;
  status: MerchantPaymentRequestStatus;
  expiresAt: string;
  qrPayload: string;
  completedAt: string | null;
  createdAt: string;
};

export type MerchantInvoicePage = {
  items: MerchantInvoice[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type MerchantReadinessStage =
  | "integrity_review"
  | "insufficient_evidence"
  | "building_history"
  | "evidence_ready";

export type MerchantReadinessMeasurements = {
  observedDays: number;
  activeDays: number;
  finalizedPayments: number;
  captureQualityPercent: number;
  finalityPercent: number;
  activeConsent: boolean;
  unresolvedCriticalException: boolean;
};

export type MerchantReadiness = {
  stage: MerchantReadinessStage;
  measured: MerchantReadinessMeasurements;
  passedRequirements: string[];
  missingRequirements: string[];
  disclaimer: string;
};

export type MerchantProfile = {
  id: string;
  businessName: string;
  timezone: string;
  displayCurrency: MerchantCurrency;
  role: "owner";
};

export type MerchantConsent = {
  active: boolean;
  purpose: string;
  version: string;
  recordedAt: string | null;
};

export type MerchantEvidenceSource = "mcbuse_payment" | "merchant_cash" | "external_import";
export type MerchantEvidenceVerification = "internally_confirmed" | "merchant_declared" | "imported_unverified" | "unknown";
export type MerchantEvidenceEnvironment = "live" | "test" | "synthetic" | "unknown";

export type MerchantActivityItem = {
  id: string;
  receiptNumber: string;
  source: MerchantEvidenceSource;
  verification: MerchantEvidenceVerification;
  environment: MerchantEvidenceEnvironment;
  amount: MoneyValue;
  description: string | null;
  status: "recorded" | "voided";
  occurredAt: string;
};

export type MerchantActivityPage = {
  items: MerchantActivityItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type MerchantAnalytics = {
  period: { from: string; to: string; timezone: string; partialCurrentDay: boolean };
  generatedAt: string;
  today: {
    sales: MoneyValue;
    saleCount: number;
    averageSale: MoneyValue;
    topProduct: { productId: string; name: string; quantitySold: number; totalSales: MoneyValue } | null;
    peakSellingHour: string | null;
  };
  sourceCoverage: Record<MerchantEvidenceSource, number>;
  totalRecordedSales: MoneyValue;
  saleCount: number;
  averageSale: MoneyValue;
  comparisonPercent: number | null;
  comparisons: {
    salesPercent: number | null;
    transactionCountPercent: number | null;
    averageSalePercent: number | null;
  };
  digitalSales: MoneyValue;
  cashSales: MoneyValue;
  dailyTrend: MerchantSummaryBucket[];
  hourlyRhythm: MerchantSummaryBucket[];
  productPerformance: Array<{
    productId: string;
    name: string;
    category: string;
    quantitySold: number;
    totalSales: MoneyValue;
    digitalQuantity: number;
    cashQuantity: number;
    previousQuantitySold: number;
    quantityChangePercent: number | null;
    averageDailyQuantity: number;
    stockValueAtSellingPrice: MoneyValue;
    turnover: number | null;
    turnoverStatus: "available" | "insufficient_stock_history";
  }>;
  categoryPerformance: Array<{
    category: string;
    quantitySold: number;
    totalSales: MoneyValue;
    previousQuantitySold: number;
    quantityChangePercent: number | null;
  }>;
  inventory: {
    stockValueAtSellingPrices: MoneyValue;
    availableValueAtSellingPrices: MoneyValue;
    reservedValueAtSellingPrices: MoneyValue;
    lowStockProductCount: number;
    zeroStockProductCount: number;
    valuationBasis: "current_selling_price";
  };
  unassignedItems: Array<{
    name: string;
    quantitySold: number;
    totalSales: MoneyValue;
    digitalQuantity: number;
    cashQuantity: number;
  }>;
};

export type MerchantInsightKind =
  | "stock_risk"
  | "discrepancy"
  | "anomaly"
  | "performance";

export type MerchantInsight = {
  id: string;
  code: string;
  kind: MerchantInsightKind;
  priority: number;
  title: string;
  summary: string;
  recommendation: string | null;
  evidence: Array<{ id: string; label: string; value: string }>;
  limitations: string[];
  narrationSource: "deterministic" | "groq";
};

export type MerchantInsightsResponse = {
  backlog?: { status: string; ageSeconds: number; attempts: number; reason: string | null } | null;
  status: "ready" | "updating" | "disabled";
  calculationVersion: string;
  generatedAt: string | null;
  stale: boolean;
  snapshot: { metrics: Record<string, unknown> } | null;
  scope: {
    label: "all_recorded_activity";
    periodFrom: string | null;
    periodTo: string | null;
    mixedData: boolean;
    sourceCoverage: Partial<Record<MerchantEvidenceEnvironment | MerchantEvidenceSource, number>>;
  };
  insights: MerchantInsight[];
  message: string | null;
  /**
   * N.13 — how fresh the calculation is, and whether the last attempt to
   * refresh it failed. A stale figure with a working worker and a stale figure
   * with a broken one look identical without this.
   */
  freshness: {
    generatedAt: string | null;
    ageSeconds: number | null;
    stale: boolean;
    staleAfterMinutes: number;
  };
  lastFailure: {
    at: string;
    reason: string;
    attempts: number;
  } | null;
};

export type MerchantCashSaleLine = {
  type: "product" | "custom";
  productId?: string;
  name?: string;
  quantity: number;
  unitPriceMinor?: string;
};

export type MerchantPayout = {
  id: string;
  sourceName: string;
  externalReference: string;
  currency: string;
  expectedAmountMinor: string | null;
  actualAmountMinor: string | null;
  expectedAt: string | null;
  receivedAt: string | null;
  providerStatus: string;
  payoutStatus: "expected" | "processing" | "settled" | "delayed" | "missing";
  reconciliationStatus: "matched" | "difference" | "unmatched";
};

export type MerchantProductAnalytics = {
  productId: string;
  periodDays: 7 | 30;
  quantitySold: number;
  revenue: MoneyValue;
  digitalQuantity: number;
  cashQuantity: number;
  averageDailyQuantity: number;
  peakSellingHour: number | null;
  onHandQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  lowStock: boolean;
  stockTrackingNote: string;
  stockMovements: Array<{ kind: string; onHandChange: number; reservedChange: number; occurredAt: string }>;
};
