import type { ChangeIntelligenceSettings } from '@repo/shared';
import { sha256Hex } from './canonical';

/** §5.11 code defaults. */
export const DEFAULT_CHANGE_INTELLIGENCE_SETTINGS: Readonly<ChangeIntelligenceSettings> =
  Object.freeze({
    baselineWeeksMin: 3,
    baselineWeeksMax: 4,
    minExpectedWeekly: 5,
    minAbsoluteDifference: 3,
    minRelativeDifference: 0.25,
    minZ: 2.5,
    confirmationDays: 2,
    recoveryDays: 2,
    recoveryZ: 1.0,
    expiryDays: 7,
    unassessableDays: 14,
    recordingGapRatio: 0.5,
    forecastWindowDays: 28,
    forecastMinUnits: 14,
    projectedRiskDays: 7,
    replenishmentDays: 7,
  });

type Key = keyof ChangeIntelligenceSettings;
type Rule = { min: number | Key; max: number | Key; integer: boolean };

const RULES: Record<Key, Rule> = {
  baselineWeeksMin: { min: 3, max: 'baselineWeeksMax', integer: true },
  baselineWeeksMax: { min: 'baselineWeeksMin', max: 8, integer: true },
  minExpectedWeekly: { min: 3, max: 100, integer: false },
  minAbsoluteDifference: { min: 1, max: 100, integer: false },
  minRelativeDifference: { min: 0.1, max: 1, integer: false },
  minZ: { min: 1.5, max: 4, integer: false },
  confirmationDays: { min: 1, max: 3, integer: true },
  recoveryDays: { min: 1, max: 7, integer: true },
  recoveryZ: { min: 0.5, max: 2, integer: false },
  expiryDays: { min: 3, max: 28, integer: true },
  unassessableDays: { min: 7, max: 60, integer: true },
  recordingGapRatio: { min: 0.1, max: 0.9, integer: false },
  forecastWindowDays: { min: 14, max: 56, integer: true },
  forecastMinUnits: { min: 5, max: 100, integer: true },
  projectedRiskDays: { min: 1, max: 28, integer: true },
  replenishmentDays: { min: 1, max: 28, integer: true },
};

const isKey = (key: string): key is Key => Object.keys(RULES).includes(key);

/**
 * Merges a partial JSON object (MERCHANT_CHANGE_INTELLIGENCE_SETTINGS) over the
 * defaults and validates the result. Throws on anything unknown or out of range.
 */
export function parseSettings(
  json: string | undefined,
): ChangeIntelligenceSettings {
  if (json === undefined || json.trim() === '')
    return validateSettings({ ...DEFAULT_CHANGE_INTELLIGENCE_SETTINGS });
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Change intelligence settings are not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Change intelligence settings must be a JSON object');
  }
  const merged: ChangeIntelligenceSettings = {
    ...DEFAULT_CHANGE_INTELLIGENCE_SETTINGS,
  };
  for (const [key, value] of Object.entries(parsed)) {
    if (!isKey(key))
      throw new Error(`Change intelligence settings: unknown setting "${key}"`);
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Change intelligence settings: ${key} must be a number`);
    }
    merged[key] = value;
  }
  return validateSettings(merged);
}

export function validateSettings(
  settings: ChangeIntelligenceSettings,
): ChangeIntelligenceSettings {
  for (const key of Object.keys(RULES) as Key[]) {
    const rule = RULES[key];
    const value = settings[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Change intelligence settings: ${key} must be a number`);
    }
    if (rule.integer && !Number.isInteger(value)) {
      throw new Error(
        `Change intelligence settings: ${key} must be an integer`,
      );
    }
    const min = typeof rule.min === 'number' ? rule.min : settings[rule.min];
    const max = typeof rule.max === 'number' ? rule.max : settings[rule.max];
    if (value < min || value > max) {
      throw new Error(
        `Change intelligence settings: ${key} must be between ${min} and ${max} (got ${value})`,
      );
    }
  }
  return settings;
}

export function settingsFingerprint(
  settings: ChangeIntelligenceSettings,
): string {
  return sha256Hex(settings);
}

/** True when a previous run used different settings, so the next run has reason `settings_change`. */
export function settingsChanged(
  previousFingerprint: string | null,
  settings: ChangeIntelligenceSettings,
): boolean {
  return (
    previousFingerprint !== null &&
    previousFingerprint !== settingsFingerprint(settings)
  );
}
