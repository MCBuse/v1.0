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

/** Turns an internal field key such as `estimated_margin_pct` into "Estimated margin (%)". */
export function fieldLabel(key: string) {
  const words = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/ pct$/, " (%)");
  return capitalise(words);
}
