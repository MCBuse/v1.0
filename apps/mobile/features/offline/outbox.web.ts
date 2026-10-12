import type { OutboxEntry, OutboxStatus, PaymentInstruction } from './models';

// Web stub implementation - SQLite not supported on web
// In production, use IndexedDB or server-side persistence instead

export async function addToOutbox(
  id: string,
  instruction: PaymentInstruction,
  transport: 'internet' | 'sms' | 'local' = 'internet',
): Promise<OutboxEntry> {
  console.warn('Outbox not supported on web platform');
  const now = Date.now();
  return {
    id,
    instruction,
    status: 'signed',
    transport,
    attempts: 0,
    lastAttemptAt: null,
    createdAt: now,
    syncedAt: null,
    errorMessage: 'Web platform does not support offline queue',
  };
}

export async function getOutboxEntries(
  status?: OutboxStatus,
): Promise<OutboxEntry[]> {
  return [];
}

export async function getPendingEntries(): Promise<OutboxEntry[]> {
  return [];
}

export async function updateOutboxStatus(
  id: string,
  status: OutboxStatus,
  errorMessage?: string,
): Promise<void> {
  // No-op on web
}

export async function getOutboxEntry(id: string): Promise<OutboxEntry | null> {
  return null;
}

export async function isIdempotent(paymentId: string): Promise<boolean> {
  return false;
}

export async function getOutboxCount(): Promise<{
  pending: number;
  synced: number;
  failed: number;
}> {
  return { pending: 0, synced: 0, failed: 0 };
}
