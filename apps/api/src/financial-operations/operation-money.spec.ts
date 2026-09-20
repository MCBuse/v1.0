import { BadRequestException } from '@nestjs/common';
import {
  assertWholeUsdCents,
  sandboxUsdPerTestUsdc,
  usdCentsToUsdcBaseUnits,
  usdcBaseUnitsToUsdCents,
} from './operation-money';

describe('operation money conversion', () => {
  describe('usdCentsToUsdcBaseUnits', () => {
    it('converts cents to base units at the one-for-one sandbox convention', () => {
      expect(usdCentsToUsdcBaseUnits(2500n)).toBe(25_000_000n);
    });

    it('is exact for a single cent', () => {
      expect(usdCentsToUsdcBaseUnits(1n)).toBe(10_000n);
    });

    it('rejects a non-positive amount', () => {
      expect(() => usdCentsToUsdcBaseUnits(0n)).toThrow(BadRequestException);
      expect(() => usdCentsToUsdcBaseUnits(-1n)).toThrow(BadRequestException);
    });
  });

  describe('usdcBaseUnitsToUsdCents', () => {
    it('converts whole cents exactly', () => {
      expect(usdcBaseUnitsToUsdCents(25_000_000n)).toBe(2500n);
    });

    it('rounds down by default so a payout never exceeds the tokens returned', () => {
      expect(usdcBaseUnitsToUsdCents(1_234_567n)).toBe(123n);
    });

    it('rounds to nearest only when asked explicitly', () => {
      expect(usdcBaseUnitsToUsdCents(1_235_000n, 'nearest')).toBe(124n);
      expect(usdcBaseUnitsToUsdCents(1_234_999n, 'nearest')).toBe(123n);
    });

    it('accepts zero', () => {
      expect(usdcBaseUnitsToUsdCents(0n)).toBe(0n);
    });

    it('rejects a negative balance', () => {
      expect(() => usdcBaseUnitsToUsdCents(-1n)).toThrow(BadRequestException);
    });
  });

  describe('assertWholeUsdCents', () => {
    it('accepts an amount that is a whole number of cents', () => {
      expect(() => assertWholeUsdCents(25_000_000n)).not.toThrow();
    });

    it('rejects an amount carrying sub-cent dust', () => {
      expect(() => assertWholeUsdCents(25_000_001n)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('sandboxUsdPerTestUsdc', () => {
    it('defaults to one USD per test USDC', () => {
      expect(sandboxUsdPerTestUsdc(undefined)).toBe(1);
      expect(sandboxUsdPerTestUsdc('1')).toBe(1);
    });

    it('refuses any other configured rate rather than silently converting', () => {
      expect(() => sandboxUsdPerTestUsdc('0.98')).toThrow(
        'STRIPE_OFFRAMP_USD_PER_USDC must be 1',
      );
    });
  });

  it('round-trips a funding amount without drift', () => {
    const cents = 12_345n;
    expect(usdcBaseUnitsToUsdCents(usdCentsToUsdcBaseUnits(cents))).toBe(cents);
  });
});
