import type {
  MerchantReadiness,
  MerchantReadinessMeasurements,
} from '@repo/shared';
import { calculateMerchantReadiness } from '../merchant-readiness';

/**
 * The boundary George's scoring model will plug into.
 *
 * Today there is exactly one implementation: the agreed evidence-readiness
 * fallback. It deliberately produces no score and no decision, because it is
 * not a credit model and must never be presented as one. When the real model
 * arrives it implements this interface, registers under its own id, and its
 * results are stored alongside rather than replacing what came before.
 */
export interface AssessmentInput {
  measurements: MerchantReadinessMeasurements;
  evidenceFrom: Date;
  evidenceTo: Date;
}

export interface AssessmentResult {
  modelId: string;
  modelVersion: string;
  stage: string;
  /** Deliberately absent for the fallback; a real model may populate it. */
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
 * It never produces a score, precisely so that nobody can mistake it for the
 * credit model that has not been delivered yet.
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

const MODELS = new Map<string, AssessmentModel>();
const fallback = new ReadinessRulesV1();
MODELS.set(fallback.id, fallback);

/** Registers an additional model, such as George's when it lands. */
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
