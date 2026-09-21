/**
 * Proves withdrawal end to end: real tokens returned to the treasury on
 * devnet, then a real Stripe sandbox payout.
 *
 * The second test is the one that matters most. It forces a payout to fail
 * *after* the tokens have already moved, which is the case the plan singles
 * out: the operation cannot simply be marked failed, and the balance must only
 * come back once the treasury's compensating transfer is confirmed.
 *
 * Requires a connected account with payout destinations; see
 * docs/plans/revised-merchant-plan-checklist.md for the ones in use.
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
import { AccountWithdrawalService } from './account-withdrawal.service';
import { PayoutDestinationsService } from './payout-destinations.service';
import { sweepBackToTreasury } from './testing/devnet-sweep';
import { assertNoCompetingRunner } from './testing/assert-exclusive-runner';

const CONNECTED_ACCOUNT = 'acct_1UHr638OsVu9qy2o';
const GOOD_BANK = 'ba_1UHr6e8OsVu9qy2oahQAuKmk';
const DEBIT_CARD = 'card_1UHr6Z8OsVu9qy2o1JkHBd8v';

const STARTING_BASE_UNITS = 1_000_000n; // 1.00 USDC
const WITHDRAW_CENTS = 25n; // 0.25 USD

describe('account withdrawal on devnet and Stripe sandbox', () => {
  let db: TestDatabase;
  let pool: Pool;
  let solana: SolanaService;
  let treasury: TreasuryService;
  let withdrawals: AccountWithdrawalService;
  let operations: FinancialOperationsService;
  let ledger: OperationLedgerService;
  let stripeClient: StripeClient;

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
    stripeClient = new StripeClient(config);

    operations = new FinancialOperationsService(db);
    ledger = new OperationLedgerService(db);
    const wallets = new AccountWalletsService(db);
    const destinations = new PayoutDestinationsService(db, stripeClient);
    withdrawals = new AccountWithdrawalService(
      solana,
      config,
      stripeClient,
      treasury,
      operations,
      ledger,
      wallets,
      destinations,
    );

    const suffix = randomUUID().slice(0, 8);
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `wd-devnet-${suffix}@mcbuse.test`,
        passwordHash: 'integration-test-not-a-real-hash',
        firstName: 'Withdraw',
        lastName: 'Devnet',
        username: `wddev${suffix}`,
        stripeAccountId: CONNECTED_ACCOUNT,
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

    // Give Holding real tokens to withdraw.
    const funded = await treasury.sendUsdcTo(
      holdingAddress,
      STARTING_BASE_UNITS,
    );
    if (funded.status !== 'completed') {
      throw new Error(`Could not fund the test wallet: ${funded.status}`);
    }
    await db
      .update(schema.balances)
      .set({ available: STARTING_BASE_UNITS })
      .where(eq(schema.balances.walletId, holdingWalletId));
  }, 240_000);

  afterAll(async () => {
    await sweepBackToTreasury(solana, treasury, throwawayKeypairs);

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
  }, 120_000);

  async function holdingBalance() {
    const [row] = await db
      .select()
      .from(schema.balances)
      .where(eq(schema.balances.walletId, holdingWalletId));
    return row;
  }

  it('returns tokens to the treasury before any payout is created', async () => {
    const mint = process.env.SOLANA_USDC_MINT!;
    const treasuryBefore = await treasury.usdcBalanceBaseUnits();
    const walletBefore = await solana.getTokenBalance(holdingAddress, mint);

    const started = await withdrawals.startWithdrawal({
      userId,
      destinationId: GOOD_BANK,
      amountCents: WITHDRAW_CENTS,
      idempotencyKey: randomUUID(),
    });
    expect(started.status).toBe('reserved');

    // Reserved, not yet gone.
    const reserved = await holdingBalance();
    expect(reserved.pending).toBe(250_000n);
    expect(reserved.available).toBe(STARTING_BASE_UNITS - 250_000n);

    await withdrawals.returnTokensToTreasury(
      await operations.require(started.operationId),
    );

    const confirmed = await operations.require(started.operationId);
    expect(confirmed.status).toBe('chain_confirmed');
    expect(confirmed.chainSignature).toBeTruthy();

    // The tokens genuinely came back before Stripe was involved at all.
    expect(await treasury.usdcBalanceBaseUnits()).toBe(
      treasuryBefore + 250_000n,
    );
    expect(await solana.getTokenBalance(holdingAddress, mint)).toBe(
      walletBefore - 250_000n,
    );
    expect(confirmed.providerRef).toBeNull();

    // Now the payout.
    await withdrawals.submitPayout(confirmed);

    const submitted = await operations.require(started.operationId);
    expect(submitted.status).toBe('payout_submitted');
    expect(submitted.providerRef).toMatch(/^po_/);

    // Stripe agrees the payout exists for the right amount.
    const payout = await stripeClient.stripe.payouts.retrieve(
      submitted.providerRef!,
      undefined,
      { stripeAccount: CONNECTED_ACCOUNT },
    );
    expect(payout.amount).toBe(25);
    expect(payout.currency).toBe('usd');
    expect(['pending', 'in_transit', 'paid']).toContain(payout.status);

    // Settle it and finalize.
    await withdrawals.applyPayoutEvent({
      payoutId: payout.id,
      eventType: 'payout.paid',
      status: 'paid',
    });
    await withdrawals.finalize(await operations.require(started.operationId));

    const finalized = await operations.require(started.operationId);
    expect(finalized.status).toBe('finalized');

    const after = await holdingBalance();
    expect(after.pending).toBe(0n);
    expect(after.available).toBe(STARTING_BASE_UNITS - 250_000n);

    const entries = await db
      .select()
      .from(schema.ledgerEntries)
      .where(
        eq(
          schema.ledgerEntries.idempotencyKey,
          `operation:${started.operationId}`,
        ),
      );
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('off_ramp');

    console.log(
      `withdrawal: chain ${finalized.chainSignature} payout ${finalized.providerRef}`,
    );
  }, 240_000);

  it('compensates rather than fails when the payout fails after tokens moved', async () => {
    const balanceBefore = await holdingBalance();
    const treasuryBefore = await treasury.usdcBalanceBaseUnits();

    const started = await withdrawals.startWithdrawal({
      userId,
      destinationId: GOOD_BANK,
      amountCents: WITHDRAW_CENTS,
      idempotencyKey: randomUUID(),
    });
    await withdrawals.returnTokensToTreasury(
      await operations.require(started.operationId),
    );
    await withdrawals.submitPayout(
      await operations.require(started.operationId),
    );

    const submitted = await operations.require(started.operationId);
    expect(submitted.status).toBe('payout_submitted');

    // The tokens are gone and the reservation still stands.
    expect(await treasury.usdcBalanceBaseUnits()).toBe(
      treasuryBefore + 250_000n,
    );
    const midway = await holdingBalance();
    expect(midway.pending).toBe(250_000n);

    // Stripe reports the payout failed.
    await withdrawals.applyPayoutEvent({
      payoutId: submitted.providerRef!,
      eventType: 'payout.failed',
      status: 'failed',
      failureMessage: 'account_closed',
    });

    const compensating = await operations.require(started.operationId);
    expect(compensating.status).toBe('compensating');

    // Declaring it simply failed must be refused.
    await expect(
      operations.fail(started.operationId, 'payout_failed'),
    ).rejects.toThrow(/compensat/i);

    // The balance is still held, not yet returned.
    const held = await holdingBalance();
    expect(held.available).toBe(balanceBefore.available - 250_000n);
    expect(held.pending).toBe(250_000n);

    // Compensation returns the tokens, then restores the balance.
    await withdrawals.completeCompensation(compensating);

    const reversed = await operations.require(started.operationId);
    expect(reversed.status).toBe('reversed');
    expect(await treasury.usdcBalanceBaseUnits()).toBe(treasuryBefore);

    const restored = await holdingBalance();
    expect(restored.available).toBe(balanceBefore.available);
    expect(restored.pending).toBe(0n);

    // The history is intact: nothing was rewritten.
    const events = await db
      .select()
      .from(schema.financialOperationEvents)
      .where(
        eq(schema.financialOperationEvents.operationId, started.operationId),
      )
      .orderBy(schema.financialOperationEvents.sequence);
    expect(events.map((e) => e.eventType)).toEqual([
      'created',
      'reserved',
      'chain_submitted',
      'chain_confirmed',
      'payout_submitted',
      // The failure and the compensating transfer are added facts, not edits.
      'compensating',
      'payout_failed',
      'compensation_prepared',
      'reversed',
    ]);
    // Every step that actually happened is still readable in order.
    expect(events.map((e) => e.toStatus)).toEqual([
      'created',
      'reserved',
      'chain_submitted',
      'chain_confirmed',
      'payout_submitted',
      'compensating',
      'compensating',
      'compensating',
      'reversed',
    ]);
  }, 300_000);

  it('refuses a withdrawal larger than the available balance', async () => {
    await expect(
      withdrawals.startWithdrawal({
        userId,
        destinationId: GOOD_BANK,
        amountCents: 100_000n,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow(/insufficient/i);
  }, 60_000);

  it('refuses a destination that does not belong to the account', async () => {
    await expect(
      withdrawals.startWithdrawal({
        userId,
        destinationId: 'ba_does_not_exist',
        amountCents: WITHDRAW_CENTS,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow(/does not exist/i);
  }, 60_000);

  it('routes a debit-card destination through an instant payout', async () => {
    const started = await withdrawals.startWithdrawal({
      userId,
      destinationId: DEBIT_CARD,
      amountCents: WITHDRAW_CENTS,
      idempotencyKey: randomUUID(),
    });

    const operation = await operations.require(started.operationId);
    expect(operation.kind).toBe('withdrawal_card');
    expect(
      (operation.metadata as { payoutMethod?: string } | null)?.payoutMethod,
    ).toBe('instant');

    // Release it again; this case is about the routing decision, not a payout.
    await withdrawals.releaseReservation(operation);
    await operations.fail(started.operationId, 'test_cleanup');
  }, 120_000);
});
