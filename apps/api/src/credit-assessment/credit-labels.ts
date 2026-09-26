/**
 * Runtime copy of `packages/shared/src/credit-labels.ts` for the API.
 *
 * `@repo/shared` ships TypeScript source with no build step, so the compiled
 * API may only import *types* from it; a value import makes Node load the raw
 * .ts at runtime and crash. `credit-labels.spec.ts` fails if this copy and
 * the shared one (used by the portal) ever differ.
 */
export const CREDIT_STAGE_LABELS: Record<string, string> = {
  financial_profile_available: 'Score available',
  missing_model_inputs: 'More information needed',
  consent_required: 'Consent needed',
  scoring_unavailable: 'Scoring temporarily unavailable',
  integrity_review: 'Under review',
  insufficient_evidence: 'Not enough activity yet',
  building_history: 'Building history',
  evidence_ready: 'Records ready',
};

/** Every model input, activity-derived and merchant-declared. */
export const CREDIT_INPUT_LABELS: Record<string, string> = {
  active_day_ratio: 'Days with sales (%)',
  finalized_payments: 'Recorded sales',
  avg_txn_value_eur: 'Average sale (EUR)',
  cv_txn_value: 'Sale size variability',
  verified_sales_eur: 'Recorded sales value (EUR)',
  exception_rate: 'Payment exception rate (%)',
  critical_unresolved_ratio: 'Unresolved critical exceptions (%)',
  retry_success_rate: 'Retry success rate (%)',
  capture_quality: 'Payment capture quality (%)',
  finality: 'Payment completion rate (%)',
  capture_quality_trend: 'Capture quality trend',
  revenue_trend_slope_pct: 'Sales trend (%)',
  estimated_margin_pct: 'Estimated margin (%)',
  merchant_type: 'Merchant category',
  commencement_date: 'Business start date',
  existing_debt_to_sales: 'Existing debt to sales (%)',
  loan_amount_eur: 'Requested loan amount (EUR)',
  loan_term_months: 'Requested loan term (months)',
  inventory_value_eur: 'Declared inventory value (EUR)',
  collateral_value_eur: 'Declared collateral value (EUR)',
  business_debts_eur: 'Business debts (EUR)',
  business_assets_eur: 'Business assets (EUR)',
  owner_personal_assets_eur: 'Owner personal assets (EUR)',
  owner_personal_debts_eur: 'Owner personal debts (EUR)',
  external_bureau_score: 'External bureau score',
  external_bureau_report: 'External bureau notes',
};

export const MERCHANT_CATEGORY_LABELS: Record<string, string> = {
  cafe_bakery: 'Cafe or bakery',
  grocer: 'Grocer',
  kiosk: 'Kiosk',
  takeaway: 'Takeaway',
};

/** Why an input is missing decides what, if anything, the merchant can do. */
export type MissingInputKind = 'declare' | 'sales' | 'system';
export function missingInputKind(
  reason: string | null | undefined,
): MissingInputKind {
  if (!reason) return 'system';
  if (/not provided in the business credit profile/i.test(reason))
    return 'declare';
  // "Not enough recorded sales…" since cash counts (2026-09-26); older saved
  // assessments carry the "verified records" wording.
  if (
    /not enough recorded sales|insufficient compatible verified records/i.test(
      reason,
    )
  )
    return 'sales';
  return 'system';
}
