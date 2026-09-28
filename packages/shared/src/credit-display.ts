import type { CreditPublicResult } from "./credit-assessment";

type ConfidenceLabel = "Low" | "Medium" | "High";
const CONFIDENCE_ORDER: ConfidenceLabel[] = ["Low", "Medium", "High"];

/** The readiness check that, when unmet, always means low data confidence. */
export const CRITICAL_EVIDENCE_CHECK = "No unresolved critical exception";

/**
 * Data confidence can never be higher than the evidence checklist supports.
 *
 * The scoring model rates confidence from how many inputs are filled and how
 * reliable they look on a sliding scale, while the checklist uses hard
 * thresholds (for example capture quality of at least 98%). Without this
 * ceiling a merchant could fail three checks and still read "High".
 *
 * All checks met → up to High · one or two unmet → up to Medium ·
 * three or more unmet, or an unresolved critical issue → Low.
 */
export function confidenceCeiling(
  missingRequirements: string[],
): ConfidenceLabel {
  if (missingRequirements.includes(CRITICAL_EVIDENCE_CHECK)) return "Low";
  if (missingRequirements.length >= 3) return "Low";
  if (missingRequirements.length >= 1) return "Medium";
  return "High";
}

export function alignConfidenceWithEvidence(
  credit: CreditPublicResult,
  missingRequirements: string[],
): CreditPublicResult {
  const confidence = credit.profileConfidence;
  if (!confidence) return credit;
  const ceiling = confidenceCeiling(missingRequirements);
  const label =
    CONFIDENCE_ORDER[
      Math.min(
        CONFIDENCE_ORDER.indexOf(confidence.label),
        CONFIDENCE_ORDER.indexOf(ceiling),
      )
    ] ?? confidence.label;
  if (label === confidence.label) return credit;
  return {
    ...credit,
    profileConfidence: {
      ...confidence,
      label,
      modelLabel: confidence.modelLabel ?? confidence.label,
      limitedBy: [...missingRequirements],
    },
  };
}

export type FinancialProfileBand = {
  label: "Strong" | "Good" | "Fair" | "Weak";
  /** Lower bound of the band on the 0–100 scale. */
  from: number;
};

export const FINANCIAL_PROFILE_BANDS: FinancialProfileBand[] = [
  { label: "Strong", from: 80 },
  { label: "Good", from: 60 },
  { label: "Fair", from: 40 },
  { label: "Weak", from: 0 },
];

/** Plain-language band for the 0–100 financial profile score. */
export function financialProfileBand(score: number): FinancialProfileBand {
  return (
    FINANCIAL_PROFILE_BANDS.find((band) => score >= band.from) ??
    FINANCIAL_PROFILE_BANDS[FINANCIAL_PROFILE_BANDS.length - 1]!
  );
}

/** The parts of a credit result the colour rules read (the PDF has its own narrower type). */
type ScoredCredit = {
  creditScore?: { grade: string } | null;
  profileConfidence?: { label: string } | null;
};

export type ScoreTone = "positive" | "neutral" | "caution";
const TONE_ORDER: ScoreTone[] = ["caution", "neutral", "positive"];

/** Colour for a 300–850 grade: only Good or Excellent reads as positive. */
export function creditGradeTone(grade: string): ScoreTone {
  if (grade === "Excellent" || grade === "Good") return "positive";
  if (grade === "Acceptable") return "neutral";
  return "caution";
}

/** Colour for the 0–100 financial profile: Strong/Good positive, Fair neutral, Weak caution. */
export function financialProfileTone(score: number): ScoreTone {
  const { label } = financialProfileBand(score);
  if (label === "Strong" || label === "Good") return "positive";
  if (label === "Fair") return "neutral";
  return "caution";
}

/**
 * A credit score is provisional while data confidence is Low. The model
 * scores the inputs alone; data confidence also carries the payment history
 * checklist, so a Good score can rest on thin evidence. We keep the score but
 * say so, and never frame it as a success.
 */
export function isProvisionalCreditScore(
  credit: ScoredCredit | null | undefined,
): boolean {
  return Boolean(credit?.creditScore) && credit?.profileConfidence?.label === "Low";
}

/** Result panel colour for a credit score: the grade's tone, capped at neutral while provisional. */
export function creditResultTone(
  credit: ScoredCredit | null | undefined,
): ScoreTone {
  if (!credit?.creditScore) return "neutral";
  const tone = creditGradeTone(credit.creditScore.grade);
  if (!isProvisionalCreditScore(credit)) return tone;
  return TONE_ORDER[Math.min(TONE_ORDER.indexOf(tone), TONE_ORDER.indexOf("neutral"))]!;
}
