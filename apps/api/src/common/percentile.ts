/**
 * Nearest-rank percentile over a sample.
 *
 * Used by the latency suites. Kept as a plain function rather than pulled from
 * a test file, because importing one spec from another runs its cases twice
 * and makes the counts meaningless.
 */
export function percentile(samples: number[], p: number): number {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]!;
}
