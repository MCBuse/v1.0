import { calculateMerchantReadiness } from './merchant-readiness';

const ready = {
  observedDays: 30,
  activeDays: 10,
  finalizedPayments: 25,
  captureQualityPercent: 98,
  finalityPercent: 98,
  activeConsent: true,
  unresolvedCriticalException: false,
};

describe('merchant readiness', () => {
  it('puts critical unresolved exceptions into integrity review', () => {
    expect(
      calculateMerchantReadiness({
        ...ready,
        unresolvedCriticalException: true,
      }).stage,
    ).toBe('integrity_review');
  });

  it('requires seven days and five finalized payments for sufficient evidence', () => {
    expect(
      calculateMerchantReadiness({ ...ready, observedDays: 6 }).stage,
    ).toBe('insufficient_evidence');
    expect(
      calculateMerchantReadiness({ ...ready, finalizedPayments: 4 }).stage,
    ).toBe('insufficient_evidence');
  });

  it('marks only the complete documented threshold as evidence ready', () => {
    expect(calculateMerchantReadiness(ready).stage).toBe('evidence_ready');
    expect(calculateMerchantReadiness({ ...ready, activeDays: 9 }).stage).toBe(
      'building_history',
    );
  });
});
