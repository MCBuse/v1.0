import { validateCreditProfile, euroMajor } from './credit-profile';
import { trend } from './credit-evidence.service';
import {
  publicScoringResult,
  ScoringClient,
  type ScoringResponse,
} from './scoring-client';
import { ConfigService } from '@nestjs/config';
describe('Credit evidence boundaries', () => {
  it('preserves cents and rejects unsafe or fabricated profile inputs', () => {
    expect(euroMajor('10')).toBe(0.1);
    expect(euroMajor('475')).toBe(4.75);
    expect(euroMajor('9007199254740992')).toBeNull();
    expect(() => validateCreditProfile({ loanAmountMinor: '1.23' })).toThrow();
    expect(() => validateCreditProfile({ estimatedMarginPct: 30 })).toThrow();
    expect(() =>
      validateCreditProfile({ commencementDate: '2026-02-30' }, '2026-09-20'),
    ).toThrow();
    expect(() =>
      validateCreditProfile({ commencementDate: '2027-01-01' }, '2026-09-20'),
    ).toThrow();
  });
  it('calculates revenue direction and leaves insufficient data unavailable', () => {
    expect(trend([50, 55, 60, 65, 70])).toBeCloseTo(8.333333);
    expect(trend([0, 0])).toBeNull();
    expect(trend([10])).toBeNull();
    expect(trend([10, 10, 10])).toBe(0);
  });
  it('excludes private fields at the public projection boundary', () => {
    const raw = {
      modelVersion: 'v',
      businessAgeMonths: 3,
      unavailableFields: [],
      financialProfile: null,
      profileConfidence: {
        label: 'Low',
        confidenceScore: 2,
        coveragePct: 3,
        dataReliabilityQualityPct: null,
        fieldsFilled: 1,
        fieldsTotal: 26,
        probabilityOfDefault: 0.9,
      },
      experimentalCredit: { probabilityOfDefault: 0.9 },
    };
    expect(
      JSON.stringify(publicScoringResult(raw as unknown as ScoringResponse)),
    ).not.toMatch(/experimentalCredit|probabilityOfDefault/);
  });
  it('shares only the credit score and grade, never default risk', () => {
    const raw = {
      modelVersion: 'v',
      businessAgeMonths: 3,
      unavailableFields: [],
      financialProfile: null,
      profileConfidence: null,
      experimentalCredit: {
        experimental: true,
        disclaimer: 'Experimental: synthetic training data',
        probabilityOfDefault: 0.031,
        statisticalScore: 690,
        policyOverlayPoints: 22,
        overlayBreakdown: { capture_quality: 10 },
        creditScore: 711.6,
        creditGrade: 'Good',
        scale: '300-850',
      },
    };
    const projected = publicScoringResult(raw as unknown as ScoringResponse);
    expect(projected.creditScore).toEqual({
      score: 712,
      grade: 'Good',
      scale: '300-850',
    });
    expect(JSON.stringify(projected)).not.toMatch(
      /probabilityOfDefault|statisticalScore|overlay|[Ee]xperimental/,
    );
    // A saved projection keeps its score when it is projected again.
    expect(
      publicScoringResult(projected as unknown as ScoringResponse).creditScore,
    ).toEqual(projected.creditScore);
  });
  it('includes the credit score for merchants unless switched off', () => {
    expect(
      new ScoringClient(new ConfigService({})).creditScoreForMerchants(),
    ).toBe(true);
    expect(
      new ScoringClient(
        new ConfigService({ CREDIT_SCORE_FOR_MERCHANTS: 'false' }),
      ).creditScoreForMerchants(),
    ).toBe(false);
  });
  it('returns unavailability without substituting a model when unconfigured', async () => {
    expect(
      await new ScoringClient(new ConfigService({})).evaluate({}, '2026-09-20'),
    ).toBeNull();
  });
});
