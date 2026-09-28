import type { CreditPublicResult } from '@repo/shared';
import * as shared from '@repo/shared';
import * as local from './credit-display';

function credit(label: 'Low' | 'Medium' | 'High'): CreditPublicResult {
  return {
    status: 'ready',
    modelVersion: 'test',
    businessAgeMonths: 40,
    unavailableFields: [],
    financialProfile: { score: 58.1, scale: '0-100', breakdown: {} },
    profileConfidence: {
      label,
      confidenceScore: 80,
      coveragePct: 90,
      dataReliabilityQualityPct: 70,
      fieldsFilled: 18,
      fieldsTotal: 20,
    },
    missingReasons: {},
    indicators: {},
    provenance: {},
    integritySummary: [],
  };
}

const PAYMENTS = 'At least 25 finalized payments';
const CAPTURE = 'Capture quality of at least 98%';
const FINALITY = 'Payment finality of at least 98%';

describe('credit display rules', () => {
  it('keep High when every evidence check is met', () => {
    const result = local.alignConfidenceWithEvidence(credit('High'), []);
    expect(result.profileConfidence?.label).toBe('High');
    expect(result.profileConfidence?.modelLabel).toBeUndefined();
  });

  it('cap confidence at Medium when one or two checks are unmet', () => {
    const result = local.alignConfidenceWithEvidence(credit('High'), [CAPTURE]);
    expect(result.profileConfidence).toMatchObject({
      label: 'Medium',
      modelLabel: 'High',
      limitedBy: [CAPTURE],
    });
  });

  it('cap confidence at Low when three checks are unmet or a critical issue is open', () => {
    expect(
      local.alignConfidenceWithEvidence(credit('High'), [
        PAYMENTS,
        CAPTURE,
        FINALITY,
      ]).profileConfidence?.label,
    ).toBe('Low');
    expect(
      local.alignConfidenceWithEvidence(credit('Medium'), [
        local.CRITICAL_EVIDENCE_CHECK,
      ]).profileConfidence?.label,
    ).toBe('Low');
  });

  it('never raises a label the model set lower', () => {
    const result = local.alignConfidenceWithEvidence(credit('Low'), []);
    expect(result.profileConfidence?.label).toBe('Low');
    expect(result).toEqual(credit('Low'));
  });

  it('band the 0–100 profile score', () => {
    expect(local.financialProfileBand(58.1).label).toBe('Fair');
    expect(local.financialProfileBand(60).label).toBe('Good');
    expect(local.financialProfileBand(85).label).toBe('Strong');
    expect(local.financialProfileBand(12).label).toBe('Weak');
  });

  it('mark a credit score provisional while data confidence is Low', () => {
    const scored = (label: 'Low' | 'Medium' | 'High', grade = 'Good') => ({
      ...credit(label),
      creditScore: { score: 715, grade, scale: '300-850' as const },
    });
    expect(local.isProvisionalCreditScore(scored('Low'))).toBe(true);
    expect(local.isProvisionalCreditScore(scored('Medium'))).toBe(false);
    expect(local.isProvisionalCreditScore(credit('Low'))).toBe(false);
    expect(local.creditResultTone(scored('High'))).toBe('positive');
    expect(local.creditResultTone(scored('Low'))).toBe('neutral');
    expect(local.creditResultTone(scored('Low', 'Sufficient'))).toBe('caution');
    expect(local.creditResultTone(scored('High', 'Acceptable'))).toBe('neutral');
    for (const label of ['Low', 'Medium', 'High'] as const)
      for (const grade of ['Sufficient', 'Acceptable', 'Good', 'Excellent'])
        expect(local.creditResultTone(scored(label, grade))).toBe(
          shared.creditResultTone(scored(label, grade)),
        );
  });

  it('colour the financial profile by band', () => {
    expect(local.financialProfileTone(58.1)).toBe('neutral');
    expect(local.financialProfileTone(60)).toBe('positive');
    expect(local.financialProfileTone(20)).toBe('caution');
  });

  it('match the shared rules the portal uses', () => {
    expect(local.FINANCIAL_PROFILE_BANDS).toEqual(
      shared.FINANCIAL_PROFILE_BANDS,
    );
    expect(local.CRITICAL_EVIDENCE_CHECK).toBe(shared.CRITICAL_EVIDENCE_CHECK);
    for (const missing of [
      [],
      [CAPTURE],
      [PAYMENTS, CAPTURE],
      [PAYMENTS, CAPTURE, FINALITY],
      [local.CRITICAL_EVIDENCE_CHECK],
    ])
      for (const label of ['Low', 'Medium', 'High'] as const)
        expect(
          local.alignConfidenceWithEvidence(credit(label), missing),
        ).toEqual(shared.alignConfidenceWithEvidence(credit(label), missing));
  });
});
