import type {
  MerchantReadiness,
  MerchantReadinessMeasurements,
} from '@repo/shared';

const DISCLAIMER =
  'Evidence readiness describes the completeness of your observed payment history. It is not a credit decision or approval.';

export function calculateMerchantReadiness(
  measured: MerchantReadinessMeasurements,
): MerchantReadiness {
  const checks = [
    ['At least 30 observed days', measured.observedDays >= 30],
    ['At least 10 active days', measured.activeDays >= 10],
    ['At least 25 finalized payments', measured.finalizedPayments >= 25],
    ['Capture quality of at least 98%', measured.captureQualityPercent >= 98],
    ['Payment finality of at least 98%', measured.finalityPercent >= 98],
    ['Evidence consent is active', measured.activeConsent],
    ['No unresolved critical exception', !measured.unresolvedCriticalException],
  ] as const;

  let stage: MerchantReadiness['stage'];
  if (measured.unresolvedCriticalException) {
    stage = 'integrity_review';
  } else if (measured.observedDays < 7 || measured.finalizedPayments < 5) {
    stage = 'insufficient_evidence';
  } else if (checks.every(([, passed]) => passed)) {
    stage = 'evidence_ready';
  } else {
    stage = 'building_history';
  }

  return {
    stage,
    measured,
    passedRequirements: checks
      .filter(([, passed]) => passed)
      .map(([label]) => label),
    missingRequirements: checks
      .filter(([, passed]) => !passed)
      .map(([label]) => label),
    disclaimer: DISCLAIMER,
  };
}
