import {
  DEFAULT_CHANGE_INTELLIGENCE_SETTINGS,
  parseSettings,
  settingsChanged,
  settingsFingerprint,
} from './settings';

describe('change intelligence settings', () => {
  it('9.1.25 defaults, partial JSON override, and rejection of unknown keys and out-of-range values', () => {
    expect(parseSettings(undefined)).toEqual(
      DEFAULT_CHANGE_INTELLIGENCE_SETTINGS,
    );
    expect(parseSettings('')).toEqual(DEFAULT_CHANGE_INTELLIGENCE_SETTINGS);
    expect(DEFAULT_CHANGE_INTELLIGENCE_SETTINGS).toMatchObject({
      baselineWeeksMin: 3,
      baselineWeeksMax: 4,
      minExpectedWeekly: 5,
      minAbsoluteDifference: 3,
      minRelativeDifference: 0.25,
      minZ: 2.5,
      confirmationDays: 2,
      recoveryDays: 2,
      recoveryZ: 1,
      expiryDays: 7,
      unassessableDays: 14,
      recordingGapRatio: 0.5,
      forecastWindowDays: 28,
      forecastMinUnits: 14,
      projectedRiskDays: 7,
      replenishmentDays: 7,
    });

    const merged = parseSettings('{"minZ":3,"baselineWeeksMin":4}');
    expect(merged).toEqual({
      ...DEFAULT_CHANGE_INTELLIGENCE_SETTINGS,
      minZ: 3,
      baselineWeeksMin: 4,
    });

    expect(() => parseSettings('{"minZed":3}')).toThrow(
      /unknown setting "minZed"/,
    );
    expect(() => parseSettings('{"minZ":"3"}')).toThrow(
      /minZ must be a number/,
    );
    expect(() => parseSettings('{"minZ":5}')).toThrow(
      /minZ must be between 1.5 and 4/,
    );
    expect(() => parseSettings('{"confirmationDays":1.5}')).toThrow(
      /confirmationDays must be an integer/,
    );
    expect(() => parseSettings('{"baselineWeeksMin":5}')).toThrow(
      /baselineWeeksMin must be between 3 and 4/,
    );
    expect(() => parseSettings('{"baselineWeeksMax":9}')).toThrow(
      /baselineWeeksMax must be between/,
    );
    expect(() => parseSettings('[1]')).toThrow(/JSON object/);
    expect(() => parseSettings('{bad')).toThrow(/not valid JSON/);
  });

  it('fingerprint is stable for equal settings and differs when a value changes', () => {
    const a = settingsFingerprint(DEFAULT_CHANGE_INTELLIGENCE_SETTINGS);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(
      settingsFingerprint({ ...DEFAULT_CHANGE_INTELLIGENCE_SETTINGS }),
    ).toBe(a);
    const b = settingsFingerprint(parseSettings('{"minZ":3}'));
    expect(b).not.toBe(a);
    expect(settingsChanged(a, parseSettings('{"minZ":3}'))).toBe(true);
    expect(settingsChanged(a, DEFAULT_CHANGE_INTELLIGENCE_SETTINGS)).toBe(
      false,
    );
    expect(settingsChanged(null, DEFAULT_CHANGE_INTELLIGENCE_SETTINGS)).toBe(
      false,
    );
  });
});
