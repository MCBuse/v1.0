/**
 * Change Intelligence contract, shared between the API and the portal.
 *
 * Plan: docs/plans/change-intelligence-plan.md (§7). Bigint revisions and
 * money are strings. Local dates are `YYYY-MM-DD` in the merchant timezone.
 * Nothing here carries run UUIDs, node keys, z-scores or queue internals for
 * display; the run evidence endpoint is the only bounded exception.
 */

export const CHANGE_INTELLIGENCE_MODEL_VERSION = "change-intelligence-v1";

export type ChangeReadiness =
  | "ready"
  | "building_baseline"
  | "insufficient_history"
  | "recording_gap"
  | "data_quality_blocked";

export type ChangeCaseStatus = "active" | "resolved";

export type NodeOutcome = "changed" | "unchanged" | "blocked" | "skipped";

export type RunReason =
  | "source_change"
  | "clock"
  | "initialization"
  | "reconciliation"
  | "model_upgrade"
  | "settings_change";

export type CaseResolution =
  | "returned_to_usual"
  | "no_longer_detected"
  | "no_longer_assessable"
  | "direction_reversed"
  | "stock_normal"
  | "product_archived";

export type ChangeCaseType =
  | "transaction_velocity_increase"
  | "transaction_velocity_decrease"
  | "unit_demand_increase"
  | "unit_demand_decrease"
  | "stock_risk"
  | "stock_threshold_change"
  | "historical_correction";

/** The merchant-facing filter groups (§3.3). */
export type ChangeTypeFilter = "demand" | "stock" | "threshold" | "correction";

export const CHANGE_TYPE_FILTER_GROUPS: Record<ChangeTypeFilter, ChangeCaseType[]> = {
  demand: [
    "transaction_velocity_increase",
    "transaction_velocity_decrease",
    "unit_demand_increase",
    "unit_demand_decrease",
  ],
  stock: ["stock_risk"],
  threshold: ["stock_threshold_change"],
  correction: ["historical_correction"],
};

export type StockRiskLevel =
  | "out_of_stock"
  | "low_stock"
  | "projected_stock_risk"
  | "forecast_unavailable"
  | "normal";

export type ForecastUnavailableReason =
  | "building_baseline"
  | "insufficient_units"
  | "no_recent_activity"
  | "no_positive_demand"
  | "data_quality_blocked";

export type ChangeSeverity = "high" | "medium" | "low";

/** §3.4 ordering, 1 = most urgent. */
export type ChangeAttentionPriority = 1 | 2 | 3 | 4 | 5;

export type ChangeProcessingState =
  | "idle"
  | "pending"
  | "processing"
  | "delayed"
  | "failed";

export type ChangeDataProvenance = "ordinary" | "sample";

export type ChangeEvidenceEnvironment = "live" | "test" | "synthetic" | "unknown";

/** §5.11. Every run stores the effective values; saved cases show those. */
export type ChangeIntelligenceSettings = {
  baselineWeeksMin: number;
  baselineWeeksMax: number;
  minExpectedWeekly: number;
  minAbsoluteDifference: number;
  minRelativeDifference: number;
  minZ: number;
  confirmationDays: number;
  recoveryDays: number;
  recoveryZ: number;
  expiryDays: number;
  unassessableDays: number;
  recordingGapRatio: number;
  forecastWindowDays: number;
  forecastMinUnits: number;
  projectedRiskDays: number;
  replenishmentDays: number;
};

export type ChangeValueUnit =
  | "units"
  | "sales"
  | "days"
  | "weeks"
  | "units_per_day"
  | "local_date"
  | "risk";

/** One displayable value. `value` keeps full precision; round for display only. */
export type ChangeValue = {
  key: string;
  label: string;
  value: number | string | null;
  unit: ChangeValueUnit;
  /** Why the value is null, as a stable reason code. */
  reason?: ForecastUnavailableReason | null;
};

export type ChangeLocalPeriod = { from: string; to: string };

