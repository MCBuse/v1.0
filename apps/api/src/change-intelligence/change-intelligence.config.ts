import type { ChangeIntelligenceSettings } from '@repo/shared';
import { validateRegistry } from './engine/registry';
import { parseSettings, settingsFingerprint } from './engine/settings';

/** Anything with `get(key)` (Nest ConfigService) or a plain env object. */
export type ChangeIntelligenceEnv =
  | { get(key: string): unknown }
  | Record<string, string | undefined>;

export type MerchantIdentity = {
  id: string;
  publicId: string;
  isActive: boolean;
};

const read = (env: ChangeIntelligenceEnv, key: string): string | undefined => {
  const getter = (env as { get?: unknown }).get;
  const value: unknown =
    typeof getter === 'function'
      ? (getter as (k: string) => unknown).call(env, key)
      : (env as Record<string, unknown>)[key];
  return typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : undefined;
};

/**
 * Feature configuration (plan §8, §5.11). Constructing it validates the
 * registry and the settings, so a bad deploy refuses to start. The worker and
 * the read APIs share `isEnabledFor`.
 */
export class ChangeIntelligenceConfig {
  readonly enabled: boolean;
  /** Merchant UUIDs or public IDs. Empty = every active merchant (legacy semantics). */
  readonly allowlist: string[];
  readonly settings: ChangeIntelligenceSettings;
  readonly settingsFingerprint: string;

  constructor(env: ChangeIntelligenceEnv = process.env) {
    validateRegistry();
    this.enabled = read(env, 'MERCHANT_CHANGE_INTELLIGENCE_ENABLED') === 'true';
    this.allowlist = (read(env, 'MERCHANT_CHANGE_INTELLIGENCE_ALLOWLIST') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    this.settings = parseSettings(
      read(env, 'MERCHANT_CHANGE_INTELLIGENCE_SETTINGS'),
    );
    this.settingsFingerprint = settingsFingerprint(this.settings);
  }

  isEnabledFor(merchant: MerchantIdentity): boolean {
    return (
      this.enabled &&
      merchant.isActive &&
      (this.allowlist.length === 0 ||
        this.allowlist.includes(merchant.id) ||
        this.allowlist.includes(merchant.publicId))
    );
  }
}
