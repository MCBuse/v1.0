import { formatTimeLeft } from '../format';

const NOW = Date.parse('2026-11-07T12:00:00Z');
const at = (ms: number) => new Date(NOW + ms).toISOString();

describe('formatTimeLeft', () => {
  it.each([
    [at(-1_000), 'expired'],
    [at(30_000), 'expired'],
    [at(45 * 60_000), '45 min'],
    [at(60 * 60_000), '1 hour'],
    [at(47 * 3_600_000), '47 hours'],
    [at(48 * 3_600_000), '2 days'],
    [at(7 * 86_400_000), '7 days'],
  ])('%s -> %s', (iso, expected) => {
    expect(formatTimeLeft(iso, NOW)).toBe(expected);
  });
});
