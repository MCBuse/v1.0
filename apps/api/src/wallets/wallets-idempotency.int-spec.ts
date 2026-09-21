import { ConflictException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import {
  connectTestDatabase,
  type TestDatabase,
} from '../database/testing/test-database';
import * as schema from '../database/schema';
import { WalletsService } from './wallets.service';
import type { SolanaService } from '../solana/solana.service';
import type { LedgerService } from '../ledger/ledger.service';

/**
 * A custodial move between a person's own wallets is still a money movement:
 * a retried request must never move it twice. These run against a real
 * Postgres because the guarantee is the ledger's unique index under
 * concurrency, which no mock can demonstrate.
 */
describe('WalletsService internal transfer idempotency (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let service: WalletsService;
  let userId: string;
  let savingsWalletId: string;
  let routineWalletId: string;

  const START = 10_000_000n; // 10 USDC in base units

  async function resetBalances() {
    await db.delete(schema.ledgerEntries).where(
      inArray(schema.ledgerEntries.debitWalletId, [
        savingsWalletId,
        routineWalletId,
      ]),
    );
    await db
      .update(schema.balances)
      .set({ available: START })
      .where(eq(schema.balances.walletId, savingsWalletId));
    await db
      .update(schema.balances)
      .set({ available: 0n })
      .where(eq(schema.balances.walletId, routineWalletId));
  }

  async function available(walletId: string): Promise<bigint> {
    const [row] = await db
      .select({ available: schema.balances.available })
      .from(schema.balances)
      .where(
        and(
          eq(schema.balances.walletId, walletId),
          eq(schema.balances.currency, 'USDC'),
        ),
      )
      .limit(1);
    return row.available;
  }

  async function ledgerCount(): Promise<number> {
    const rows = await db
      .select({ id: schema.ledgerEntries.id })
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.debitWalletId, savingsWalletId));
    return rows.length;
  }

  beforeAll(async () => {
    const connection = await connectTestDatabase();
    db = connection.db;
    pool = connection.pool;
    service = new WalletsService(
      db,
      // internalTransfer touches neither: it is a database-only movement
      // between two custodial wallets.
      null as unknown as SolanaService,
      null as unknown as LedgerService,
    );

    const suffix = randomUUID().slice(0, 8);
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `wallet-idem-${suffix}@mcbuse.test`,
        passwordHash: 'integration-test-not-a-real-hash',
        firstName: 'Wallet',
        lastName: 'Idempotency',
        username: `walletidem${suffix}`,
      })
      .returning({ id: schema.users.id });
    userId = user.id;

    const wallets = await db
      .insert(schema.wallets)
      .values([
        {
          userId,
          type: 'savings',
          solanaPubkey: `idem-holding-${suffix}`,
          encryptedKeypair: 'v1:00:00:00',
          encryptionKeyVersion: 'v1',
        },
        {
          userId,
          type: 'routine',
          solanaPubkey: `idem-routine-${suffix}`,
          encryptedKeypair: 'v1:00:00:00',
          encryptionKeyVersion: 'v1',
        },
      ])
      .returning({ id: schema.wallets.id, type: schema.wallets.type });
    savingsWalletId = wallets.find((w) => w.type === 'savings')!.id;
    routineWalletId = wallets.find((w) => w.type === 'routine')!.id;

    await db.insert(schema.balances).values([
      { walletId: savingsWalletId, currency: 'USDC', available: START },
      { walletId: savingsWalletId, currency: 'EURC' },
      { walletId: routineWalletId, currency: 'USDC' },
      { walletId: routineWalletId, currency: 'EURC' },
    ]);
  });

  beforeEach(resetBalances);

  afterAll(async () => {
    await db
      .delete(schema.ledgerEntries)
      .where(
        inArray(schema.ledgerEntries.debitWalletId, [
          savingsWalletId,
          routineWalletId,
        ]),
      );
    await db
      .delete(schema.balances)
      .where(
        inArray(schema.balances.walletId, [savingsWalletId, routineWalletId]),
      );
    await db
      .delete(schema.wallets)
      .where(
        inArray(schema.wallets.id, [savingsWalletId, routineWalletId]),
      );
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await pool.end();
  });

  const move = (amount: string) => ({
    fromWalletType: 'savings',
    toWalletType: 'routine',
    amount,
    currency: 'USDC',
  });

  it('moves the money once when the same key is retried', async () => {
    const key = randomUUID();

    const first = await service.internalTransfer(userId, move('2500000'), key);
    const second = await service.internalTransfer(userId, move('2500000'), key);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.amount).toBe('2500000');
    expect(await available(savingsWalletId)).toBe(START - 2_500_000n);
    expect(await available(routineWalletId)).toBe(2_500_000n);
    expect(await ledgerCount()).toBe(1);
  });

  it('refuses the same key carrying different inputs', async () => {
    const key = randomUUID();
    await service.internalTransfer(userId, move('1000000'), key);

    await expect(
      service.internalTransfer(userId, move('9000000'), key),
    ).rejects.toBeInstanceOf(ConflictException);

    // The refusal must not have moved anything.
    expect(await available(savingsWalletId)).toBe(START - 1_000_000n);
    expect(await ledgerCount()).toBe(1);
  });

  it('treats a different direction under the same key as a different request', async () => {
    const key = randomUUID();
    await service.internalTransfer(userId, move('1000000'), key);

    await expect(
      service.internalTransfer(
        userId,
        {
          fromWalletType: 'routine',
          toWalletType: 'savings',
          amount: '1000000',
          currency: 'USDC',
        },
        key,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('leaves exactly one transfer when four identical requests race', async () => {
    const key = randomUUID();

    const outcomes = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        service.internalTransfer(userId, move('3000000'), key),
      ),
    );

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    expect(fulfilled).toHaveLength(4);
    expect(await ledgerCount()).toBe(1);
    expect(await available(savingsWalletId)).toBe(START - 3_000_000n);
    expect(await available(routineWalletId)).toBe(3_000_000n);
  });

  it('still lets two genuinely separate transfers through', async () => {
    await service.internalTransfer(userId, move('1000000'), randomUUID());
    await service.internalTransfer(userId, move('1000000'), randomUUID());

    expect(await ledgerCount()).toBe(2);
    expect(await available(routineWalletId)).toBe(2_000_000n);
  });

  it('namespaces the stored key per user, so keys cannot collide between people', async () => {
    const key = 'shared-key-across-people';
    await service.internalTransfer(userId, move('1000000'), key);

    const stored = await db
      .select({ key: schema.ledgerEntries.idempotencyKey })
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.debitWalletId, savingsWalletId));

    expect(stored[0].key).toBe(`wallet-transfer:${userId}:${key}`);
  });
});
