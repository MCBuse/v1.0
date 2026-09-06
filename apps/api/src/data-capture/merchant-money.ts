import { BadRequestException } from '@nestjs/common';

const RATE_SCALE = 1_000_000n;
const SETTLEMENT_SCALE = 1_000_000n;
const DISPLAY_SCALE = 100n;

export function decimalRateToScaled(rate: number): bigint {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new BadRequestException('A valid EUR quote is not available');
  }
  return BigInt(Math.round(rate * Number(RATE_SCALE)));
}

export function euroMinorToUsdcBaseUnits(
  euroMinor: bigint,
  rateScaled: bigint,
): bigint {
  if (euroMinor <= 0n) throw new BadRequestException('Amount must be positive');
  if (rateScaled <= 0n)
    throw new BadRequestException('Quote rate must be positive');

  const numerator = euroMinor * SETTLEMENT_SCALE * RATE_SCALE;
  const denominator = DISPLAY_SCALE * rateScaled;
  return (numerator + denominator - 1n) / denominator;
}

export function usdcBaseUnitsToEuroMinor(
  usdcBaseUnits: bigint,
  rateScaled: bigint,
): bigint {
  if (usdcBaseUnits < 0n)
    throw new BadRequestException('Balance cannot be negative');
  if (rateScaled <= 0n)
    throw new BadRequestException('Quote rate must be positive');
  const numerator = usdcBaseUnits * rateScaled * DISPLAY_SCALE;
  const denominator = SETTLEMENT_SCALE * RATE_SCALE;
  return (numerator + denominator / 2n) / denominator;
}
