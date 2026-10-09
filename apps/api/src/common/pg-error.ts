/**
 * The Postgres error behind a failed query. drizzle-orm ≥0.44 wraps it in
 * DrizzleQueryError, so `code`/`constraint` live on `.cause`, not the error
 * itself — checking `err.code` directly silently never matches.
 */
export function pgError(
  err: unknown,
): { code?: string; constraint?: string } | undefined {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  if (typeof e?.cause?.code === 'string') return e.cause;
  if (typeof e?.code === 'string') return e;
  return undefined;
}

export function isUniqueViolation(err: unknown): boolean {
  return pgError(err)?.code === '23505';
}
