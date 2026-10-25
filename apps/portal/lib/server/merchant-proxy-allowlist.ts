/** Merchant API paths (relative to `/merchants/`) the portal proxy forwards. Anything else is 404. */
const allowed = [
  /^me\/credit-profile$/,
  /^me\/credit-inputs$/,
  /^me$/,
  /^me\/summary$/,
  /^me\/transactions$/,
  /^me\/payment-requests$/,
  /^me\/payment-requests\/[0-9a-f-]{36}$/i,
  /^me\/payment-requests\/[0-9a-f-]{36}\/present$/i,
  /^me\/presented-request$/,
  /^me\/events$/,
  /^me\/events\/stream$/,
  /^me\/products(?:\/[0-9a-f-]{36}(?:\/(?:image|stock-adjustments))?)?$/i,
  /^me\/invoices(?:\/[0-9a-f-]{36}(?:\/cancel)?)?$/i,
  /^me\/consents$/,
  /^me\/evidence-readiness$/,
  /^me\/credit-assessment$/,
  /^me\/activity$/,
  /^me\/analytics$/,
  /^me\/cash-sales(?:\/[0-9a-f-]{36}\/(?:void|attachment))?$/i,
  /^me\/imports\/preview$/,
  /^me\/imports\/(?:inventory|settlement)\/preview$/,
  /^me\/imports$/,
  /^me\/imports\/[0-9a-f-]{36}\/mapping$/i,
  /^me\/imports\/[0-9a-f-]{36}\/commit$/i,
  /^me\/reconciliation$/,
  /^me\/finance-packages$/,
  /^me\/finance-packages\/email-attempts$/,
  /^me\/finance-packages\/[0-9a-f-]{36}(?:\/(?:pdf|data|email|preview|assessment))?$/i,
  /^me\/assessments(?:\/[0-9a-f-]{36})?$/i,
  /^me\/insights$/,
  /^me\/analytics\/general$/,
  // Changes (plan §7): static routes, then UUID-only parameters.
  /^me\/changes$/,
  /^me\/changes\/status$/,
  /^me\/changes\/runs\/[0-9a-f-]{36}$/i,
  /^me\/changes\/[0-9a-f-]{36}$/i,
];

export function isAllowedMerchantPath(relative: string): boolean {
  return allowed.some((pattern) => pattern.test(relative));
}
