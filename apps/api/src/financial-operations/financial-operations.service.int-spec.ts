import { ConflictException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import {
  connectTestDatabase,
  type TestDatabase,
} from '../database/testing/test-database';
import * as schema from '../database/schema';
import { FinancialOperationsService } from './financial-operations.service';

describe('FinancialOperationsService (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let service: FinancialOperationsService;
  let userId: string;
  let sourceWalletId: string;
  let destinationWalletId: string;
  const createdOperationIds: string[] = [];

  beforeAll(async () => {
    const connection = await connectTestDatabase();
    db = connection.db;
    pool = connection.pool;
    service = new FinancialOperationsService(db);

    const suffix = randomUUID().slice(0, 8);
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `ops-int-${suffix}@mcbuse.test`,
        passwordHash: 'integration-test-not-a-real-hash',
        firstName: 'Ops',
        lastName: 'Integration',
        username: `opsint${suffix}`,
      })
      .returning({ id: schema.users.id });
    userId = user.id;

    const wallets = await db
      .insert(schema.wallets)
      .values([
        {
          userId,
          type: 'savings',
          solanaPubkey: `int-holding-${suffix}`,
          encryptedKeypair: 'v1:00:00:00',
          encryptionKeyVersion: 'v1',
        },
        {
          userId,
          type: 'routine',
          solanaPubkey: `int-routine-${suffix}`,
          encryptedKeypair: 'v1:00:00:00',
          encryptionKeyVersion: 'v1',
        },
      ])
      .returning({ id: schema.wallets.id, type: schema.wallets.type });
    sourceWalletId = wallets.find((w) => w.type === 'savings')!.id;
    destinationWalletId = wallets.find((w) => w.type === 'routine')!.id;
  });

  afterAll(async () => {
    if (createdOperationIds.length) {
      await db
        .delete(schema.financialOperationEvents)
        .where(
          inArray(
            schema.financialOperationEvents.operationId,
            createdOperationIds,
          ),
        );
      await db
        .delete(schema.financialOperations)
        .where(inArray(schema.financialOperations.id, createdOperationIds));
    }
    await db
      .delete(schema.balances)
      .where(
        inArray(schema.balances.walletId, [
          sourceWalletId,
          destinationWalletId,
        ]),
      );
    await db
      .delete(schema.wallets)
      .where(inArray(schema.wallets.id, [sourceWalletId, destinationWalletId]));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await pool.end();
  });

  async function begin(overrides: Record<string, unknown> = {}) {
    const result = await service.begin({
      userId,
      kind: 'internal_transfer',
      idempotencyKey: randomUUID(),
      amountBaseUnits: 25_000_000n,
      currency: 'USDC',
      sourceWalletId,
      destinationWalletId,
      ...overrides,
    } as Parameters<FinancialOperationsService['begin']>[0]);
    createdOperationIds.push(result.operation.id);
    return result;
  }

  describe('begin', () => {
    it('creates a durable record at the created status', async () => {
      const { operation, replayed } = await begin();
      expect(replayed).toBe(false);
      expect(operation.status).toBe('created');
      expect(operation.amountBaseUnits).toBe(25_000_000n);
      expect(operation.inputFingerprint).toMatch(/^[0-9a-f]{64}$/);
    });

    it('records a creation event', async () => {
      const { operation } = await begin();
      const events = await db
        .select()
        .from(schema.financialOperationEvents)
        .where(eq(schema.financialOperationEvents.operationId, operation.id));
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('created');
      expect(events[0].sequence).toBe(1);
    });

    it('replays the original record for an identical retry', async () => {
      const idempotencyKey = randomUUID();
      const first = await begin({ idempotencyKey });
      const second = await service.begin({
        userId,
        kind: 'internal_transfer',
        idempotencyKey,
        amountBaseUnits: 25_000_000n,
        currency: 'USDC',
        sourceWalletId,
        destinationWalletId,
      });

      expect(second.replayed).toBe(true);
      expect(second.operation.id).toBe(first.operation.id);
    });

    it('refuses the same key with a different amount', async () => {
      const idempotencyKey = randomUUID();
      await begin({ idempotencyKey });
      await expect(
        service.begin({
          userId,
          kind: 'internal_transfer',
          idempotencyKey,
          amountBaseUnits: 99_000_000n,
          currency: 'USDC',
          sourceWalletId,
          destinationWalletId,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses the same key with a different destination', async () => {
      const idempotencyKey = randomUUID();
      await begin({ idempotencyKey });
      await expect(
        service.begin({
          userId,
          kind: 'internal_transfer',
          idempotencyKey,
          amountBaseUnits: 25_000_000n,
          currency: 'USDC',
          sourceWalletId,
          destinationWalletId: sourceWalletId,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates exactly one record when the same request races itself', async () => {
      const idempotencyKey = randomUUID();
      const request = () =>
        service.begin({
          userId,
          kind: 'internal_transfer',
          idempotencyKey,
          amountBaseUnits: 25_000_000n,
          currency: 'USDC',
          sourceWalletId,
          destinationWalletId,
        });

      const results = await Promise.all([
        request(),
        request(),
        request(),
        request(),
      ]);
      const ids = new Set(results.map((r) => r.operation.id));
      expect(ids.size).toBe(1);
      createdOperationIds.push(...ids);

      const rows = await db
        .select()
        .from(schema.financialOperations)
        .where(
          and(
            eq(schema.financialOperations.userId, userId),
            eq(schema.financialOperations.idempotencyKey, idempotencyKey),
          ),
        );
      expect(rows).toHaveLength(1);
    });
  });

  describe('advance', () => {
    it('moves through the sequence and appends ordered events', async () => {
      const { operation } = await begin();

      await service.advance(operation.id, 'reserved', {
        reservedAt: new Date(),
      });
      await service.advance(operation.id, 'chain_submitted', {
        chainSignature: 'sig-' + randomUUID(),
      });
      const confirmed = await service.advance(operation.id, 'chain_confirmed');

      expect(confirmed.status).toBe('chain_confirmed');

      const events = await db
        .select()
        .from(schema.financialOperationEvents)
        .where(eq(schema.financialOperationEvents.operationId, operation.id))
        .orderBy(schema.financialOperationEvents.sequence);
      expect(events.map((e) => e.sequence)).toEqual([1, 2, 3, 4]);
      expect(events.map((e) => e.toStatus)).toEqual([
        'created',
        'reserved',
        'chain_submitted',
        'chain_confirmed',
      ]);
    });

    it('refuses to skip a step', async () => {
      const { operation } = await begin();
      await expect(service.advance(operation.id, 'finalized')).rejects.toThrow(
        /cannot move/i,
      );
    });

    it('refuses to advance a finalized operation', async () => {
      const { operation } = await begin();
      await service.advance(operation.id, 'reserved');
      await service.advance(operation.id, 'chain_submitted');
      await service.advance(operation.id, 'chain_confirmed');
      await service.advance(operation.id, 'finalized');

      await expect(
        service.advance(operation.id, 'chain_submitted'),
      ).rejects.toThrow(/cannot move/i);
    });

    it('applies only one of two racing advances', async () => {
      const { operation } = await begin();
      const results = await Promise.allSettled([
        service.advance(operation.id, 'reserved'),
        service.advance(operation.id, 'reserved'),
      ]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled).toHaveLength(1);
    });
  });

  describe('fail', () => {
    it('fails an operation that has not moved value', async () => {
      const { operation } = await begin();
      await service.advance(operation.id, 'reserved');
      const failed = await service.fail(operation.id, 'insufficient_funds');
      expect(failed.status).toBe('failed');
      expect(failed.failureCode).toBe('insufficient_funds');
    });

    it('refuses to fail an operation whose tokens already moved', async () => {
      const { operation } = await begin({ kind: 'withdrawal_bank' });
      await service.advance(operation.id, 'reserved');
      await service.advance(operation.id, 'chain_submitted');
      await service.advance(operation.id, 'chain_confirmed');

      await expect(
        service.fail(operation.id, 'payout_declined'),
      ).rejects.toThrow(/compensat/i);
    });
  });

  describe('compensation', () => {
    it('routes a post-movement failure through compensation to reversed', async () => {
      const { operation } = await begin({ kind: 'withdrawal_bank' });
      await service.advance(operation.id, 'reserved');
      await service.advance(operation.id, 'chain_submitted');
      await service.advance(operation.id, 'chain_confirmed');
      await service.advance(operation.id, 'payout_submitted');

      const compensating = await service.beginCompensation(
        operation.id,
        'payout_failed',
      );
      expect(compensating.status).toBe('compensating');

      const reversed = await service.completeCompensation(operation.id, {
        returnedSignature: 'sig-return',
      });
      expect(reversed.status).toBe('reversed');
    });

    it('keeps the whole history rather than rewriting the failed step', async () => {
      const { operation } = await begin({ kind: 'withdrawal_bank' });
      await service.advance(operation.id, 'reserved');
      await service.advance(operation.id, 'chain_submitted');
      await service.advance(operation.id, 'chain_confirmed');
      await service.beginCompensation(operation.id, 'payout_declined');
      await service.completeCompensation(operation.id, {});

      const events = await db
        .select()
        .from(schema.financialOperationEvents)
        .where(eq(schema.financialOperationEvents.operationId, operation.id))
        .orderBy(schema.financialOperationEvents.sequence);

      expect(events.map((e) => e.toStatus)).toEqual([
        'created',
        'reserved',
        'chain_submitted',
        'chain_confirmed',
        'compensating',
        'reversed',
      ]);
    });
  });

  describe('recovery', () => {
    it('lists in-flight operations that are due for another look', async () => {
      const { operation } = await begin();
      await service.advance(operation.id, 'reserved', {
        nextAttemptAt: new Date(Date.now() - 60_000),
      });

      const due = await service.due(50);
      expect(due.map((o) => o.id)).toContain(operation.id);
    });

    it('excludes terminal operations from recovery', async () => {
      const { operation } = await begin();
      await service.advance(operation.id, 'reserved');
      await service.fail(operation.id, 'cancelled');

      const due = await service.due(50);
      expect(due.map((o) => o.id)).not.toContain(operation.id);
    });

    it('excludes operations whose next attempt is still in the future', async () => {
      const { operation } = await begin();
      await service.advance(operation.id, 'reserved', {
        nextAttemptAt: new Date(Date.now() + 600_000),
      });

      const due = await service.due(50);
      expect(due.map((o) => o.id)).not.toContain(operation.id);
    });

    it('reports the action to take for an interrupted chain submission', async () => {
      const { operation } = await begin();
      await service.advance(operation.id, 'reserved');
      const submitted = await service.advance(operation.id, 'chain_submitted', {
        chainSignature: 'sig-interrupted',
      });

      expect(service.actionFor(submitted)).toBe('check_chain');
    });
  });
});
