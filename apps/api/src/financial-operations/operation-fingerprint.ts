import { ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';

type Fingerprintable =
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | Fingerprintable[]
  | { [key: string]: Fingerprintable };

/**
 * Canonical form: keys sorted, `undefined` dropped, and each scalar tagged with
 * its type. The tagging matters — `25`, `"25"` and `25n` are different inputs
 * and must not collide into one fingerprint.
 */
function canonicalize(value: Fingerprintable): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undef';
  if (typeof value === 'string') return `s:${JSON.stringify(value)}`;
  if (typeof value === 'number') return `n:${value}`;
  if (typeof value === 'bigint') return `i:${value.toString()}`;
  if (typeof value === 'boolean') return `b:${value ? 1 : 0}`;
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }
  const entries = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`);
  return `{${entries.join(',')}}`;
}

export function operationFingerprint(
  input: Record<string, Fingerprintable>,
): string {
  return createHash('sha256').update(canonicalize(input)).digest('hex');
}

/**
 * A replay of the same request is answered with the original outcome; the same
 * key carrying different inputs is a client bug and is refused rather than
 * quietly treated as either request.
 */
export function assertIdempotentReuse(
  storedFingerprint: string | null,
  incomingFingerprint: string,
  operationLabel: string,
): void {
  if (storedFingerprint === incomingFingerprint) return;
  throw new ConflictException(
    `This Idempotency-Key was already used for a different ${operationLabel} request`,
  );
}
