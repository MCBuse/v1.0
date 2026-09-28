export const CREDIT_MONEY_FIELDS = [
  "existingDebtMinor",
  "loanAmountMinor",
  "inventoryValueMinor",
  "collateralValueMinor",
  "businessDebtsMinor",
  "businessAssetsMinor",
  "ownerPersonalAssetsMinor",
  "ownerPersonalDebtsMinor",
] as const;
export type CreditProfile = Partial<
  Record<(typeof CREDIT_MONEY_FIELDS)[number], string | null>
> & {
  commencementDate?: string | null;
  merchantType?: "cafe_bakery" | "grocer" | "kiosk" | "takeaway" | null;
  loanTermMonths?: number | null;
  externalBureauScore?: number | null;
  externalBureauReport?: string | null;
};
/** Activity-derived model inputs shown before an assessment runs. */
export interface CreditInputPreview {
  asOfDate: string;
  evidenceWindow: { from: string; to: string };
  inputs: Array<{
    key: string;
    value: number | string | null;
    provenance: string;
    missingReason: string | null;
  }>;
  integritySummary: string[];
}
export interface CreditScore {
  score: number;
  grade: string;
  scale: "300-850";
}
export interface CreditPublicResult {
  status: "ready" | "temporarily_unavailable" | "consent_required";
  modelVersion: string;
  artifactSha256?: string;
  businessAgeMonths: number | null;
  unavailableFields: string[];
  financialProfile: {
    score: number;
    scale: string;
    breakdown: Record<string, number>;
  } | null;
  /** 300–850 credit score and grade; absent on runs made before it was shared. */
  creditScore?: CreditScore | null;
  profileConfidence: {
    label: "Low" | "Medium" | "High";
    confidenceScore: number;
    coveragePct: number;
    dataReliabilityQualityPct: number | null;
    fieldsFilled: number;
    fieldsTotal: number;
    /** The model's own label, present only when the evidence checklist lowered it. */
    modelLabel?: "Low" | "Medium" | "High";
    /** The unmet evidence checks that lowered the label. */
    limitedBy?: string[];
  } | null;
  missingReasons: Record<string, string>;
  indicators: Record<string, number | string | null>;
  provenance: Record<string, string>;
  integritySummary: string[];
}
export interface ExperimentalCredit {
  experimental: true;
  disclaimer: string;
  probabilityOfDefault: number;
  statisticalScore: number;
  policyOverlayPoints: number;
  creditScore: number;
  creditGrade: string;
  scale: string;
  overlayBreakdown: Record<string, number>;
}
export interface StaffCreditAssessment {
  id: string;
  merchantId: string | null;
  synthetic: boolean;
  modelVersion: string;
  createdAt: string;
  input: {
    values: Record<string, number | string | null>;
    asOfDate: string;
    provenance: Record<string, string>;
    evidenceWindow?: { from: string; to: string };
  };
  result: CreditPublicResult & {
    experimentalCredit: ExperimentalCredit | null;
  };
}
