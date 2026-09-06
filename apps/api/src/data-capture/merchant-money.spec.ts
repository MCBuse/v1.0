import {
  decimalRateToScaled,
  euroMinorToUsdcBaseUnits,
  usdcBaseUnitsToEuroMinor,
} from './merchant-money';

describe('merchant money conversion', () => {
  it('rounds settlement upward so a quote never undercharges the EUR request', () => {
    const rate = decimalRateToScaled(0.857321);
    expect(euroMinorToUsdcBaseUnits(1299n, rate)).toBe(15_151_851n);
  });

  it('converts an underlying balance to the nearest EUR cent', () => {
    const rate = decimalRateToScaled(0.85);
    expect(usdcBaseUnitsToEuroMinor(10_000_000n, rate)).toBe(850n);
  });
});