export type ChangeCaseSummary = {
  id: string;
  productId: string | null;
  productName: string | null;
  productAvailable: boolean;
  type: ChangeCaseType;
  status: ChangeCaseStatus;
  severity: ChangeSeverity;
  priority: ChangeAttentionPriority;
  headline: string;
  summary: string;
  consequence: string | null;
  suggestedAction: string | null;
  firstDetectedAt: string;
  lastChangedAt: string;
  resolvedAt: string | null;
  resolution: CaseResolution | null;
  /** "Identified during initial analysis". */
  identifiedDuringInitialAnalysis: boolean;
  /** Local date of the last ready evaluation when readiness was lost. */
  notRecheckedSince: string | null;
  observation: ChangeLocalPeriod | null;
  before: ChangeValue[];
  after: ChangeValue[];
  modelVersion: string;
};

export type ChangeListResponse = {
  items: ChangeCaseSummary[];
  nextCursor: string | null;
  timezone: string;
};

export type ChangeTrailStep = {
  label: string;
  before: ChangeValue | null;
  after: ChangeValue | null;
  changed: boolean;
};

export type ChangeTransitionEntry = {
  id: string;
  at: string;
  reason: RunReason;
  kind: "opened" | "updated" | "resolved" | "correction";
  summary: string;
  before: ChangeValue[];
  after: ChangeValue[];
};

export type ChangeCalculationDetails = {
  asOf: string;
  timezone: string;
  modelVersion: string;
  recentWindow: ChangeLocalPeriod | null;
  baselineWeeks: Array<ChangeLocalPeriod & { value: number }>;
  baselineWeeksUsed: number | null;
  forecastWindow: ChangeLocalPeriod | null;
  settings: ChangeIntelligenceSettings;
  assumptions: string[];
};

export type ChangeSourceInformation = {
  digitalSalesByEnvironment: Partial<Record<ChangeEvidenceEnvironment, number>>;
  cashSales: number;
  /** Cash sales carry no provenance column (§3.11). */
  cashSalesProvenance: "unknown";
  unassignedLines: number;
  excludedObservations: number;
  includesTestPayments: boolean;
  limitations: string[];
};

export type ChangeDetailResponse = {
  change: ChangeCaseSummary;
  runId: string | null;
  whatChanged: {
    recent: ChangeValue | null;
    usualWeekly: ChangeValue | null;
    baselineWeeks: Array<ChangeLocalPeriod & { value: number }>;
  };
  impact: ChangeTrailStep[];
  transitions: ChangeTransitionEntry[];
  calculation: ChangeCalculationDetails;
  source: ChangeSourceInformation;
  actions: { viewProduct: boolean; reviewStock: boolean };
};

export type ChangeStatusResponse = {
  available: boolean;
  unavailableReason: "disabled" | "not_enabled" | null;
  timezone: string;
  modelVersion: string;
  cadence: { stockMinutes: number; trendsDaily: true };
  initialized: boolean;
  lastSuccessfulAnalysisAt: string | null;
  processing: ChangeProcessingState;
  pendingSince: string | null;
  lastFailureAt: string | null;
  readiness: {
    trends: ChangeReadiness;
    requiredHistoryDays: number;
    daysUntilTrendsReady: number | null;
    /** Usual weekly units a product needs before its sales changes are assessed. */
    minUsualWeeklyUnits: number;
  };
  recordingGap: boolean;
  lastRecordedSaleDate: string | null;
  summary: {
    activeChanges: number;
    productsNeedingStockReview: number;
  };
  provenance: {
    account: ChangeDataProvenance;
    includesTestPayments: boolean;
  };
};

/** Bounded merchant-safe evidence for one run (GET /merchants/me/changes/runs/:runId). */
export type ChangeRunEvidence = {
  id: string;
  reason: RunReason;
  status: "succeeded" | "failed";
  asOf: string;
  completedAt: string | null;
  modelVersion: string;
  timezone: string;
  settings: ChangeIntelligenceSettings;
  coverage: ChangeSourceInformation;
  changedCases: number;
};

export type StaffChangeMerchant = {
  merchantId: string;
  publicId: string;
  businessName: string;
  ownerEmail: string | null;
  lastSuccessfulUpdateAt: string | null;
  processing: ChangeProcessingState;
};

export type StaffUpdateNowResponse = { status: "queued" | "already_running" };
