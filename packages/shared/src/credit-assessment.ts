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
  profileConfidence: {
    label: "Low" | "Medium" | "High";
    confidenceScore: number;
    coveragePct: number;
    dataReliabilityQualityPct: number | null;
    fieldsFilled: number;
    fieldsTotal: number;
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
