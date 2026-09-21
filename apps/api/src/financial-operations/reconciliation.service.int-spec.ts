import { ConfigService } from '@nestjs/config';
import { eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import {
  connectTestDatabase,
  type TestDatabase,
} from '../database/testing/test-database';
import * as schema from '../database/schema';
import { ReconciliationService } from './reconciliation.service';
import { FinancialOperationsService } from './financial-operations.service';
import type { SolanaService } from '../solana/solana.service';

/**
 * X.10 — the reconciler reading real rows.
 *
 * The chain read is stubbed: the point of these cases is that the reconciler
 * assembles the right inputs from the database and draws the right conclusion,
 * including for states (a stranded balance, an unreachable RPC) that cannot be
 * produced on devnet to order.
 */
describe('ReconciliationService (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let service: ReconciliationService;
  let operations: FinancialOperationsService;

  let userId: string;
  let holdingWalletId: string;
  let routineWalletId: string;
  let holdingAddress: string;
  let routineAddress: string;
  const operationIds: string[] = [];

  /** What the stubbed chain reports, per address. */
  let chainBalances: Record<string, bigint | null> = {};

  const solana = {
    readTokenBalance: async (address: string) => {
      const value = chainBalances[address];
      return value === null || value === undefined
        ? { baseUnits: null, reason: 'rpc unavailable' }
        : { baseUnits: value };
    },
  } as unknown as SolanaService;

  beforeAll(async () => {
    const connection = await connectTestDatabase();
    db = connection.db;
    pool = connection.pool;
    operations = new FinancialOperationsService(db);
    service = new ReconciliationService(db, solana, new ConfigService());

    const suffix = randomUUID().slice(0, 8);
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `recon-${suffix}@mcbuse.test`,
        passwordHash: 'integration-test-not-a-real-hash',
        firstName: 'Recon',
        lastName: 'Ciliation',
        username: `recon${suffix}`,
      })
      .returning({ id: schema.users.id });
    userId = user.id;

    holdingAddress = `recon-holding-${suffix}`;
    routineAddress = `recon-routine-${suffix}`;

    const inserted = await db
      .insert(schema.wallets)
      .values([
        {
          userId,
          type: 'savings',
          solanaPubkey: holdingAddress,
          encryptedKeypair: 'v1:00:00:00',
          encryptionKeyVersion: 'v1',
        },
        {
          userId,
          type: 'routine',
          solanaPubkey: routineAddress,
          encryptedKeypair: 'v1:00:00:00',
          encryptionKeyVersion: 'v1',
        },
      ])
      .returning({ id: schema.wallets.id, type: schema.wallets.type });
    holdingWalletId = inserted.find((w) => w.type === 'savings')!.id;
    routineWalletId = inserted.find((w) => w.type === 'routine')!.id;

    await db.insert(schema.balances).values([
      { walletId: holdingWalletId, currency: 'USDC', available: 5_000_000n },
      { walletId: holdingWalletId, currency: 'EURC' },
      { walletId: routineWalletId, currency: 'USDC' },
      { walletId: routineWalletId, currency: 'EURC' },
    ]);
  });

  async function clearOperations() {
    if (!operationIds.length) return;
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

  beforeEach(async () => {
    await clearOperations();
    chainBalances = {
      [holdingAddress]: 5_000_000n,
      [routineAddress]: 0n,
    };
    await db
      .update(schema.balances)
      .set({ available: 5_000_000n, pending: 0n })
      .where(eq(schema.balances.walletId, holdingWalletId));
    await db
      .update(schema.balances)
      .set({ available: 0n, pending: 0n })
      .where(eq(schema.balances.walletId, routineWalletId));
  });

  afterAll(async () => {
    await clearOperations();
    await db
      .delete(schema.balances)
      .where(
        inArray(schema.balances.walletId, [holdingWalletId, routineWalletId]),
      );
    await db
      .delete(schema.wallets)
      .where(inArray(schema.wallets.id, [holdingWalletId, routineWalletId]));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await pool.end();
  });

  async function inFlightTransfer(
    status: string,
    amountBaseUnits = 1_000_000n,
  ) {
    const { operation } = await operations.begin({
      userId,
      kind: 'internal_transfer',
      idempotencyKey: randomUUID(),
      amountBaseUnits,
      currency: 'USDC',
      sourceWalletId: holdingWalletId,
      destinationWalletId: routineWalletId,
      displayAmountMinor: amountBaseUnits / 10_000n,
      displayCurrency: 'USD',
    });
    operationIds.push(operation.id);
    await db
      .update(schema.financialOperations)
      .set({ status })
      .where(eq(schema.financialOperations.id, operation.id));
    return operation.id;
  }

  const walletsOnly = () => ({
    walletIds: [holdingWalletId, routineWalletId],
  });

  it('reports a healthy platform when the books and the chain agree', async () => {
    const report = await service.reconcile(walletsOnly());

    expect(report.healthy).toBe(true);
    expect(report.unexplained).toHaveLength(0);
    expect(report.wallets.map((w) => w.status)).toEqual([
      'reconciled',
      'reconciled',
    ]);
  });

  it('finds tokens the chain is missing that nothing accounts for', async () => {
    chainBalances[holdingAddress] = 4_000_000n;

    const report = await service.reconcile(walletsOnly());

    expect(report.healthy).toBe(false);
    expect(report.unexplained).toHaveLength(1);
    expect(report.unexplained[0].walletId).toBe(holdingWalletId);
    expect(report.unexplained[0].unexplainedBaseUnits).toBe(-1_000_000n);
  });

  it('accepts the same gap once an in-flight transfer explains it', async () => {
    // Reserved and broadcast: the tokens have left, the ledger still holds them.
    await inFlightTransfer('chain_submitted');
    await db
      .update(schema.balances)
      .set({ available: 4_000_000n, pending: 1_000_000n })
      .where(eq(schema.balances.walletId, holdingWalletId));
    chainBalances[holdingAddress] = 4_000_000n;

    const report = await service.reconcile(walletsOnly());

    const holding = report.wallets.find((w) => w.walletId === holdingWalletId)!;
    expect(holding.status).toBe('in_flight');
    expect(holding.unexplainedBaseUnits).toBe(0n);
    expect(report.healthy).toBe(true);
  });

  it('still finds a real gap sitting behind an in-flight transfer', async () => {
    await inFlightTransfer('chain_submitted');
    await db
      .update(schema.balances)
      .set({ available: 4_000_000n, pending: 1_000_000n })
      .where(eq(schema.balances.walletId, holdingWalletId));
    chainBalances[holdingAddress] = 3_500_000n;

    const report = await service.reconcile(walletsOnly());

    const holding = report.wallets.find((w) => w.walletId === holdingWalletId)!;
    expect(holding.status).toBe('unexplained');
    expect(holding.unexplainedBaseUnits).toBe(-500_000n);
  });

  it('names the operation behind an accepted difference', async () => {
    const operationId = await inFlightTransfer('chain_submitted');
    await db
      .update(schema.balances)
      .set({ available: 4_000_000n, pending: 1_000_000n })
      .where(eq(schema.balances.walletId, holdingWalletId));
    chainBalances[holdingAddress] = 4_000_000n;

    const report = await service.reconcile(walletsOnly());
    const holding = report.wallets.find((w) => w.walletId === holdingWalletId)!;
    expect(holding.explanations.join(' ')).toContain(operationId);
  });

  it('reports an unreadable chain as unknown rather than as a discrepancy', async () => {
    chainBalances[holdingAddress] = null;

    const report = await service.reconcile(walletsOnly());
    const holding = report.wallets.find((w) => w.walletId === holdingWalletId)!;

    expect(holding.status).toBe('chain_unavailable');
    expect(holding.differenceBaseUnits).toBeNull();
    expect(report.healthy).toBe(false);
  });

  it('flags an operation that has stopped moving', async () => {
    const operationId = await inFlightTransfer('chain_submitted');
    await db
      .update(schema.financialOperations)
      .set({ updatedAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where(eq(schema.financialOperations.id, operationId));
    await db
      .update(schema.balances)
      .set({ available: 4_000_000n, pending: 1_000_000n })
      .where(eq(schema.balances.walletId, holdingWalletId));
    chainBalances[holdingAddress] = 4_000_000n;

    const report = await service.reconcile({
      ...walletsOnly(),
      stuckThresholdMs: 15 * 60 * 1000,
    });

    expect(report.stuck.map((o) => o.id)).toContain(operationId);
    expect(report.healthy).toBe(false);
  });

  it('does not call recent work stuck', async () => {
    await inFlightTransfer('chain_submitted');
    await db
      .update(schema.balances)
      .set({ available: 4_000_000n, pending: 1_000_000n })
      .where(eq(schema.balances.walletId, holdingWalletId));
    chainBalances[holdingAddress] = 4_000_000n;

    const report = await service.reconcile({
      ...walletsOnly(),
      stuckThresholdMs: 15 * 60 * 1000,
    });
    expect(report.stuck).toHaveLength(0);
  });

  it('sees the destination side of a confirmed but uncredited transfer', async () => {
    await inFlightTransfer('chain_confirmed');
    await db
      .update(schema.balances)
      .set({ available: 4_000_000n, pending: 1_000_000n })
      .where(eq(schema.balances.walletId, holdingWalletId));
    chainBalances[holdingAddress] = 4_000_000n;
    chainBalances[routineAddress] = 1_000_000n;

    const report = await service.reconcile(walletsOnly());
    const routine = report.wallets.find((w) => w.walletId === routineWalletId)!;

    expect(routine.status).toBe('in_flight');
    expect(routine.unexplainedBaseUnits).toBe(0n);
    expect(report.healthy).toBe(true);
  });

  it('closes the difference once the operation finalizes', async () => {
    const operationId = await inFlightTransfer('chain_confirmed');
    await db
      .update(schema.balances)
      .set({ available: 4_000_000n, pending: 1_000_000n })
      .where(eq(schema.balances.walletId, holdingWalletId));
    chainBalances[holdingAddress] = 4_000_000n;
    chainBalances[routineAddress] = 1_000_000n;

    // Recovery: the ledger settles and the operation leaves the in-flight set.
    await db
      .update(schema.balances)
      .set({ available: 4_000_000n, pending: 0n })
      .where(eq(schema.balances.walletId, holdingWalletId));
    await db
      .update(schema.balances)
      .set({ available: 1_000_000n })
      .where(eq(schema.balances.walletId, routineWalletId));
    await db
      .update(schema.financialOperations)
      .set({ status: 'finalized' })
      .where(eq(schema.financialOperations.id, operationId));

    const report = await service.reconcile(walletsOnly());
    expect(report.wallets.every((w) => w.status === 'reconciled')).toBe(true);
    expect(report.healthy).toBe(true);
  });
});
