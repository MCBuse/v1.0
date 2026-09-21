import type { MerchantReadinessMeasurements } from '@repo/shared';
import {
  ReadinessRulesV1,
  assessmentModel,
  availableAssessmentModels,
  registerAssessmentModel,
  type AssessmentModel,
} from './assessment-model';

function measurements(
  overrides: Partial<MerchantReadinessMeasurements> = {},
): MerchantReadinessMeasurements {
  return {
    observedDays: 45,
    activeDays: 20,
    finalizedPayments: 60,
    captureQualityPercent: 99,
    finalityPercent: 100,
    activeConsent: true,
    unresolvedCriticalException: false,
    ...overrides,
  };
}

const input = (overrides: Partial<MerchantReadinessMeasurements> = {}) => ({
  measurements: measurements(overrides),
  evidenceFrom: new Date('2026-08-01T00:00:00Z'),
  evidenceTo: new Date('2026-09-15T00:00:00Z'),
});

describe('readiness-rules-v1', () => {
  const model = new ReadinessRulesV1();

  it('identifies itself with a stable id and version', () => {
    expect(model.id).toBe('readiness-rules-v1');
    expect(model.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('never produces a score', () => {
    // A score would be mistaken for a credit decision the fallback cannot make.
    expect(model.assess(input()).score).toBeNull();
    expect(model.assess(input({ observedDays: 1 })).score).toBeNull();
  });

  it('reports evidence_ready when every requirement passes', () => {
    expect(model.assess(input()).stage).toBe('evidence_ready');
  });

  it('reports what is still missing rather than only a verdict', () => {
    const result = model.assess(input({ finalizedPayments: 8 }));
    expect(result.stage).toBe('building_history');
    expect(result.missingRequirements.length).toBeGreaterThan(0);
    expect(result.passedRequirements.length).toBeGreaterThan(0);
  });

  it('flags insufficient evidence on a thin history', () => {
    expect(
      model.assess(input({ observedDays: 3, finalizedPayments: 2 })).stage,
    ).toBe('insufficient_evidence');
  });

  it('flags an integrity review ahead of everything else', () => {
    const result = model.assess(input({ unresolvedCriticalException: true }));
    expect(result.stage).toBe('integrity_review');
  });

  it('carries the reliability figures the result rests on', () => {
    const result = model.assess(input());
    expect(result.reliability).toEqual({
      observedDays: 45,
      activeDays: 20,
      finalizedPayments: 60,
      captureQualityPercent: 99,
      finalityPercent: 100,
    });
  });

  it('states its limitations, including that it is not the credit model', () => {
    const result = model.assess(input());
    expect(result.limitations.join(' ')).toMatch(/not a credit score/i);
    expect(result.limitations.join(' ')).toMatch(/do not estimate default risk/i);
    expect(result.disclaimer).toMatch(/not a credit decision/i);
  });

  it('is deterministic for the same measurements', () => {
    expect(JSON.stringify(model.assess(input()))).toBe(
      JSON.stringify(model.assess(input())),
    );
  });
});

describe('assessment model registry', () => {
  it('defaults to the readiness fallback', () => {
    expect(assessmentModel().id).toBe('readiness-rules-v1');
  });

  it('resolves a model by id', () => {
    expect(assessmentModel('readiness-rules-v1').id).toBe('readiness-rules-v1');
  });

  it('refuses an unknown model rather than silently falling back', () => {
    // Quietly substituting the fallback would misattribute the result.
    expect(() => assessmentModel('georges-model-v1')).toThrow(
      /no assessment model is registered/i,
    );
  });

  it('accepts a future model registered alongside the fallback', () => {
    const future: AssessmentModel = {
      id: 'test-future-model',
      version: '0.1.0',
      assess: () => ({
        modelId: 'test-future-model',
        modelVersion: '0.1.0',
        stage: 'scored',
        score: 720,
        passedRequirements: [],
        missingRequirements: [],
        measurements: measurements(),
        reliability: {
          observedDays: 45,
          activeDays: 20,
          finalizedPayments: 60,
          captureQualityPercent: 99,
          finalityPercent: 100,
        },
        sourceCoverage: {
          digitalPayments: true,
          merchantRecordedCash: false,
          importedRecords: false,
        },
        limitations: [],
        disclaimer: 'test',
      }),
    };

    registerAssessmentModel(future);

    expect(assessmentModel('test-future-model').assess(input()).score).toBe(
      720,
    );
    // The fallback is still there and still the default.
    expect(assessmentModel().id).toBe('readiness-rules-v1');
    expect(availableAssessmentModels().map((m) => m.id)).toEqual(
      expect.arrayContaining(['readiness-rules-v1', 'test-future-model']),
    );
  });
});
