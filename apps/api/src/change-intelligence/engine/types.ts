import type {
  CaseResolution,
  ChangeCaseType,
  ChangeIntelligenceSettings,
  ChangeLocalPeriod,
  ChangeReadiness,
  ChangeSeverity,
  ChangeValue,
  ForecastUnavailableReason,
  RunReason,
  StockRiskLevel,
} from '@repo/shared';
import type { Direction, Lifecycle, Materiality, Windows } from './rules';

// ------------------------------------------------------------------ input §4.3

export type SaleExclusionReason =
  | 'pending'
  | 'failed'
  | 'cancelled'
  | 'voided'
  | 'malformed';

export type SaleLineObservation = {
  saleId: string;
  sourceLineId: string;
  /** null = unassigned line: counts toward coverage, not toward product demand. */
  productId: string | null;
  occurredAt: Date;
  recordedAt: Date;
  quantity: number;
  source: 'mcbuse_payment' | 'merchant_cash';
  environment: 'live' | 'test' | 'synthetic' | 'unknown';
  eligible: boolean;
  exclusionReason: SaleExclusionReason | null;
};

export type ProductObservation = {
  id: string;
  name: string;
  status: 'active' | 'archived';
  onHand: number;
  reserved: number;
  threshold: number;
  /** Earliest of created_at, first stock movement and first recorded sale (caller computes). */
  historyStart: Date | null;
};

export type ProductField =
  | 'sales'
  | 'on_hand'
  | 'reserved'
  | 'threshold'
  | 'status';

/**
 * What changed since the last run. `all` re-evaluates every node, except for
 * `clock` runs where it only seeds the clock-driven nodes (§5.3).
 */
export type AffectedSet =
  | 'all'
  | {
      products: Record<string, ProductField[]>;
      /** `sales` = unassigned-line changes; `timezone` re-evaluates everything. */
      merchant: Array<'sales' | 'timezone'>;
    };

export type NodeState = {
  value: unknown;
  readiness: ChangeReadiness;
  fingerprint: string;
  version: number;
};

export type ActiveCase = {
  id: string;
  productId: string | null;
  type: ChangeCaseType;
  severity: ChangeSeverity;
  /** Merchant-local date of the last open/append; drives expiry of threshold and correction cases. */
  lastChangeDate: string;
};

export type EvaluationInput = {
  merchantId: string;
  timezone: string;
  asOf: Date;
  settings: ChangeIntelligenceSettings;
  reason: RunReason;
  sales: SaleLineObservation[];
  products: ProductObservation[];
  /** Keyed by instance key (see `instanceKey`). */
  previousStates: Record<string, NodeState>;
  previousActiveCases: ActiveCase[];
  lastDailyEvaluationDate: string | null;
  affected: AffectedSet;
};

// ------------------------------------------------------------------ node values

export type MerchantRecordingValue = {
  day: string;
  recentUnits: number;
  /** Merchant-level units for W1..W(max), newest first. */
  weeks: number[];
  weeksUsed: number;
  recordingGap: boolean;
  /** Last eligible sale on or before D. */
  lastSaleDate: string | null;
};

export type ActivityValue = {
  day: string;
  historyDays: number;
  recent: number;
  recentDaily: number[];
  weeks: number[];
  forecastWindowTotal: number;
  malformedLines: number;
};

export type Assessment = {
  readiness: ChangeReadiness;
  /** Readiness ignoring a merchant recording gap; increases may still be detected when this is ready. */
  baseReadiness: ChangeReadiness;
  weeksUsed: number;
  daysNeeded: number;
  recent: number;
  usedWeeks: number[];
  materiality: Materiality | null;
};

export type DemandChangeValue = {
  measure: 'units' | 'transactions';
  day: string;
  assessment: Assessment;
  lifecycle: Lifecycle;
};

export type BaselineDemandValue = {
  windowUnits: number;
  windowDays: number;
  perDay: number;
  forecastReason: ForecastUnavailableReason | null;
};

export type AdjustedDemandValue = {
  perDay: number;
  basis: 'recent_7_days' | 'forecast_window';
  confirmedDirection: Direction | null;
  forecastReason: ForecastUnavailableReason | null;
};

export type AvailableStockValue = {
  onHand: number;
  reserved: number;
  available: number;
};
export type MinimumStockValue = { minimum: number };
export type StockCoverValue = {
  daysToMinimum: number | null;
  daysToZero: number | null;
  reason: ForecastUnavailableReason | null;
};
export type ProjectedDatesValue = {
  minimumDate: string | null;
  zeroDate: string | null;
  reason: ForecastUnavailableReason | null;
};
export type ReplenishmentValue = {
  suggestedUnits: number | null;
  reason: ForecastUnavailableReason | null;
};
export type StockRiskValue = {
  level: StockRiskLevel;
  forecastReason: ForecastUnavailableReason | null;
};
export type ChangeSummaryValue = {
  activeChanges: number;
  productsNeedingStockReview: number;
  byType: Partial<Record<ChangeCaseType, number>>;
};

