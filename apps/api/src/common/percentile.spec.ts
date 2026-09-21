import { percentile } from './percentile';

describe('percentile', () => {
  it('returns zero for an empty sample', () => {
    expect(percentile([], 95)).toBe(0);
  });

  it('returns the only value for a single sample', () => {
    expect(percentile([42], 95)).toBe(42);
  });

  it('takes the nearest rank rather than interpolating', () => {
    // Twenty values: the 95th percentile is the 19th, which is 19.
    const samples = Array.from({ length: 20 }, (_, index) => index + 1);
    expect(percentile(samples, 95)).toBe(19);
  });

  it('finds the median', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2);
  });

  it('does not depend on the input order', () => {
    expect(percentile([9, 1, 5, 3, 7], 95)).toBe(
      percentile([1, 3, 5, 7, 9], 95),
    );
  });

  it('does not mutate the caller’s array', () => {
    const samples = [3, 1, 2];
    percentile(samples, 50);
    expect(samples).toEqual([3, 1, 2]);
  });

  it('clamps at the ends', () => {
    expect(percentile([1, 2, 3], 100)).toBe(3);
    expect(percentile([1, 2, 3], 0)).toBe(1);
  });
});
