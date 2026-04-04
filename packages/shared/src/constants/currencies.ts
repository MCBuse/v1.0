export const CURRENCIES = {
  USDC: 'USDC',
  EURC: 'EURC',
} as const;

export type Currency = (typeof CURRENCIES)[keyof typeof CURRENCIES];

// Decimal places for each currency (for display only — storage is bigint)
export const CURRENCY_DECIMALS: Record<Currency, number> = {
  USDC: 6,
  EURC: 6,
};
