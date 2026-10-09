import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../database/schema';

/**
 * A retry without a key would move money twice, so the key is required rather
 * than generated here — only the client knows which attempts are the same one.
 */
export function requireIdempotencyKey(key: string | undefined): string {
  const normalized = optionalIdempotencyKey(key);
  if (!normalized) {
    throw new BadRequestException('Idempotency-Key header is required');
  }
  return normalized;
}

/** Same validation, but a missing header is allowed (older mobile builds). */
export function optionalIdempotencyKey(
  key: string | undefined,
): string | undefined {
  if (!key || key.trim().length === 0) return undefined;
  if (key.length > 128) {
    throw new BadRequestException('Idempotency-Key is too long');
  }
  return key.trim();
}

/**
 * ledger_entries.idempotency_key is unique across ALL users, so a raw client
 * key could collide with (or probe for) someone else's entry. Scope it.
 * No client key → a fresh UUID, i.e. the old non-idempotent behaviour.
 */
export function ledgerIdempotencyKey(
  kind: string,
  userId: string,
  clientKey: string | undefined,
): string {
  return clientKey ? `${kind}:${userId}:${clientKey}` : randomUUID();
}

export async function findLedgerEntryByKey(
  db: NodePgDatabase<typeof schema>,
  key: string,
) {
  const [row] = await db
    .select()
    .from(schema.ledgerEntries)
    .where(eq(schema.ledgerEntries.idempotencyKey, key))
    .limit(1);
  return row ?? null;
}
