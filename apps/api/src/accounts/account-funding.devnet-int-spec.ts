/**
 * Proves the settlement half of funding against Solana devnet.
 *
 * Stripe collecting the fiat is a separate concern, verified separately with a
 * real hosted Checkout. What this suite proves is the part that only the chain
 * can answer: once a collection has settled, the treasury genuinely delivers
 * the tokens, and the balance is credited exactly once.
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
import { StripeClient } from '../stripe/stripe.client';
import { FinancialOperationsService } from '../financial-operations/financial-operations.service';
import { OperationLedgerService } from '../financial-operations/operation-ledger.service';
import { AccountWalletsService } from './account-wallets.service';
import { AccountFundingService } from './account-funding.service';
import { sweepBackToTreasury } from './testing/devnet-sweep';
import { assertNoCompetingRunner } from './testing/assert-exclusive-runner';

const FUNDING_CENTS = 30n; // 0.30 USD

describe('account funding settlement on devnet', () => {
  let db: TestDatabase;
  let pool: Pool;
  let solana: SolanaService;
  let treasury: TreasuryService;
  let funding: AccountFundingService;
  let operations: FinancialOperationsService;

  let userId: string;
  let holdingWalletId: string;
  let routineWalletId: string;
  let holdingAddress: string;
  const throwawayKeypairs: Keypair[] = [];

  beforeAll(async () => {
    await assertNoCompetingRunner();
    const connection = await connectTestDatabase();
    db = connection.db;
    pool = connection.pool;

    const config = new ConfigService();
    solana = new SolanaService(config);
    solana.onModuleInit();
    treasury = new TreasuryService(config, solana);
    treasury.onModuleInit();

    operations = new FinancialOperationsService(db);
    const ledger = new OperationLedgerService(db);
    const wallets = new AccountWalletsService(db);
    funding = new AccountFundingService(
      new StripeClient(config),
      config,
      treasury,
      operations,
      ledger,
      wallets,
    );

    const suffix = randomUUID().slice(0, 8);
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `fund-devnet-${suffix}@mcbuse.test`,
        passwordHash: 'integration-test-not-a-real-hash',
        firstName: 'Fund',
        lastName: 'Devnet',
        username: `funddev${suffix}`,
      })
      .returning({ id: schema.users.id });
    userId = user.id;

    const holdingKeypair = Keypair.generate();
    const routineKeypair = Keypair.generate();
    throwawayKeypairs.push(holdingKeypair, routineKeypair);
    holdingAddress = holdingKeypair.publicKey.toBase58();

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
          solanaPubkey: routineKeypair.publicKey.toBase58(),
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
  }, 180_000);

  afterAll(async () => {
    // Give the test tokens back before dropping the wallets.
    const swept = await sweepBackToTreasury(
      solana,
      treasury,
      throwawayKeypairs,
    );
    if (swept.length) {
      console.log(`returned ${swept.length} test balance(s) to the treasury`);
    }

    const walletIds = [holdingWalletId, routineWalletId];
    const ours = await db
      .select({ id: schema.financialOperations.id })
      .from(schema.financialOperations)
      .where(eq(schema.financialOperations.userId, userId));
    const ids = ours.map((o) => o.id);
    if (ids.length) {
      await db
        .delete(schema.financialOperationEvents)
        .where(inArray(schema.financialOperationEvents.operationId, ids));
      await db
        .delete(schema.financialOperations)
        .where(inArray(schema.financialOperations.id, ids));
    }
    await db
      .delete(schema.ledgerEntries)
      .where(inArray(schema.ledgerEntries.debitWalletId, walletIds));
    await db
      .delete(schema.ledgerEntries)
      .where(inArray(schema.ledgerEntries.creditWalletId, walletIds));
    await db
      .delete(schema.balances)
      .where(inArray(schema.balances.walletId, walletIds));
    await db
      .delete(schema.wallets)
      .where(inArray(schema.wallets.id, walletIds));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await pool.end();
  }, 60_000);

  it('delivers tokens from the treasury and credits Holding exactly once', async () => {
    const mint = process.env.SOLANA_USDC_MINT!;

    // Stand the operation up at the point a settled collection leaves it.
    const { operation } = await operations.begin({
      userId,
      kind: 'funding_card',
      idempotencyKey: randomUUID(),
      amountBaseUnits: 300_000n,
      currency: 'USDC',
      destinationWalletId: holdingWalletId,
      displayAmountMinor: FUNDING_CENTS,
      displayCurrency: 'USD',
      provider: 'stripe',
    });
    await operations.advance(operation.id, 'collection_pending', {
      providerRef: `cs_test_devnet_${randomUUID().slice(0, 8)}`,
    });
    await operations.advance(operation.id, 'collection_settled', {
      collectionSettledAt: new Date(),
    });

    const treasuryBefore = await treasury.usdcBalanceBaseUnits();
    const holdingBefore = await solana.getTokenBalance(holdingAddress, mint);

    await funding.deliverTokens(await operations.require(operation.id));

    const confirmed = await operations.require(operation.id);
    expect(confirmed.status).toBe('chain_confirmed');
    expect(confirmed.chainSignature).toBeTruthy();

    // The tokens genuinely left the treasury and arrived.
    const treasuryAfter = await treasury.usdcBalanceBaseUnits();
    const holdingAfter = await solana.getTokenBalance(holdingAddress, mint);
    expect(treasuryBefore - treasuryAfter).toBe(300_000n);
    expect(holdingAfter - holdingBefore).toBe(300_000n);

    // The balance is credited only when the ledger is written.
    const beforeFinalize = await db
      .select()
      .from(schema.balances)
      .where(eq(schema.balances.walletId, holdingWalletId));
    expect(beforeFinalize[0].available).toBe(0n);

    await funding.finalize(confirmed);

    const finalized = await operations.require(operation.id);
    expect(finalized.status).toBe('finalized');

    const afterFinalize = await db
      .select()
      .from(schema.balances)
      .where(eq(schema.balances.walletId, holdingWalletId));
    expect(afterFinalize[0].available).toBe(300_000n);

    // Repeating finalize must not credit twice.
    await funding.finalize(confirmed);
    const afterRepeat = await db
      .select()
      .from(schema.balances)
      .where(eq(schema.balances.walletId, holdingWalletId));
    expect(afterRepeat[0].available).toBe(300_000n);

    const entries = await db
      .select()
      .from(schema.ledgerEntries)
      .where(
        eq(schema.ledgerEntries.idempotencyKey, `operation:${operation.id}`),
      );
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('on_ramp');

    console.log(
      `devnet funding signature: ${finalized.chainSignature} (https://explorer.solana.com/tx/${finalized.chainSignature}?cluster=devnet)`,
    );
  }, 180_000);

  it('does not deliver tokens for a collection that never settled', async () => {
    const mint = process.env.SOLANA_USDC_MINT!;
    const holdingBefore = await solana.getTokenBalance(holdingAddress, mint);

    const { operation } = await operations.begin({
      userId,
      kind: 'funding_bank',
      idempotencyKey: randomUUID(),
      amountBaseUnits: 100_000n,
      currency: 'USDC',
      destinationWalletId: holdingWalletId,
      provider: 'stripe',
    });
    await operations.advance(operation.id, 'collection_pending', {
      providerRef: `cs_test_unpaid_${randomUUID().slice(0, 8)}`,
    });

    // A bank debit that was submitted but not paid must move nothing.
    await funding.deliverTokens(await operations.require(operation.id));

    const still = await operations.require(operation.id);
    expect(still.status).toBe('collection_pending');
    expect(await solana.getTokenBalance(holdingAddress, mint)).toBe(
      holdingBefore,
    );
  }, 120_000);

  it('fails a bank collection that Stripe reports as failed', async () => {
    const sessionId = `cs_test_failed_${randomUUID().slice(0, 8)}`;
    const { operation } = await operations.begin({
      userId,
      kind: 'funding_bank',
      idempotencyKey: randomUUID(),
      amountBaseUnits: 100_000n,
      currency: 'USDC',
      destinationWalletId: holdingWalletId,
      provider: 'stripe',
    });
    await operations.advance(operation.id, 'collection_pending', {
      providerRef: sessionId,
    });

    await funding.applyCheckoutEvent({
      sessionId,
      eventType: 'checkout.session.async_payment_failed',
      paymentStatus: 'unpaid',
    });

    const failed = await operations.require(operation.id);
    expect(failed.status).toBe('failed');
    expect(failed.failureCode).toBe('collection_failed');
  }, 60_000);

  it('does not log an event for each poll that finds no change', async () => {
    const sessionId = `cs_test_quiet_${randomUUID().slice(0, 8)}`;
    const { operation } = await operations.begin({
      userId,
      kind: 'funding_card',
      idempotencyKey: randomUUID(),
      amountBaseUnits: 100_000n,
      currency: 'USDC',
      destinationWalletId: holdingWalletId,
      provider: 'stripe',
    });
    await operations.advance(operation.id, 'collection_pending', {
      providerRef: sessionId,
    });

    const countEvents = async () => {
      const rows = await db
        .select()
        .from(schema.financialOperationEvents)
        .where(eq(schema.financialOperationEvents.operationId, operation.id));
      return rows.length;
    };

    const before = await countEvents();

    // Ten polls of an unchanged unpaid session.
    for (let i = 0; i < 10; i += 1) {
      await funding.applyCheckoutEvent({
        sessionId,
        eventType: 'polled',
        paymentStatus: 'unpaid',
      });
    }

    // The first poll records the status; the rest add nothing.
    expect(await countEvents()).toBe(before + 1);

    // A genuine change is still recorded.
    await funding.applyCheckoutEvent({
      sessionId,
      eventType: 'polled',
      paymentStatus: 'no_payment_required',
    });
    expect(await countEvents()).toBe(before + 2);
  }, 60_000);
});
