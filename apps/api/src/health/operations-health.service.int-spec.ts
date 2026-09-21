import { eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import {
  connectTestDatabase,
  type TestDatabase,
} from '../database/testing/test-database';
import * as schema from '../database/schema';
import { OperationsHealthService } from './operations-health.service';
import { FinancialOperationsService } from '../financial-operations/financial-operations.service';
import type { ReconciliationService } from '../financial-operations/reconciliation.service';

/**
 * P.6 — the monitoring read, against real rows.
 *
 * Reconciliation is stubbed here because it has its own suite; what matters in
 * this one is that each counter notices the thing it exists to notice, and
 * that a quiet platform reports `ok` rather than inventing a concern.
 */
describe('OperationsHealthService (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let health: OperationsHealthService;
  let operations: FinancialOperationsService;

  let userId: string;
  let holdingWalletId: string;
  const operationIds: string[] = [];
  const webhookIds: string[] = [];

  const reconciliation = {
    reconcile: async () => ({
      checkedAt: new Date().toISOString(),
      wallets: [],
      unexplained: [],
      stuck: [],
      healthy: true,
    }),
  } as unknown as ReconciliationService;

  beforeAll(async () => {
    const connection = await connectTestDatabase();
    db = connection.db;
    pool = connection.pool;
    operations = new FinancialOperationsService(db);
    health = new OperationsHealthService(db, reconciliation);

    const suffix = randomUUID().slice(0, 8);
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `opshealth-${suffix}@mcbuse.test`,
        passwordHash: 'integration-test-not-a-real-hash',
        firstName: 'Ops',
        lastName: 'Health',
        username: `opshealth${suffix}`,
      })
      .returning({ id: schema.users.id });
    userId = user.id;

    const [wallet] = await db
      .insert(schema.wallets)
      .values({
        userId,
        type: 'savings',
        solanaPubkey: `opshealth-${suffix}`,
        encryptedKeypair: 'v1:00:00:00',
        encryptionKeyVersion: 'v1',
      })
      .returning({ id: schema.wallets.id });
    holdingWalletId = wallet.id;
    await db
      .insert(schema.balances)
      .values({ walletId: holdingWalletId, currency: 'USDC' });
  });

  async function clear() {
    if (operationIds.length) {
      await db
        .delete(schema.financialOperationEvents)
        .where(
          inArray(schema.financialOperationEvents.operationId, operationIds),
        );
      await db
        .delete(schema.financialOperations)
        .where(inArray(schema.financialOperations.id, operationIds));
      operationIds.length = 0;
    }
    if (webhookIds.length) {
      await db
        .delete(schema.providerWebhookEvents)
        .where(inArray(schema.providerWebhookEvents.id, webhookIds));
      webhookIds.length = 0;
    }
  }

  afterEach(clear);

  afterAll(async () => {
    await clear();
    await db
      .delete(schema.balances)
      .where(eq(schema.balances.walletId, holdingWalletId));
    await db.delete(schema.wallets).where(eq(schema.wallets.id, holdingWalletId));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await pool.end();
  });

  async function pendingOperation(ageMs = 0) {
    const { operation } = await operations.begin({
      userId,
      kind: 'internal_transfer',
      idempotencyKey: randomUUID(),
      amountBaseUnits: 1_000_000n,
      currency: 'USDC',
      sourceWalletId: holdingWalletId,
      displayAmountMinor: 100n,
      displayCurrency: 'USD',
    });
    operationIds.push(operation.id);
    if (ageMs > 0) {
      await db
        .update(schema.financialOperations)
        .set({ updatedAt: new Date(Date.now() - ageMs) })
        .where(eq(schema.financialOperations.id, operation.id));
    }
    return operation.id;
  }

  async function webhook(status: string, ageMs: number) {
    const id = `evt_${randomUUID()}`;
    webhookIds.push(id);
    await db.insert(schema.providerWebhookEvents).values({
      id,
      provider: 'stripe',
      eventType: 'checkout.session.completed',
      payloadHash: 'hash',
      status,
      receivedAt: new Date(Date.now() - ageMs),
    });
    return id;
  }

  it('counts in-flight operations by status', async () => {
    await pendingOperation();
    await pendingOperation();

    const result = await health.check();

    expect(result.pendingOperations.total).toBeGreaterThanOrEqual(2);
    expect(result.pendingOperations.byStatus.created).toBeGreaterThanOrEqual(2);
  });

  it('reports the age of the oldest in-flight operation', async () => {
    await pendingOperation(30 * 60 * 1000);

    const result = await health.check();
    expect(result.pendingOperations.oldestAgeSeconds).toBeGreaterThanOrEqual(
      1700,
    );
  });

  it('raises a concern about an operation that has stopped moving', async () => {
    await pendingOperation(30 * 60 * 1000);

    const result = await health.check();
    expect(result.status).toBe('degraded');
    expect(result.concerns.join(' ')).toContain('have not advanced');
  });

  it('does not call recent work stale', async () => {
    await pendingOperation(60 * 1000);

    const result = await health.check();
    expect(result.pendingOperations.staleCount).toBe(0);
  });

  it('counts webhook failures from the last day', async () => {
    const before = (await health.check()).webhooks.failedLastDay;
    await webhook('failed', 60 * 60 * 1000);

    const result = await health.check();
    expect(result.webhooks.failedLastDay).toBe(before + 1);
    expect(result.concerns.join(' ')).toContain('webhook(s) failed');
  });

  it('ignores a failure older than a day', async () => {
    // Measured as a delta: this database is shared, and what is being proved
    // is that the old row is not counted, not that the table is empty.
    const before = (await health.check()).webhooks.failedLastDay;
    await webhook('failed', 48 * 60 * 60 * 1000);

    const result = await health.check();
    expect(result.webhooks.failedLastDay).toBe(before);
  });

  it('notices a webhook that was received and never processed', async () => {
    const before = (await health.check()).webhooks.unprocessedLastHour;
    await webhook('received', 2 * 60 * 60 * 1000);

    const result = await health.check();
    expect(result.webhooks.unprocessedLastHour).toBe(before + 1);
    expect(result.concerns.join(' ')).toContain('never processed');
  });

  it('leaves a webhook that has only just arrived alone', async () => {
    const before = (await health.check()).webhooks.unprocessedLastHour;
    await webhook('received', 5 * 1000);

    const result = await health.check();
    expect(result.webhooks.unprocessedLastHour).toBe(before);
  });

  it('reports stream activity', async () => {
    const result = await health.check();
    expect(result.streams).toHaveProperty('eventsLastHour');
    expect(typeof result.streams.eventsLastHour).toBe('number');
  });

  it('reports the analytics worker backlog', async () => {
    const result = await health.check();
    expect(result.workerBacklog).toHaveProperty('pending');
    expect(typeof result.workerBacklog.pending).toBe('number');
  });

  it('leaves reconciliation out unless it is asked for', async () => {
    const result = await health.check();
    expect(result.reconciliation).toBeNull();
  });

  it('includes reconciliation when asked', async () => {
    const result = await health.check({ reconcile: true });
    expect(result.reconciliation).not.toBeNull();
    expect(result.reconciliation!.healthy).toBe(true);
  });

  it('reports ok when nothing needs attention', async () => {
    const result = await health.check();
    // Any pre-existing rows in the shared database could legitimately raise a
    // concern; what must hold is that the status follows the concerns.
    expect(result.status).toBe(result.concerns.length === 0 ? 'ok' : 'degraded');
    expect(result.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
