import { BadRequestException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import {
  connectTestDatabase,
  type TestDatabase,
} from '../database/testing/test-database';
import * as schema from '../database/schema';
import { OperationLedgerService } from './operation-ledger.service';

describe('OperationLedgerService (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let ledger: OperationLedgerService;
  let userId: string;
  let holdingWalletId: string;
  let routineWalletId: string;
  const ledgerEntryIds: string[] = [];

  beforeAll(async () => {
    const connection = await connectTestDatabase();
    db = connection.db;
    pool = connection.pool;
    ledger = new OperationLedgerService(db);

    const suffix = randomUUID().slice(0, 8);
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `ledger-${suffix}@mcbuse.test`,
        passwordHash: 'integration-test-not-a-real-hash',
        firstName: 'Ledger',
        lastName: 'Integration',
        username: `ledger${suffix}`,
      })
      .returning({ id: schema.users.id });
    userId = user.id;

    const wallets = await db
      .insert(schema.wallets)
      .values([
        {
          userId,
          type: 'savings',
          solanaPubkey: `led-holding-${suffix}`,
          encryptedKeypair: 'v1:00:00:00',
        },
        {
          userId,
          type: 'routine',
          solanaPubkey: `led-routine-${suffix}`,
          encryptedKeypair: 'v1:00:00:00',
        },
      ])
      .returning({ id: schema.wallets.id, type: schema.wallets.type });
    holdingWalletId = wallets.find((w) => w.type === 'savings')!.id;
    routineWalletId = wallets.find((w) => w.type === 'routine')!.id;

    await db.insert(schema.balances).values([
      { walletId: holdingWalletId, currency: 'USDC', available: 0n, pending: 0n },
      { walletId: routineWalletId, currency: 'USDC', available: 0n, pending: 0n },
    ]);
  });

  afterAll(async () => {
    if (ledgerEntryIds.length) {
      await db
        .delete(schema.ledgerEntries)
        .where(inArray(schema.ledgerEntries.id, ledgerEntryIds));
    }
    await db
      .delete(schema.balances)
      .where(inArray(schema.balances.walletId, [holdingWalletId, routineWalletId]));
    await db
      .delete(schema.wallets)
      .where(inArray(schema.wallets.id, [holdingWalletId, routineWalletId]));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await pool.end();
  });

  async function setBalance(
    walletId: string,
    available: bigint,
    pending = 0n,
  ) {
    await db
      .update(schema.balances)
      .set({ available, pending })
      .where(
        and(
          eq(schema.balances.walletId, walletId),
          eq(schema.balances.currency, 'USDC'),
        ),
      );
  }

  describe('reserve', () => {
    it('moves funds from available to pending', async () => {
      await setBalance(holdingWalletId, 100_000_000n);
      await ledger.reserve(db, holdingWalletId, 'USDC', 25_000_000n);

      const balance = await ledger.availableBalance(holdingWalletId, 'USDC');
      expect(balance.available).toBe(75_000_000n);
      expect(balance.pending).toBe(25_000_000n);
    });

    it('refuses a reservation larger than the available balance', async () => {
      await setBalance(holdingWalletId, 10_000_000n);
      await expect(
        ledger.reserve(db, holdingWalletId, 'USDC', 10_000_001n),
      ).rejects.toBeInstanceOf(BadRequestException);

      const balance = await ledger.availableBalance(holdingWalletId, 'USDC');
      expect(balance.available).toBe(10_000_000n);
      expect(balance.pending).toBe(0n);
    });

    it('lets only one of two concurrent reservations win the same funds', async () => {
      await setBalance(holdingWalletId, 30_000_000n);

      const results = await Promise.allSettled([
        ledger.reserve(db, holdingWalletId, 'USDC', 20_000_000n),
        ledger.reserve(db, holdingWalletId, 'USDC', 20_000_000n),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled).toHaveLength(1);

      const balance = await ledger.availableBalance(holdingWalletId, 'USDC');
      expect(balance.available).toBe(10_000_000n);
      expect(balance.pending).toBe(20_000_000n);
    });

    it('never leaves a negative available balance under load', async () => {
      await setBalance(holdingWalletId, 50_000_000n);

      await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          ledger.reserve(db, holdingWalletId, 'USDC', 10_000_000n),
        ),
      );

      const balance = await ledger.availableBalance(holdingWalletId, 'USDC');
      expect(balance.available).toBeGreaterThanOrEqual(0n);
      expect(balance.available + balance.pending).toBe(50_000_000n);
    });
  });

  describe('releaseReservation', () => {
    it('returns reserved funds to available', async () => {
      await setBalance(holdingWalletId, 0n, 25_000_000n);
      await ledger.releaseReservation(db, holdingWalletId, 'USDC', 25_000_000n);

      const balance = await ledger.availableBalance(holdingWalletId, 'USDC');
      expect(balance.available).toBe(25_000_000n);
      expect(balance.pending).toBe(0n);
    });

    it('refuses to release more than is reserved', async () => {
      await setBalance(holdingWalletId, 0n, 5_000_000n);
      await expect(
        ledger.releaseReservation(db, holdingWalletId, 'USDC', 6_000_000n),
      ).rejects.toThrow(/no longer available/);
    });
  });

  describe('consumeReservation', () => {
    it('removes pending funds without crediting them back', async () => {
      await setBalance(holdingWalletId, 10_000_000n, 25_000_000n);
      await ledger.consumeReservation(db, holdingWalletId, 'USDC', 25_000_000n);

      const balance = await ledger.availableBalance(holdingWalletId, 'USDC');
      expect(balance.available).toBe(10_000_000n);
      expect(balance.pending).toBe(0n);
    });
  });

  describe('credit', () => {
    it('increases the available balance', async () => {
      await setBalance(routineWalletId, 1_000_000n);
      await ledger.credit(db, routineWalletId, 'USDC', 4_000_000n);

      const balance = await ledger.availableBalance(routineWalletId, 'USDC');
      expect(balance.available).toBe(5_000_000n);
    });

    it('refuses to credit a currency the wallet has no balance record for', async () => {
      await expect(
        ledger.credit(db, routineWalletId, 'EURC', 1_000_000n),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('recordOnce', () => {
    it('writes a ledger entry for the operation', async () => {
      const operationId = randomUUID();
      const result = await ledger.recordOnce(db, {
        operationId,
        debitWalletId: holdingWalletId,
        creditWalletId: routineWalletId,
        amount: 25_000_000n,
        currency: 'USDC',
        type: 'internal',
        chainSignature: 'sig-abc',
      });
      ledgerEntryIds.push(result.ledgerEntryId);

      expect(result.created).toBe(true);

      const [entry] = await db
        .select()
        .from(schema.ledgerEntries)
        .where(eq(schema.ledgerEntries.id, result.ledgerEntryId));
      expect(entry.amount).toBe(25_000_000n);
      expect(entry.solanaTxSignature).toBe('sig-abc');
      expect(entry.idempotencyKey).toBe(`operation:${operationId}`);
    });

    it('does not write a second entry for the same operation', async () => {
      const operationId = randomUUID();
      const params = {
        operationId,
        debitWalletId: holdingWalletId,
        creditWalletId: routineWalletId,
        amount: 25_000_000n,
        currency: 'USDC',
        type: 'internal',
      };

      const first = await ledger.recordOnce(db, params);
      const second = await ledger.recordOnce(db, params);
      ledgerEntryIds.push(first.ledgerEntryId);

      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.ledgerEntryId).toBe(first.ledgerEntryId);

      const entries = await db
        .select()
        .from(schema.ledgerEntries)
        .where(
          eq(schema.ledgerEntries.idempotencyKey, `operation:${operationId}`),
        );
      expect(entries).toHaveLength(1);
    });

    it('writes exactly one entry when the same operation finalizes concurrently', async () => {
      const operationId = randomUUID();
      const params = {
        operationId,
        debitWalletId: holdingWalletId,
        creditWalletId: routineWalletId,
        amount: 7_000_000n,
        currency: 'USDC',
        type: 'internal',
      };

      const results = await Promise.all([
        ledger.recordOnce(db, params),
        ledger.recordOnce(db, params),
        ledger.recordOnce(db, params),
      ]);
      ledgerEntryIds.push(results[0].ledgerEntryId);

      expect(results.filter((r) => r.created)).toHaveLength(1);
      expect(new Set(results.map((r) => r.ledgerEntryId)).size).toBe(1);
    });
  });

  describe('transactional safety', () => {
    it('rolls the balance back when the surrounding transaction fails', async () => {
      await setBalance(holdingWalletId, 40_000_000n);

      await expect(
        ledger.transaction(async (tx) => {
          await ledger.reserve(tx, holdingWalletId, 'USDC', 40_000_000n);
          throw new Error('chain submission failed');
        }),
      ).rejects.toThrow('chain submission failed');

      const balance = await ledger.availableBalance(holdingWalletId, 'USDC');
      expect(balance.available).toBe(40_000_000n);
      expect(balance.pending).toBe(0n);
    });
  });
});
