import { http } from '@/lib/api';

import type { OutboxEntry } from './models';
import {
  getPendingEntries,
  updateOutboxStatus,
  isIdempotent,
} from './outbox';

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2000;

function backoffDelay(attempt: number): number {
  return Math.min(BASE_DELAY_MS * Math.pow(2, attempt), 60_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SyncResult {
  synced: number;
  failed: number;
  skipped: number;
}

async function syncEntry(entry: OutboxEntry): Promise<boolean> {
  try {
    await updateOutboxStatus(entry.id, 'sending');
    await http.post('/payments/offline-sync', {
      instruction: entry.instruction,
      idempotencyKey: entry.instruction.paymentId,
    });
    await updateOutboxStatus(entry.id, 'synced');
    return true;
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown sync error';
    await updateOutboxStatus(entry.id, 'failed', message);
    return false;
  }
}

export async function syncOutbox(): Promise<SyncResult> {
  const entries = await getPendingEntries();
  const result: SyncResult = { synced: 0, failed: 0, skipped: 0 };

  for (const entry of entries) {
    if (entry.attempts >= MAX_RETRIES) {
      result.skipped++;
      continue;
    }

    if (entry.lastAttemptAt) {
      const elapsed = Date.now() - entry.lastAttemptAt;
      const required = backoffDelay(entry.attempts);
      if (elapsed < required) {
        result.skipped++;
        continue;
      }
    }

    const success = await syncEntry(entry);
    if (success) {
      result.synced++;
    } else {
      result.failed++;
    }
  }

  return result;
}

export async function syncWithRetry(
  entry: OutboxEntry,
  maxRetries = MAX_RETRIES,
): Promise<boolean> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const success = await syncEntry(entry);
    if (success) return true;

    if (attempt < maxRetries - 1) {
      await sleep(backoffDelay(attempt));
    }
  }
  return false;
}

export async function checkIdempotency(paymentId: string): Promise<boolean> {
  return isIdempotent(paymentId);
}

let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoSync(intervalMs = 30_000): void {
  stopAutoSync();
  syncInterval = setInterval(() => {
    syncOutbox().catch(() => {});
  }, intervalMs);
}

export function stopAutoSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
