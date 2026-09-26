import type {
  CreditPublicResult,
  MerchantReadiness,
  MerchantReadinessMeasurements,
} from '@repo/shared';
import { calculateMerchantReadiness } from '../merchant-readiness';
import { CREDIT_MODEL_VERSION } from '../../credit-assessment/credit-contract';

/**
 * Saved assessment models share the same evidence window. George's public
 * financial profile is separate from his staff-only experimental risk score.
 */
export interface AssessmentInput {
  measurements: MerchantReadinessMeasurements;
  evidenceFrom: Date;
  evidenceTo: Date;
  credit?: CreditPublicResult;
}

export interface AssessmentResult {
  modelId: string;
  modelVersion: string;
  stage: string;
  /** Public financial profile score for George's model; never a risk score. */
  score: number | null;
  passedRequirements: string[];
  missingRequirements: string[];
  measurements: MerchantReadinessMeasurements;
  reliability: {
    observedDays: number;
    activeDays: number;
    finalizedPayments: number;
    captureQualityPercent: number;
    finalityPercent: number;
  };
  sourceCoverage: {
    digitalPayments: boolean;
    merchantRecordedCash: boolean;
    importedRecords: boolean;
  };
  limitations: string[];
  disclaimer: string;
}

export interface AssessmentModel {
  readonly id: string;
  readonly version: string;
  assess(input: AssessmentInput): AssessmentResult;
}

const FALLBACK_LIMITATIONS = [
  'This is an evidence-readiness assessment, not a credit score and not a lending decision.',
  'It describes only activity MCBuse observed; it cannot see trading recorded elsewhere.',
  'Merchant-recorded cash is self-declared and is not independently verified.',
  'Evidence-readiness rules do not estimate default risk.',
];

/**
 * `readiness-rules-v1` — the agreed demonstration fallback.
 *
 * It reports how complete the observed evidence is and what is still missing.
 * It never produces a score, so evidence readiness cannot be mistaken for
 * George's separate financial profile or experimental risk score.
 */
export class ReadinessRulesV1 implements AssessmentModel {
  readonly id = 'readiness-rules-v1';
  readonly version = '1.0.0';

  assess(input: AssessmentInput): AssessmentResult {
    const readiness: MerchantReadiness = calculateMerchantReadiness(
      input.measurements,
    );

    return {
      modelId: this.id,
      modelVersion: this.version,
      stage: readiness.stage,
      score: null,
      passedRequirements: readiness.passedRequirements,
      missingRequirements: readiness.missingRequirements,
      measurements: readiness.measured,
      reliability: {
        observedDays: input.measurements.observedDays,
        activeDays: input.measurements.activeDays,
        finalizedPayments: input.measurements.finalizedPayments,
        captureQualityPercent: input.measurements.captureQualityPercent,
        finalityPercent: input.measurements.finalityPercent,
      },
      sourceCoverage: {
        digitalPayments: input.measurements.finalizedPayments > 0,
        merchantRecordedCash: false,
        importedRecords: false,
      },
      limitations: [...FALLBACK_LIMITATIONS],
      disclaimer: readiness.disclaimer,
    };
  }
}

/** George's public 0-100 financial profile, with readiness as supporting evidence. */
export class GeorgeFinancialProfileV1 implements AssessmentModel {
  readonly id = 'george-financial-profile-v1';
  readonly version = CREDIT_MODEL_VERSION;

  assess(input: AssessmentInput): AssessmentResult {
    const readiness = new ReadinessRulesV1().assess(input);
    const credit = input.credit;
    const missing = credit?.unavailableFields ?? [];
    const proposedScore = credit?.financialProfile?.score;
    const score =
      credit?.status === 'ready' &&
      missing.length === 0 &&
      typeof proposedScore === 'number' &&
      Number.isFinite(proposedScore) &&
      proposedScore >= 0 &&
      proposedScore <= 100
        ? proposedScore
        : null;
    return {
      ...readiness,
      modelId: this.id,
      modelVersion: credit?.modelVersion ?? this.version,
      stage:
        score !== null
          ? 'financial_profile_available'
          : credit?.status === 'consent_required'
            ? 'consent_required'
            : credit?.status === 'temporarily_unavailable'
              ? 'scoring_unavailable'
              : 'missing_model_inputs',
      score,
      missingRequirements: [
        ...readiness.missingRequirements,
        ...missing.map(
          (field) => missingFieldLabel(field),
        ),
      ],
      limitations: [
        'The financial profile score is a 0-100 measure of your business profile. It is not a credit risk score or a lending decision.',
        ...readiness.limitations,
      ],
      disclaimer:
        'The financial profile uses your available business records. Missing information is never estimated, and this is not a lending decision.',
    };
  }
}

/** `estimated_margin_pct` -> "Estimated margin (%)" for merchant-facing lists. */
function missingFieldLabel(field: string): string {
  const words = field.replaceAll('_', ' ').replace(/ pct$/, ' (%)');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const MODELS = new Map<string, AssessmentModel>();
const fallback = new ReadinessRulesV1();
MODELS.set(fallback.id, fallback);
const george = new GeorgeFinancialProfileV1();
MODELS.set(george.id, george);

/** Registers an additional model. */
export function registerAssessmentModel(model: AssessmentModel): void {
  MODELS.set(model.id, model);
}

export function assessmentModel(id?: string): AssessmentModel {
  if (!id) return fallback;
  const model = MODELS.get(id);
  if (!model) {
    throw new Error(
      `No assessment model is registered under "${id}". ` +
        `Available: ${[...MODELS.keys()].join(', ')}`,
    );
  }
  return model;
}

export function availableAssessmentModels(): Array<{
  id: string;
  version: string;
}> {
  return [...MODELS.values()].map((model) => ({
    id: model.id,
    version: model.version,
  }));
}
