/**
 * Proves an internal transfer end to end against Solana devnet.
 *
 * This is deliberately not mocked. The whole point of the plan's settlement
 * requirement is that tokens genuinely move, so this suite funds two real
 * wallets from the treasury, runs the transfer, and reads the resulting
 * balances back off the chain.
 *
 * Run with: pnpm --filter api test:devnet
 */
import { ConfigService } from '@nestjs/config';
import { Keypair } from '@solana/web3.js';
import { eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import {
  connectTestDatabase,
  type TestDatabase,
} from '../database/testing/test-database';
import * as schema from '../database/schema';
import { SolanaService } from '../solana/solana.service';
import { TreasuryService } from '../treasury/treasury.service';
import { FinancialOperationsService } from '../financial-operations/financial-operations.service';
import { OperationLedgerService } from '../financial-operations/operation-ledger.service';
import { AccountWalletsService } from './account-wallets.service';
import { AccountTransferService } from './account-transfer.service';

const TRANSFER_USD_CENTS = 25n; // 0.25 USDC — small enough to repeat cheaply

describe('account transfer on devnet', () => {
  let db: TestDatabase;
  let pool: Pool;
  let solana: SolanaService;
  let treasury: TreasuryService;
  let transfers: AccountTransferService;
  let operations: FinancialOperationsService;
  let wallets: AccountWalletsService;

  let userId: string;
  let holdingWalletId: string;
  let routineWalletId: string;
  let holdingAddress: string;
  let routineAddress: string;
  const operationIds: string[] = [];

  beforeAll(async () => {
    const connection = await connectTestDatabase();
    db = connection.db;
    pool = connection.pool;

    const config = new ConfigService();
    solana = new SolanaService(config);
    solana.onModuleInit();
    treasury = new TreasuryService(config, solana);
    treasury.onModuleInit();

    if (!treasury.isConfigured) {
      throw new Error(
        'SOLANA_TREASURY_SECRET_KEY must be set for devnet tests',
      );
    }

    operations = new FinancialOperationsService(db);
    const ledger = new OperationLedgerService(db);
    wallets = new AccountWalletsService(db);
    transfers = new AccountTransferService(
      solana,
      config,
      treasury,
      operations,
      ledger,
      wallets,
    );

    // Two genuinely new wallets, sealed the same way the platform seals them.
    const suffix = randomUUID().slice(0, 8);
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `devnet-${suffix}@mcbuse.test`,
        passwordHash: 'integration-test-not-a-real-hash',
        firstName: 'Devnet',
        lastName: 'Transfer',
        username: `devnet${suffix}`,
      })
      .returning({ id: schema.users.id });
    userId = user.id;

    const holdingKeypair = Keypair.generate();
    const routineKeypair = Keypair.generate();
    holdingAddress = holdingKeypair.publicKey.toBase58();
    routineAddress = routineKeypair.publicKey.toBase58();

    const inserted = await db
      .insert(schema.wallets)
      .values([
        {
          userId,
          type: 'savings',
          solanaPubkey: holdingAddress,
          encryptedKeypair: solana.encryptKeypair(holdingKeypair.secretKey),
          encryptionKeyVersion: solana.currentKeyVersion,
        },
        {
          userId,
          type: 'routine',
          solanaPubkey: routineAddress,
          encryptedKeypair: solana.encryptKeypair(routineKeypair.secretKey),
          encryptionKeyVersion: solana.currentKeyVersion,
        },
      ])
      .returning({ id: schema.wallets.id, type: schema.wallets.type });
    holdingWalletId = inserted.find((w) => w.type === 'savings')!.id;
    routineWalletId = inserted.find((w) => w.type === 'routine')!.id;

    await db.insert(schema.balances).values([
      {
        walletId: holdingWalletId,
        currency: 'USDC',
        available: 0n,
        pending: 0n,
      },
      {
        walletId: routineWalletId,
        currency: 'USDC',
        available: 0n,
        pending: 0n,
      },
    ]);

    // Deliver real tokens to Holding, exactly as a funding operation would.
    const funding = await treasury.sendUsdcTo(holdingAddress, 1_000_000n);
    if (funding.status !== 'completed') {
      throw new Error(`Treasury funding did not complete: ${funding.status}`);
    }
    await db
      .update(schema.balances)
      .set({ available: 1_000_000n })
      .where(eq(schema.balances.walletId, holdingWalletId));
  }, 180_000);

  afterAll(async () => {
    const walletIds = [holdingWalletId, routineWalletId];

    // Clean up by wallet reference, not by the ids the tests happened to
    // track: a rejected request still leaves its durable failure record.
    const strandedOperations = await db
      .select({ id: schema.financialOperations.id })
      .from(schema.financialOperations)
      .where(eq(schema.financialOperations.userId, userId));
    const allOperationIds = [
      ...new Set([...operationIds, ...strandedOperations.map((o) => o.id)]),
    ];
    if (allOperationIds.length) {
      await db
        .delete(schema.financialOperationEvents)
        .where(
          inArray(schema.financialOperationEvents.operationId, allOperationIds),
        );
      await db
        .delete(schema.financialOperations)
        .where(inArray(schema.financialOperations.id, allOperationIds));
    }
    await db
      .delete(schema.ledgerEntries)
      .where(inArray(schema.ledgerEntries.debitWalletId, walletIds));
    await db
      .delete(schema.ledgerEntries)
      .where(inArray(schema.ledgerEntries.creditWalletId, walletIds));
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
  }, 60_000);

  it('moves real test USDC from Holding to Routine and finalizes once', async () => {
    const mint = process.env.SOLANA_USDC_MINT!;
    const holdingBefore = await solana.getTokenBalance(holdingAddress, mint);
    const routineBefore = await solana.getTokenBalance(routineAddress, mint);

    const started = await transfers.startTransfer({
      userId,
      from: 'holding',
      to: 'routine',
      amountCents: TRANSFER_USD_CENTS,
      idempotencyKey: randomUUID(),
    });
    operationIds.push(started.operationId);
    expect(started.status).toBe('reserved');

    // Funds are held, not yet gone.
    const afterReserve = await db
      .select()
      .from(schema.balances)
      .where(eq(schema.balances.walletId, holdingWalletId));
    expect(afterReserve[0].pending).toBe(250_000n);

    await transfers.submitChainTransfer(
      await operations.require(started.operationId),
    );

    const confirmed = await operations.require(started.operationId);
    expect(confirmed.status).toBe('chain_confirmed');
    expect(confirmed.chainSignature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{64,}$/);

    await transfers.finalize(confirmed);

    const finalized = await operations.require(started.operationId);
    expect(finalized.status).toBe('finalized');
    expect(finalized.ledgerEntryId).toBeTruthy();

    // The ledger agrees with the chain.
    const holdingAfter = await solana.getTokenBalance(holdingAddress, mint);
    const routineAfter = await solana.getTokenBalance(routineAddress, mint);
    expect(holdingBefore - holdingAfter).toBe(250_000n);
    expect(routineAfter - routineBefore).toBe(250_000n);

    const balances = await db
      .select()
      .from(schema.balances)
      .where(
        inArray(schema.balances.walletId, [holdingWalletId, routineWalletId]),
      );
    const holdingBalance = balances.find(
      (b) => b.walletId === holdingWalletId,
    )!;
    const routineBalance = balances.find(
      (b) => b.walletId === routineWalletId,
    )!;
    expect(holdingBalance.pending).toBe(0n);
    expect(holdingBalance.available).toBe(750_000n);
    expect(routineBalance.available).toBe(250_000n);

    console.log(
      `devnet transfer signature: ${finalized.chainSignature} (https://explorer.solana.com/tx/${finalized.chainSignature}?cluster=devnet)`,
    );
  }, 180_000);

  it('does not move tokens twice when finalize is repeated', async () => {
    const mint = process.env.SOLANA_USDC_MINT!;
    const operation = await operations.require(operationIds[0]);
    const routineBefore = await solana.getTokenBalance(routineAddress, mint);

    // Already finalized: this must be a no-op rather than a second transfer.
    await transfers.finalize(operation);

    const routineAfter = await solana.getTokenBalance(routineAddress, mint);
    expect(routineAfter).toBe(routineBefore);

    const entries = await db
      .select()
      .from(schema.ledgerEntries)
      .where(
        eq(schema.ledgerEntries.idempotencyKey, `operation:${operation.id}`),
      );
    expect(entries).toHaveLength(1);
  }, 60_000);

  it('refuses a transfer larger than the available balance', async () => {
    await expect(
      transfers.startTransfer({
        userId,
        from: 'holding',
        to: 'routine',
        amountCents: 100_000n,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow(/insufficient/i);
  }, 60_000);
});
