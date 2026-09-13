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

export type MerchantTransactionStatus = "received";

export type MerchantTransaction = {
  id: string;
  receiptNumber: string;
  amount: MoneyValue;
  description: string | null;
  status: MerchantTransactionStatus;
  receivedAt: string;
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

export type MerchantProductStatus = 'active' | 'archived';

export type MerchantProduct = {
  id: string;
  name: string;
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
