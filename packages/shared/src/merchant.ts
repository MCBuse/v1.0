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

export type MerchantSummary = {
  availableValue: MoneyValue;
  receivedToday: MoneyValue;
  received30Days: MoneyValue;
  paymentCount30Days: number;
  averageSale: MoneyValue;
  dailyTrend: MerchantSummaryBucket[];
  hourlyRhythm: MerchantSummaryBucket[];
  pendingRequestCount: number;
  problemCount: number;
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
