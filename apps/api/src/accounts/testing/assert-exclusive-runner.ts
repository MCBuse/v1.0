/**
 * Refuses to run the devnet suites while another operation runner is live.
 *
 * A locally running API drives its own recovery worker against the same
 * database, so it will happily advance operations these tests are midway
 * through asserting on. That surfaces as a baffling balance mismatch rather
 * than anything to do with the code under test, so fail fast and say why.
 */
export async function assertNoCompetingRunner(): Promise<void> {
  const url =
    process.env.LOCAL_API_HEALTH_URL ?? 'http://localhost:4000/api/v1/health';
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(1_500),
    });
    if (!response.ok) return;
  } catch {
    // Nothing listening: exactly what we want.
    return;
  }

  throw new Error(
    `A local API is running at ${url}. Its recovery worker shares this ` +
      'database and will advance the operations these tests assert on. ' +
      'Stop it before running the devnet suite, or start it with ' +
      'OPERATION_RUNNER_ENABLED=false.',
  );
}