export interface NodeValues {
  merchant_recording_activity: MerchantRecordingValue;
  product_transaction_activity: ActivityValue;
  product_unit_activity: ActivityValue;
  transaction_change: DemandChangeValue;
  unit_demand_change: DemandChangeValue;
  baseline_daily_demand: BaselineDemandValue;
  adjusted_daily_demand: AdjustedDemandValue;
  available_stock: AvailableStockValue;
  minimum_stock_policy: MinimumStockValue;
  stock_cover: StockCoverValue;
  projected_stock_dates: ProjectedDatesValue;
  replenishment_guidance: ReplenishmentValue;
  stock_risk: StockRiskValue;
  merchant_change_summary: ChangeSummaryValue;
}

export type NodeKey = keyof NodeValues;

export type SourceField =
  | 'sales'
  | 'on_hand'
  | 'reserved'
  | 'threshold'
  | 'clock'
  | 'timezone'
  | 'cases';

export type DailyBucket = { units: number; saleIds: Set<string> };

/** What a calculator may read. Everything is fixed for the run. */
export type CalcContext = {
  input: EvaluationInput;
  settings: ChangeIntelligenceSettings;
  windows: Windows;
  dailyEvaluation: boolean;
  product: ProductObservation | null;
  /** Merchant-level history start date (earliest product history / sale). */
  merchantHistoryStart: string | null;
  parent<K extends NodeKey>(key: K): NodeValues[K];
  /** Eligible daily buckets by local date, for one product (or all lines when null and `merchant`). */
  daily(scope: 'merchant' | 'product'): Map<string, DailyBucket>;
  malformedLines(): number;
  /** Active cases after this run's case operations (only for `cases` nodes). */
  activeCases(): ActiveCase[];
};

// ------------------------------------------------------------------ output

export type NodeStateRecord = NodeState & {
  instanceKey: string;
  nodeKey: NodeKey;
  productId: string | null;
};

export type ParentRef = {
  instanceKey: string;
  version: number;
  fingerprint: string;
};

export type StateTransition = {
  instanceKey: string;
  nodeKey: NodeKey;
  productId: string | null;
  before: NodeState | null;
  after: NodeState;
  parents: ParentRef[];
  explanation: ChangeValue[];
};

export type CaseFacts = {
  productName: string | null;
  measure?: 'units' | 'transactions';
  direction?: Direction;
  recent?: number;
  usual?: number;
  weeksUsed?: number;
  baselineWeeks?: number[];
  daysToMinimumBefore?: number | null;
  daysToMinimumAfter?: number | null;
  riskLevel?: StockRiskLevel;
  previousRiskLevel?: StockRiskLevel | null;
  available?: number;
  minimum?: number;
  previousMinimum?: number | null;
  suggestedUnits?: number | null;
  forecastReason?: ForecastUnavailableReason | null;
  correction?: {
    measure: 'units' | 'transactions';
    recentBefore: number;
    recentAfter: number;
    usualBefore: number;
    usualAfter: number;
  };
  resolution?: CaseResolution;
  notRecheckedSince?: string | null;
  /** Internal evidence for diagnostics; never rendered on merchant screens. */
  evidence?: {
    z: number | null;
    variance: number | null;
    spikeAdjustedRecent: number | null;
  };
};

export type CaseExplanation = {
  headline: string;
  summary: string;
  consequence: string | null;
  suggestedAction: string | null;
};

type CaseOpBase = {
  productId: string | null;
  type: ChangeCaseType;
  severity: ChangeSeverity;
  facts: CaseFacts;
  explanation: CaseExplanation;
  before: ChangeValue[];
  after: ChangeValue[];
  observation: ChangeLocalPeriod | null;
  /** Instance keys of the state transitions behind this operation. */
  transitionRefs: string[];
  settingsFingerprint: string;
};

export type CaseOperation =
  | (CaseOpBase & { op: 'open'; identifiedDuringInitialAnalysis: boolean })
  | (CaseOpBase & {
      op: 'append';
      caseId: string;
      notRecheckedSince: string | null;
    })
  | (CaseOpBase & {
      op: 'resolve';
      caseId: string;
      resolution: CaseResolution;
    });

export type EvaluationResult = {
  modelVersion: string;
  merchantId: string;
  reason: RunReason;
  asOf: Date;
  timezone: string;
  /** D, the most recent completed local day. */
  localDate: string;
  settings: ChangeIntelligenceSettings;
  settingsFingerprint: string;
  /** Set when this run was the daily evaluation for D; persist as the last daily evaluation date. */
  dailyEvaluationDate: string | null;
  states: NodeStateRecord[];
  transitions: StateTransition[];
  caseOperations: CaseOperation[];
  counts: {
    evaluated: number;
    changed: number;
    skipped: number;
    blocked: number;
  };
  /** Instance keys whose calculators ran, in order. */
  invoked: string[];
};
