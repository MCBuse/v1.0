import * as SQLite from 'expo-sqlite';
import type { OutboxEntry, OutboxStatus, PaymentInstruction } from './models';

let db: any | null = null;

async function getDb(): Promise<any> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('mcbuse_outbox.db');
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY,
        instruction TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        transport TEXT NOT NULL DEFAULT 'internet',
        attempts INTEGER NOT NULL DEFAULT 0,
        lastAttemptAt INTEGER,
        createdAt INTEGER NOT NULL,
        syncedAt INTEGER,
        errorMessage TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status);
    `);
  }
  return db;
}

function rowToEntry(row: Record<string, unknown>): OutboxEntry {
  return {
    id: row.id as string,
    instruction: JSON.parse(row.instruction as string) as PaymentInstruction,
    status: row.status as OutboxStatus,
    transport: row.transport as 'internet' | 'sms' | 'local',
    attempts: row.attempts as number,
    lastAttemptAt: row.lastAttemptAt as number | null,
    createdAt: row.createdAt as number,
    syncedAt: row.syncedAt as number | null,
    errorMessage: row.errorMessage as string | null,
  };
}

export async function addToOutbox(
  id: string,
  instruction: PaymentInstruction,
  transport: 'internet' | 'sms' | 'local' = 'internet',
): Promise<OutboxEntry> {
  const database = await getDb();
  const now = Date.now();
  await database.runAsync(
    `INSERT OR REPLACE INTO outbox (id, instruction, status, transport, attempts, createdAt)
     VALUES (?, ?, 'signed', ?, 0, ?)`,
    id,
    JSON.stringify(instruction),
    transport,
    now,
  );
  return {
    id,
    instruction,
    status: 'signed',
    transport,
    attempts: 0,
    lastAttemptAt: null,
    createdAt: now,
    syncedAt: null,
    errorMessage: null,
  };
}

export async function getOutboxEntries(
  status?: OutboxStatus,
): Promise<OutboxEntry[]> {
  const database = await getDb();
  const query = status
    ? 'SELECT * FROM outbox WHERE status = ? ORDER BY createdAt ASC'
    : 'SELECT * FROM outbox ORDER BY createdAt DESC';
  const rows = status
    ? await database.getAllAsync(query, status)
    : await database.getAllAsync(query);
  return (rows as Record<string, unknown>[]).map(rowToEntry);
}

export async function getPendingEntries(): Promise<OutboxEntry[]> {
  const database = await getDb();
  const rows = await database.getAllAsync(
    `SELECT * FROM outbox WHERE status IN ('signed', 'sending', 'failed')
     ORDER BY createdAt ASC`,
  );
  return (rows as Record<string, unknown>[]).map(rowToEntry);
}

export async function updateOutboxStatus(
  id: string,
  status: OutboxStatus,
  errorMessage?: string,
): Promise<void> {
  const database = await getDb();
  const now = Date.now();
  if (status === 'synced') {
    await database.runAsync(
      'UPDATE outbox SET status = ?, syncedAt = ?, lastAttemptAt = ?, attempts = attempts + 1, errorMessage = NULL WHERE id = ?',
      status,
      now,
      now,
      id,
    );
  } else {
    await database.runAsync(
      'UPDATE outbox SET status = ?, lastAttemptAt = ?, attempts = attempts + 1, errorMessage = ? WHERE id = ?',
      status,
      now,
      errorMessage ?? null,
      id,
    );
  }
}

export async function getOutboxEntry(id: string): Promise<OutboxEntry | null> {
  const database = await getDb();
  const row = await database.getFirstAsync(
    'SELECT * FROM outbox WHERE id = ?',
    id,
  );
  return row ? rowToEntry(row as Record<string, unknown>) : null;
}

export async function isIdempotent(paymentId: string): Promise<boolean> {
  const database = await getDb();
  const row = await database.getFirstAsync(
    `SELECT id FROM outbox WHERE json_extract(instruction, '$.paymentId') = ?`,
    paymentId,
  );
  return row !== null;
}

export async function getOutboxCount(): Promise<{
  pending: number;
  synced: number;
  failed: number;
}> {
  const database = await getDb();
  const result = await database.getFirstAsync<{
    pending: number;
    synced: number;
    failed: number;
  }>(`
    SELECT
      COALESCE(SUM(CASE WHEN status IN ('signed','sending') THEN 1 ELSE 0 END), 0) as pending,
      COALESCE(SUM(CASE WHEN status = 'synced' THEN 1 ELSE 0 END), 0) as synced,
      COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failed
    FROM outbox
  `);
  return result ?? { pending: 0, synced: 0, failed: 0 };
}
