import { BadRequestException } from '@nestjs/common';

/** USDC carries six decimals; USD display amounts carry two. */
const USDC_BASE_UNITS_PER_USD_CENT = 10_000n;

/**
 * The sandbox convention is one USD per test USDC. It is deliberately not a
 * configurable exchange rate: a devnet token has no market price, and quietly
 * applying some other number would misrepresent what the demonstration proves.
 */
export function sandboxUsdPerTestUsdc(configured: string | undefined): number {
  if (configured === undefined || configured === '') return 1;
  const parsed = Number(configured);
  if (parsed !== 1) {
    throw new Error(
      `STRIPE_OFFRAMP_USD_PER_USDC must be 1 for the sandbox convention; received "${configured}"`,
    );
  }
  return 1;
}

/** Exact, by construction — one cent is always ten thousand base units. */
export function usdCentsToUsdcBaseUnits(cents: bigint): bigint {
  if (cents <= 0n) throw new BadRequestException('Amount must be positive');
  return cents * USDC_BASE_UNITS_PER_USD_CENT;
}

/**
 * Rounds down by default. A withdrawal pays out only what the returned tokens
 * cover, so sub-cent dust must never become money the provider has to find.
 */
export function usdcBaseUnitsToUsdCents(
  baseUnits: bigint,
  rounding: 'down' | 'nearest' = 'down',
): bigint {
  if (baseUnits < 0n)
    throw new BadRequestException('Balance cannot be negative');
  if (rounding === 'nearest') {
    return (
      (baseUnits + USDC_BASE_UNITS_PER_USD_CENT / 2n) /
      USDC_BASE_UNITS_PER_USD_CENT
    );
  }
  return baseUnits / USDC_BASE_UNITS_PER_USD_CENT;
}

/** Guards flows that must not silently strand sub-cent dust. */
export function assertWholeUsdCents(baseUnits: bigint): void {
  if (baseUnits % USDC_BASE_UNITS_PER_USD_CENT !== 0n) {
    throw new BadRequestException(
      'Amount must be a whole number of US cents at the sandbox conversion',
    );
  }
}
