const STAGE_LABELS: Record<string, string> = {
  financial_profile_available: "Score available",
  missing_model_inputs: "More information needed",
  consent_required: "Consent needed",
  scoring_unavailable: "Scoring temporarily unavailable",
  integrity_review: "Under review",
  insufficient_evidence: "Not enough activity yet",
  building_history: "Building history",
  evidence_ready: "Records ready",
};

function capitalise(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Merchant-friendly label for a saved assessment stage. */
export function stageLabel(stage: string | null | undefined) {
  if (!stage) return "Status unavailable";
  return STAGE_LABELS[stage] ?? capitalise(stage.replaceAll("_", " "));
}

/** Plain-language names for George's activity-derived model inputs. */
const INPUT_LABELS: Record<string, string> = {
  active_day_ratio: "Days with sales (%)",
  finalized_payments: "Recorded sales",
  avg_txn_value_eur: "Average sale (EUR)",
  cv_txn_value: "Sale size variability",
  verified_sales_eur: "Recorded sales value (EUR)",
  exception_rate: "Payment exception rate (%)",
  critical_unresolved_ratio: "Unresolved critical exceptions (%)",
  retry_success_rate: "Retry success rate (%)",
  capture_quality: "Payment capture quality (%)",
  finality: "Payment completion rate (%)",
  capture_quality_trend: "Capture quality trend",
  revenue_trend_slope_pct: "Sales trend (%)",
  estimated_margin_pct: "Estimated margin (%)",
  // Declared in Additional information; wording matches that form.
  merchant_type: "Merchant category",
  commencement_date: "Business commencement date",
  existing_debt_to_sales: "Existing debt compared with sales (%)",
  loan_amount_eur: "Requested loan amount (EUR)",
  loan_term_months: "Requested loan term (months)",
  inventory_value_eur: "Declared inventory value (EUR)",
  collateral_value_eur: "Declared collateral value (EUR)",
  business_debts_eur: "Business debts (EUR)",
  business_assets_eur: "Business assets (EUR)",
  owner_personal_assets_eur: "Owner personal assets (EUR)",
  owner_personal_debts_eur: "Owner personal debts (EUR)",
  external_bureau_score: "External bureau score",
  external_bureau_report: "Bureau report notes",
};

/** Formats an input value for display; `null` stays explicitly unavailable. */
export function inputValue(key: string, value: number | string | null) {
  if (value === null) return "Not available";
  if (typeof value === "string") return value;
  if (key.endsWith("_eur"))
    return new Intl.NumberFormat("en-IE", {
      style: "currency",
      currency: "EUR",
    }).format(value);
  if (key === "finalized_payments") return String(Math.round(value));
  if (key === "cv_txn_value") return value.toFixed(2);
  return `${value.toFixed(1)}%`;
}

/** Turns an internal field key such as `estimated_margin_pct` into "Estimated margin (%)". */
export function fieldLabel(key: string) {
  if (INPUT_LABELS[key]) return INPUT_LABELS[key];
  const words = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/ pct$/, " (%)");
  return capitalise(words);
}

/** Badge tone for a saved assessment stage. */
export function stageTone(
  stage: string | null | undefined,
): "success" | "warning" | "info" | "neutral" {
  if (stage === "financial_profile_available" || stage === "evidence_ready")
    return "success";
  if (stage === "consent_required" || stage === "integrity_review")
    return "warning";
  if (stage) return "info";
  return "neutral";
}
