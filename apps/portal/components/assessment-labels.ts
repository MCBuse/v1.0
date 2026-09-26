import { CREDIT_INPUT_LABELS, CREDIT_STAGE_LABELS } from "@repo/shared";

const STAGE_LABELS = CREDIT_STAGE_LABELS;

function capitalise(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Merchant-friendly label for a saved assessment stage. */
export function stageLabel(stage: string | null | undefined) {
  if (!stage) return "Status unavailable";
  return STAGE_LABELS[stage] ?? capitalise(stage.replaceAll("_", " "));
}

/** Plain-language names for George's activity-derived model inputs. */
const INPUT_LABELS = CREDIT_INPUT_LABELS;

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
