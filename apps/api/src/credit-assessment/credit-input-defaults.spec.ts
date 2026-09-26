import { configuredInputDefaults } from './credit-evidence.service';

describe('configuredInputDefaults', () => {
  it('is empty when unset', () => {
    expect(configuredInputDefaults(undefined)).toEqual({});
    expect(configuredInputDefaults('  ')).toEqual({});
  });
  it('accepts configurable numeric inputs', () => {
    expect(
      configuredInputDefaults(
        '{"retry_success_rate":90,"estimated_margin_pct":32}',
      ),
    ).toEqual({ retry_success_rate: 90, estimated_margin_pct: 32 });
  });
  it('rejects sales or declared inputs and non-numbers', () => {
    expect(() => configuredInputDefaults('{"verified_sales_eur":1}')).toThrow();
    expect(() =>
      configuredInputDefaults('{"merchant_type":"grocer"}'),
    ).toThrow();
    expect(() => configuredInputDefaults('{"finality":"98"}')).toThrow();
    expect(() => configuredInputDefaults('[1]')).toThrow();
    expect(() => configuredInputDefaults('nope')).toThrow();
  });
});
