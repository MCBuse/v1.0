import {
  INITIAL_LIFECYCLE,
  advanceLifecycle,
  assessMateriality,
  baselineWeeksUsed,
  classifyRisk,
  forecastStock,
  type Lifecycle,
  type LifecycleEvaluation,
} from './rules';
import { DEFAULT_CHANGE_INTELLIGENCE_SETTINGS as S } from './settings';
import { addDays } from './local-time';

describe('change intelligence rules', () => {
  it('9.1.4 high baseline variance: s² > E, so the denominator uses s²', () => {
    const result = assessMateriality(
      {
        recent: 60,
        weeks: [10, 40, 20, 42],
        recentDaily: [9, 9, 9, 9, 8, 8, 8],
      },
      S,
    );
    expect(result.expected).toBe(28);
    expect(result.variance).toBeCloseTo(728 / 3, 10);
    expect(result.variance).toBeGreaterThan(result.expected);
    expect(result.z).toBeCloseTo(32 / Math.sqrt(728 / 3), 4);
    expect(result.qualifies).toBe(false); // z ≈ 2.05 with s², would be 6.05 with E
  });

  it('9.1.5 E < 5 never qualifies and E = 0 never divides', () => {
    const low = assessMateriality(
      { recent: 20, weeks: [4, 4, 4, 4], recentDaily: [3, 3, 3, 3, 3, 3, 2] },
      S,
    );
    expect(low.expected).toBe(4);
    expect(low.qualifies).toBe(false);
    const zero = assessMateriality(
      { recent: 0, weeks: [0, 0, 0, 0], recentDaily: [0, 0, 0, 0, 0, 0, 0] },
      S,
    );
    expect(zero.expected).toBe(0);
    expect(Number.isFinite(zero.z)).toBe(true);
    expect(zero.relative).toBeNull();
    expect(zero.qualifies).toBe(false);
  });

  it('9.1.23 the exact §5.10 arithmetic', () => {
    const detection = assessMateriality(
      {
        recent: 42,
        weeks: [27, 28, 28, 29],
        recentDaily: [6, 6, 6, 6, 6, 6, 6],
      },
      S,
    );
    expect(detection.expected).toBe(28);
    expect(detection.variance).toBeCloseTo(2 / 3, 10);
    expect(detection.difference).toBe(14);
    expect(detection.relative).toBe(0.5);
    expect(detection.z).toBe(14 / Math.sqrt(28));
    expect(detection.z).toBeCloseTo(2.6458, 4);
    expect(detection.spikeAdjustedRecent).toBe(40);
    expect(detection.direction).toBe('increase');
    expect(detection.qualifies).toBe(true);

    const before = forecastStock(
      { available: 40, minimum: 5, dailyUnits: 112 / 28 },
      S,
    );
    expect(before).toEqual({
      daysToMinimum: 8.75,
      daysToZero: 10,
      suggestedUnits: 0,
      reason: null,
    });
    expect(
      classifyRisk(
        {
          available: 40,
          minimum: 5,
          forecastReason: null,
          daysToMinimum: before.daysToMinimum,
        },
        S,
      ),
    ).toBe('normal');

    const after = forecastStock(
      { available: 40, minimum: 5, dailyUnits: 42 / 7 },
      S,
    );
    expect(after.daysToMinimum).toBe(35 / 6);
    expect(after.daysToMinimum?.toFixed(2)).toBe('5.83');
    expect(after.daysToZero).toBe(40 / 6);
    expect(after.daysToZero?.toFixed(2)).toBe('6.67');
    expect(after.suggestedUnits).toBe(7);
    expect(
      classifyRisk(
        {
          available: 40,
          minimum: 5,
          forecastReason: null,
          daysToMinimum: after.daysToMinimum,
        },
        S,
      ),
    ).toBe('projected_stock_risk');
  });

  it('9.1.15 zero demand, zero stock and negative availability', () => {
    expect(
      forecastStock({ available: 40, minimum: 5, dailyUnits: 0 }, S),
    ).toEqual({
      daysToMinimum: null,
      daysToZero: null,
      suggestedUnits: null,
      reason: 'no_positive_demand',
    });
    const empty = forecastStock({ available: 0, minimum: 5, dailyUnits: 4 }, S);
    expect(empty).toEqual({
      daysToMinimum: 0,
      daysToZero: 0,
      suggestedUnits: 33,
      reason: null,
    });
    expect(
      classifyRisk(
        { available: 0, minimum: 5, forecastReason: null, daysToMinimum: 0 },
        S,
      ),
    ).toBe('out_of_stock');
    expect(
      forecastStock({ available: -2, minimum: 5, dailyUnits: 4 }, S),
    ).toEqual({
      daysToMinimum: null,
      daysToZero: null,
      suggestedUnits: null,
      reason: 'data_quality_blocked',
    });
    expect(
      classifyRisk(
        {
          available: -2,
          minimum: 5,
          forecastReason: 'data_quality_blocked',
          daysToMinimum: null,
        },
        S,
      ),
    ).toBe('out_of_stock');
  });

  it('9.1.24 risk ordering: out of stock is shown even when the forecast is unavailable', () => {
    const unavailable = {
      forecastReason: 'no_recent_activity' as const,
      daysToMinimum: null,
    };
    expect(classifyRisk({ available: 0, minimum: 5, ...unavailable }, S)).toBe(
      'out_of_stock',
    );
    expect(classifyRisk({ available: 5, minimum: 5, ...unavailable }, S)).toBe(
      'low_stock',
    );
    expect(classifyRisk({ available: 6, minimum: 5, ...unavailable }, S)).toBe(
      'forecast_unavailable',
    );
    expect(
      classifyRisk(
        { available: 6, minimum: 5, forecastReason: null, daysToMinimum: 7 },
        S,
      ),
    ).toBe('projected_stock_risk');
    expect(
      classifyRisk(
        { available: 6, minimum: 5, forecastReason: null, daysToMinimum: 7.01 },
        S,
      ),
    ).toBe('normal');
  });

  it('9.1.26 (rule) baseline weeks used follow history length', () => {
    expect(baselineWeeksUsed(27, S)).toBe(2); // below the minimum of 3 → building_baseline
    expect(baselineWeeksUsed(28, S)).toBe(3);
    expect(baselineWeeksUsed(34, S)).toBe(3);
    expect(baselineWeeksUsed(35, S)).toBe(4);
    expect(baselineWeeksUsed(400, S)).toBe(4);
    expect(baselineWeeksUsed(0, S)).toBe(0);
  });

  describe('9.1.14 recovery, expiry, readiness loss and reversal', () => {
    const day = (n: number) => addDays('2026-10-01', n);
    const ev = (
      n: number,
      partial: Partial<LifecycleEvaluation>,
    ): LifecycleEvaluation => ({
      date: day(n),
      assessable: true,
      qualifyingDirection: null,
      z: 0,
      ...partial,
    });
    const run = (
      evs: LifecycleEvaluation[],
      start: Lifecycle = INITIAL_LIFECYCLE,
    ) =>
      evs.reduce(
        (state, item) => advanceLifecycle(state, item, S, true),
        start,
      );
    const confirmed = run([
      ev(0, { qualifyingDirection: 'increase', z: 3 }),
      ev(1, { qualifyingDirection: 'increase', z: 3 }),
    ]);

    it('confirms after two consecutive qualifying days', () => {
      expect(
        run([ev(0, { qualifyingDirection: 'increase', z: 3 })]).active,
      ).toBeNull();
      expect(confirmed.active).toEqual({
        direction: 'increase',
        confirmedOn: day(1),
      });
    });

    it('recovers with returned_to_usual after two days with |z| < 1', () => {
      const one = run([ev(2, { z: 0.5 })], confirmed);
      expect(one.active).not.toBeNull();
      const two = run([ev(3, { z: -0.9 })], one);
      expect(two.active).toBeNull();
      expect(two.lastResolution).toBe('returned_to_usual');
      // |z| ≥ 1 between them resets the recovery count
      const broken = run(
        [ev(2, { z: 0.5 }), ev(3, { z: 1.5 }), ev(4, { z: 0.5 })],
        confirmed,
      );
      expect(broken.active).not.toBeNull();
    });

    it('expires with no_longer_detected after 7 non-qualifying days', () => {
      const six = run(
        [2, 3, 4, 5, 6, 7].map((n) => ev(n, { z: 2 })),
        confirmed,
      );
      expect(six.active).not.toBeNull();
      const seven = run([ev(8, { z: 2 })], six);
      expect(seven.active).toBeNull();
      expect(seven.lastResolution).toBe('no_longer_detected');
    });

    it('readiness loss marks not re-checked and resolves no_longer_assessable after 14 days', () => {
      const lost = run([ev(2, { assessable: false, z: null })], confirmed);
      expect(lost.active).not.toBeNull();
      expect(lost.notRecheckedSince).toBe(day(1));
      const thirteen = run(
        Array.from({ length: 12 }, (_, i) =>
          ev(3 + i, { assessable: false, z: null }),
        ),
        lost,
      );
      expect(thirteen.active).not.toBeNull(); // day 14 is 13 days after the last ready day 1
      const gone = run([ev(15, { assessable: false, z: null })], thirteen);
      expect(gone.active).toBeNull();
      expect(gone.lastResolution).toBe('no_longer_assessable');
      // a ready evaluation clears the marker
      expect(run([ev(3, { z: 2 })], lost).notRecheckedSince).toBeNull();
    });

    it('reversal resolves with direction_reversed and opens the opposite direction', () => {
      const once = run(
        [ev(2, { qualifyingDirection: 'decrease', z: -3 })],
        confirmed,
      );
      expect(once.active?.direction).toBe('increase');
      const reversed = run(
        [ev(3, { qualifyingDirection: 'decrease', z: -3 })],
        once,
      );
      expect(reversed.active).toEqual({
        direction: 'decrease',
        confirmedOn: day(3),
      });
      expect(reversed.lastResolution).toBe('direction_reversed');
    });

    it('9.1.13 (rule) re-evaluating an already-evaluated local day does not advance', () => {
      const first = run([ev(0, { qualifyingDirection: 'increase', z: 3 })]);
      const again = advanceLifecycle(
        first,
        ev(0, { qualifyingDirection: 'increase', z: 3 }),
        S,
        true,
      );
      expect(again).toBe(first);
      expect(again.active).toBeNull();
    });
  });
});
