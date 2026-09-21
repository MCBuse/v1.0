import type { CreditProfile } from '@repo/shared';
// Runtime constants stay in the API build: @repo/shared is a source-only type
// package and is not shipped in the API production image.
export const CREDIT_MODEL_VERSION = 'george-html-2026.09.1';
export const CREDIT_MONEY_FIELDS = [
  'existingDebtMinor',
  'loanAmountMinor',
  'inventoryValueMinor',
  'collateralValueMinor',
  'businessDebtsMinor',
  'businessAssetsMinor',
  'ownerPersonalAssetsMinor',
  'ownerPersonalDebtsMinor',
] as const satisfies readonly (keyof CreditProfile)[];
