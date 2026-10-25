import { ChangeIntelligenceConfig } from './change-intelligence.config';
import { DEFAULT_CHANGE_INTELLIGENCE_SETTINGS } from './engine/settings';

const merchant = { id: 'uuid-1', publicId: 'mrc_1', isActive: true };

describe('ChangeIntelligenceConfig', () => {
  it('is disabled by default with code-default settings', () => {
    const config = new ChangeIntelligenceConfig({});
    expect(config.enabled).toBe(false);
    expect(config.settings).toEqual(DEFAULT_CHANGE_INTELLIGENCE_SETTINGS);
    expect(config.isEnabledFor(merchant)).toBe(false);
  });

  it('accepts uuid or public id in the allowlist and requires an active merchant', () => {
    const config = new ChangeIntelligenceConfig({
      MERCHANT_CHANGE_INTELLIGENCE_ENABLED: 'true',
      MERCHANT_CHANGE_INTELLIGENCE_ALLOWLIST: ' mrc_1 , other-uuid',
    });
    expect(config.isEnabledFor(merchant)).toBe(true);
    expect(config.isEnabledFor({ ...merchant, publicId: 'mrc_2' })).toBe(false);
    expect(
      config.isEnabledFor({ id: 'other-uuid', publicId: 'x', isActive: true }),
    ).toBe(true);
    expect(config.isEnabledFor({ ...merchant, isActive: false })).toBe(false);
  });

  it('applies partial settings overrides and refuses to start on invalid ones', () => {
    const config = new ChangeIntelligenceConfig({
      MERCHANT_CHANGE_INTELLIGENCE_SETTINGS: '{"minZ":3}',
    });
    expect(config.settings.minZ).toBe(3);
    expect(config.settingsFingerprint).not.toBe(
      new ChangeIntelligenceConfig({}).settingsFingerprint,
    );
    expect(
      () =>
        new ChangeIntelligenceConfig({
          MERCHANT_CHANGE_INTELLIGENCE_SETTINGS: '{"minZ":9}',
        }),
    ).toThrow(/minZ/);
    expect(
      () =>
        new ChangeIntelligenceConfig({
          MERCHANT_CHANGE_INTELLIGENCE_SETTINGS: '{"surprise":1}',
        }),
    ).toThrow(/unknown setting/);
  });

  it('reads through a ConfigService-like getter', () => {
    const values: Record<string, string> = {
      MERCHANT_CHANGE_INTELLIGENCE_ENABLED: 'true',
    };
    const config = new ChangeIntelligenceConfig({
      get: (key: string) => values[key],
    });
    expect(config.isEnabledFor(merchant)).toBe(true);
  });
});
