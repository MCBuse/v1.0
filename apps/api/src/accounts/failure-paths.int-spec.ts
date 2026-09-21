import { ConfigService } from '@nestjs/config';
import { and, eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import {
  connectTestDatabase,
  type TestDatabase,
} from '../database/testing/test-database';
import * as schema from '../database/schema';
import { FinancialOperationsService } from '../financial-operations/financial-operations.service';
import { OperationLedgerService } from '../financial-operations/operation-ledger.service';
import { MoneyAuditService } from '../financial-operations/money-audit.service';
import { AccountWalletsService } from './account-wallets.service';
import { AccountFundingService } from './account-funding.service';
import { AccountTransferService } from './account-transfer.service';
import { AccountWithdrawalService } from './account-withdrawal.service';
import { OperationRunnerService } from './operation-runner.service';
import type { TreasuryService } from '../treasury/treasury.service';
import type { SolanaService } from '../solana/solana.service';
import type { StripeClient } from '../stripe/stripe.client';
import type { PayoutDestinationsService } from './payout-destinations.service';

/**
 * X.1, X.5, X.6, X.7 — what the platform does when things go wrong.
 *
 * Stripe and the chain are stubbed at their boundary on purpose. The real
 * Stripe and real devnet evidence for the happy paths is already recorded;
 * what is unproven is how the state machine behaves when a provider is slow,
 * fails late, or when a process dies between broadcasting and hearing back.
 * Those states cannot be produced on demand against a live provider, so they
 * are produced here, against a real database.
 */
describe('failure paths (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let operations: FinancialOperationsService;
  let ledger: OperationLedgerService;
  let wallets: AccountWalletsService;
  let funding: AccountFundingService;
  let transfers: AccountTransferService;
  let withdrawals: AccountWithdrawalService;
  let runner: OperationRunnerService;

  let userId: string;
  let holdingWalletId: string;
  let routineWalletId: string;
  const operationIds: string[] = [];

  /** What the stubbed chain says about a signature, per test. */
  let chainStatus: 'pending' | 'completed' | 'failed' = 'completed';
  /** Every wallet-to-wallet submission the services attempted. */
  let submissions: string[] = [];

  const START = 10_000_000n;

  const treasury = {
    get address() {
      return 'TreasuryAddressForFailurePaths';
    },
    feePayer: () => undefined,
    statusOf: async () => chainStatus,
    sendUsdcTo: async () => ({ status: 'completed', signature: 'treasury-sig' }),
    readiness: async () => ({
      configured: true,
      canPayFees: true,
      canCover: true,
      problems: [],
    }),
  } as unknown as TreasuryService;

  let providerPaymentStatus = 'unpaid';
  let providerSessionStatus = 'complete';
  const stripeStub = { stripe: { checkout: { sessions: { retrieve: async (id: string) => {
    const op = await operations.findByProviderRef(id);
    return { id, metadata: { operationId: op!.id, userId: op!.userId, walletId: op!.destinationWalletId }, amount_total: Number(op!.displayAmountMinor), currency: 'usd', livemode: false, payment_status: providerPaymentStatus, status: providerSessionStatus, payment_intent: 'pi_test' };
  } } } } } as unknown as StripeClient;
  beforeAll(async () => {
    const connection = await connectTestDatabase();
    db = connection.db;
    pool = connection.pool;

    const config = new ConfigService();
    operations = new FinancialOperationsService(db);
    ledger = new OperationLedgerService(db);
    wallets = new AccountWalletsService(db);
    const audit = new MoneyAuditService(db);

    funding = new AccountFundingService(
      stripeStub,
      config,
      treasury,
      operations,
      ledger,
      wallets,
      audit,
    );
    transfers = new AccountTransferService(
      null as unknown as SolanaService,
      config,
      treasury,
      operations,
      ledger,
      wallets,
      audit,
    );
    withdrawals = new AccountWithdrawalService(
      null as unknown as SolanaService,
      config,
      null as unknown as StripeClient,
      treasury,
      operations,
      ledger,
      wallets,
      null as unknown as PayoutDestinationsService,
      audit,
    );

    // The chain submission itself is the one thing stubbed: every test here is
    // about what happens around it, and a real broadcast would make "was a
    // second transfer sent?" unanswerable.
    transfers.submitChainTransfer = async function (stale) {
      const operation = await operations.require(stale.id);
      if (operation.status !== 'reserved') return;
      submissions.push(operation.id);
      await operations.advance(
        operation.id,
        'chain_submitted',
        {
          chainSignature: `sig-${operation.id.slice(0, 8)}`,
          chainStatus: 'prepared',
          chainSubmittedAt: new Date(),
        },
        { signature: `sig-${operation.id.slice(0, 8)}` },
      );
    };

    runner = new OperationRunnerService(
      operations,
      funding,
      transfers,
      withdrawals,
      treasury,
      // Disable the timer: every tick in this suite is driven explicitly.
      { get: () => 'false' } as unknown as ConfigService,
    );

    const suffix = randomUUID().slice(0, 8);
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `failure-${suffix}@mcbuse.test`,
        passwordHash: 'integration-test-not-a-real-hash',
        firstName: 'Failure',
        lastName: 'Paths',
        username: `failure${suffix}`,
      })
      .returning({ id: schema.users.id });
    userId = user.id;

    const inserted = await db
      .insert(schema.wallets)
      .values([
        {
          userId,
          type: 'savings',
          solanaPubkey: `fail-holding-${suffix}`,
          encryptedKeypair: 'v1:00:00:00',
          encryptionKeyVersion: 'v1',
        },
        {
          userId,
          type: 'routine',
          solanaPubkey: `fail-routine-${suffix}`,
          encryptedKeypair: 'v1:00:00:00',
          encryptionKeyVersion: 'v1',
        },
      ])
      .returning({ id: schema.wallets.id, type: schema.wallets.type });
    holdingWalletId = inserted.find((w) => w.type === 'savings')!.id;
    routineWalletId = inserted.find((w) => w.type === 'routine')!.id;

    await db.insert(schema.balances).values([
      { walletId: holdingWalletId, currency: 'USDC', available: START },
      { walletId: holdingWalletId, currency: 'EURC' },
      { walletId: routineWalletId, currency: 'USDC' },
      { walletId: routineWalletId, currency: 'EURC' },
    ]);
  });

  /**
   * Each test starts from an empty in-flight set. Otherwise a runner tick in
   * one test would pick up another test's operations and the counts would be
   * measuring the suite rather than the behaviour.
   */
  async function clearOperations() {
    // Cleared by owner rather than by collected id: a request that was refused
    // still left an operation row behind, and those are exactly the ones a
    // list of successful ids would miss.
    const ids = (
      await db
        .select({ id: schema.financialOperations.id })
        .from(schema.financialOperations)
        .where(eq(schema.financialOperations.userId, userId))
    ).map((row) => row.id);

    if (ids.length) {
      await db
        .delete(schema.financialOperationEvents)
        .where(inArray(schema.financialOperationEvents.operationId, ids));
      await db
        .delete(schema.financialOperations)
        .where(inArray(schema.financialOperations.id, ids));
    }
    operationIds.length = 0;

    await db
      .delete(schema.ledgerEntries)
      .where(
        inArray(schema.ledgerEntries.debitWalletId, [
          holdingWalletId,
          routineWalletId,
        ]),
      );
    await db
      .delete(schema.ledgerEntries)
      .where(
        inArray(schema.ledgerEntries.creditWalletId, [
          holdingWalletId,
          routineWalletId,
        ]),
      );
  }

  beforeEach(async () => {
    providerPaymentStatus = 'unpaid'; providerSessionStatus = 'complete';
    chainStatus = 'completed';
    submissions = [];
    await clearOperations();
    await db
      .update(schema.balances)
      .set({ available: START, pending: 0n })
      .where(
        and(
          eq(schema.balances.walletId, holdingWalletId),
          eq(schema.balances.currency, 'USDC'),
        ),
      );
    await db
      .update(schema.balances)
      .set({ available: 0n, pending: 0n })
      .where(
        and(
          eq(schema.balances.walletId, routineWalletId),
          eq(schema.balances.currency, 'USDC'),
        ),
      );
  });

  afterAll(async () => {
    await clearOperations();
    await db.delete(schema.auditLogs).where(eq(schema.auditLogs.userId, userId));
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

  async function startTransfer(amountCents: bigint) {
    const result = await transfers.startTransfer({
      userId,
      from: 'holding',
      to: 'routine',
      amountCents,
      idempotencyKey: randomUUID(),
    });
    operationIds.push(result.operationId);
    return result;
  }

  async function beginFunding(amountBaseUnits: bigint) {
    const { operation } = await operations.begin({
      userId,
      kind: 'funding_bank',
      idempotencyKey: randomUUID(),
      amountBaseUnits,
      currency: 'USDC',
      destinationWalletId: holdingWalletId,
      displayAmountMinor: amountBaseUnits / 10_000n,
      displayCurrency: 'USD',
      provider: 'stripe',
      metadata: { method: 'bank' },
    });
    operationIds.push(operation.id);
    const sessionId = `cs_test_${operation.id.slice(0, 12)}`;
    await operations.advance(operation.id, 'collection_pending', {
      providerRef: sessionId,
      providerStatus: 'open',
    });
    return { operation, sessionId };
  }

  async function balanceOf(walletId: string) {
    const [row] = await db
      .select({
        available: schema.balances.available,
        pending: schema.balances.pending,
      })
      .from(schema.balances)
      .where(
        and(
          eq(schema.balances.walletId, walletId),
          eq(schema.balances.currency, 'USDC'),
        ),
      );
    return row;
  }

  async function eventsFor(operationId: string) {
    return db
      .select()
      .from(schema.financialOperationEvents)
      .where(eq(schema.financialOperationEvents.operationId, operationId))
      .orderBy(schema.financialOperationEvents.sequence);
  }

  it('refuses new account operations in mock mode while preserving replay access', async () => {
    const key = randomUUID();
    const params = { userId, kind: 'internal_transfer' as const, idempotencyKey: key, amountBaseUnits: 1n, currency: 'USDC', sourceWalletId: holdingWalletId, destinationWalletId: routineWalletId };
    const mockOperations = new FinancialOperationsService(db, new ConfigService({ FINANCIAL_MODE: 'mock' }));
    await expect(mockOperations.begin(params)).rejects.toThrow('requires sandbox financial mode');
    expect(await operations.findByKey(userId, key)).toBeNull();
    const original = await operations.begin(params);
    expect((await mockOperations.begin(params)).operation.id).toBe(original.operation.id);
  });

  it('never resurrects a rejected transfer when a later deposit arrives', async () => {
    const key = randomUUID();
    await expect(transfers.startTransfer({ userId, from: 'holding', to: 'routine', amountCents: 2_000n, idempotencyKey: key })).rejects.toThrow('Insufficient available balance');
    const rejected = await operations.findByKey(userId, key);
    expect(rejected?.status).toBe('failed');
    expect(rejected?.failureCode).toBe('insufficient_balance');
    await db.update(schema.balances).set({ available: START * 3n }).where(and(eq(schema.balances.walletId, holdingWalletId), eq(schema.balances.currency, 'USDC')));
    await runner.tick(100);
    expect((await operations.require(rejected!.id)).status).toBe('failed');
    expect(submissions).toEqual([]);
    expect((await balanceOf(holdingWalletId)).available).toBe(START * 3n);
  });

  // ── X.6 — Stripe delayed success ────────────────────────────────────────
  describe('X.6 — a bank debit that succeeds later', () => {
    it('does not treat a completed Checkout session as settled money', async () => {
      const { operation, sessionId } = await beginFunding(5_000_000n);

      // ACH: the session completes when the debit is *submitted*.
      await funding.applyCheckoutEvent({
        sessionId,
        eventType: 'checkout.session.completed',
        paymentStatus: 'unpaid',
      });

      const after = await operations.require(operation.id);
      expect(after.status).toBe('collection_pending');
      expect((await balanceOf(holdingWalletId)).available).toBe(START);
    });

    it('settles only when the async payment actually succeeds', async () => {
      const { operation, sessionId } = await beginFunding(5_000_000n);

      await funding.applyCheckoutEvent({
        sessionId,
        eventType: 'checkout.session.completed',
        paymentStatus: 'unpaid',
      });
      providerPaymentStatus = 'paid';
      await funding.applyCheckoutEvent({
        sessionId,
        eventType: 'checkout.session.async_payment_succeeded',
        paymentStatus: 'paid',
      });

      expect((await operations.require(operation.id)).status).toBe(
        'collection_settled',
      );
    });

    it('records one update per real change, however often it is polled', async () => {
      const { operation, sessionId } = await beginFunding(5_000_000n);

      // The customer is filling in their details; nothing is changing.
      for (let i = 0; i < 20; i += 1) {
        await funding.applyCheckoutEvent({
          sessionId,
          eventType: 'checkout.session.completed',
          paymentStatus: 'unpaid',
        });
      }

      const updates = (await eventsFor(operation.id)).filter(
        (event) => event.eventType === 'collection_update',
      );
      expect(updates).toHaveLength(1);
    });

    it('keeps waiting rather than guessing, for as long as it takes', async () => {
      const { operation, sessionId } = await beginFunding(5_000_000n);
      for (let i = 0; i < 5; i += 1) {
        await funding.applyCheckoutEvent({
          sessionId,
          eventType: 'checkout.session.completed',
          paymentStatus: 'unpaid',
        });
      }
      const waiting = await operations.require(operation.id);
      expect(waiting.status).toBe('collection_pending');
      expect(waiting.failureCode).toBeNull();
      expect(waiting.nextAttemptAt).not.toBeNull();
    });
  });

  // ── X.7 — Stripe failure ────────────────────────────────────────────────
  describe('X.7 — a collection that fails', () => {
    it('fails the operation when the bank debit is refused', async () => {
      const { operation, sessionId } = await beginFunding(5_000_000n);

      await funding.applyCheckoutEvent({
        sessionId,
        eventType: 'checkout.session.async_payment_failed',
        paymentStatus: 'unpaid',
      });

      const after = await operations.require(operation.id);
      expect(after.status).toBe('failed');
      expect(after.failureCode).toBe('collection_failed');
    });

    it('credits nothing when the collection fails', async () => {
      const { sessionId } = await beginFunding(5_000_000n);
      await funding.applyCheckoutEvent({
        sessionId,
        eventType: 'checkout.session.async_payment_failed',
        paymentStatus: 'unpaid',
      });

      const holding = await balanceOf(holdingWalletId);
      expect(holding.available).toBe(START);
      expect(holding.pending).toBe(0n);
    });

    it('fails an expired session without inventing an outcome', async () => {
      const { operation, sessionId } = await beginFunding(5_000_000n);
      providerSessionStatus = 'expired';
      await funding.applyCheckoutEvent({
        sessionId,
        eventType: 'checkout.session.expired',
        paymentStatus: null,
      });

      const after = await operations.require(operation.id);
      expect(after.status).toBe('failed');
      expect(after.failureCode).toBe('collection_expired');
    });

    it('a late success after a failure does not resurrect the operation', async () => {
      const { operation, sessionId } = await beginFunding(5_000_000n);
      await funding.applyCheckoutEvent({
        sessionId,
        eventType: 'checkout.session.async_payment_failed',
        paymentStatus: 'unpaid',
      });

      providerPaymentStatus = 'paid';
      await funding.applyCheckoutEvent({
        sessionId,
        eventType: 'checkout.session.async_payment_succeeded',
        paymentStatus: 'paid',
      });

      expect((await operations.require(operation.id)).status).toBe('failed');
      expect((await balanceOf(holdingWalletId)).available).toBe(START);
    });

    it('leaves the failure in the event log rather than rewriting it', async () => {
      const { operation, sessionId } = await beginFunding(5_000_000n);
      await funding.applyCheckoutEvent({
        sessionId,
        eventType: 'checkout.session.async_payment_failed',
        paymentStatus: 'unpaid',
      });

      const events = await eventsFor(operation.id);
      expect(events.map((e) => e.toStatus)).toContain('failed');
      expect(events.length).toBeGreaterThan(1);
    });
  });

  // ── X.5 — chain timeout, restart, reconciliation ────────────────────────
  describe('X.5 — a broadcast whose outcome we never saw', () => {
    it('checks the signature it already has instead of sending another', async () => {
      const { operationId } = await startTransfer(100n);
      await runner.step(await operations.require(operationId)); // submit
      expect(submissions).toEqual([operationId]);

      chainStatus = 'pending';
      // A restart: a brand new runner, holding nothing but the database.
      const restarted = new OperationRunnerService(
        operations,
        funding,
        transfers,
        withdrawals,
        treasury,
        { get: () => 'false' } as unknown as ConfigService,
      );
      await restarted.step(await operations.require(operationId));
      await restarted.step(await operations.require(operationId));
      await restarted.step(await operations.require(operationId));

      // Three recovery passes, still exactly one submission.
      expect(submissions).toEqual([operationId]);
      expect((await operations.require(operationId)).status).toBe(
        'chain_submitted',
      );
    });

    it('confirms from the chain once the signature lands', async () => {
      const { operationId } = await startTransfer(100n);
      await runner.step(await operations.require(operationId));

      chainStatus = 'pending';
      await runner.step(await operations.require(operationId));
      chainStatus = 'completed';
      await runner.step(await operations.require(operationId));

      const confirmed = await operations.require(operationId);
      expect(confirmed.status).toBe('chain_confirmed');
      expect(confirmed.chainSignature).not.toBeNull();
      expect(submissions).toHaveLength(1);
    });

    it('records the confirmation as recovered, not as a fresh submission', async () => {
      const { operationId } = await startTransfer(100n);
      await runner.step(await operations.require(operationId));
      chainStatus = 'completed';
      await runner.step(await operations.require(operationId));

      const events = await eventsFor(operationId);
      const confirmation = events.find((e) => e.toStatus === 'chain_confirmed');
      expect(
        (confirmation!.detail as { recovered?: boolean }).recovered,
      ).toBe(true);
    });

    it('releases the reservation when the chain reports a failure', async () => {
      const { operationId } = await startTransfer(100n);
      await runner.step(await operations.require(operationId));

      chainStatus = 'failed';
      await runner.step(await operations.require(operationId));

      const failed = await operations.require(operationId);
      expect(failed.status).toBe('failed');
      const holding = await balanceOf(holdingWalletId);
      expect(holding.available).toBe(START);
      expect(holding.pending).toBe(0n);
    });

    it('finalizes exactly once even if the runner steps it repeatedly', async () => {
      const { operationId } = await startTransfer(100n);
      await runner.step(await operations.require(operationId)); // submit
      await runner.step(await operations.require(operationId)); // confirm
      await runner.step(await operations.require(operationId)); // finalize
      await runner.step(await operations.require(operationId)); // no-op
      await runner.step(await operations.require(operationId)); // no-op

      const finalized = await operations.require(operationId);
      expect(finalized.status).toBe('finalized');

      const entries = await db
        .select({ id: schema.ledgerEntries.id })
        .from(schema.ledgerEntries)
        .where(eq(schema.ledgerEntries.debitWalletId, holdingWalletId));
      expect(entries).toHaveLength(1);
      expect((await balanceOf(routineWalletId)).available).toBe(1_000_000n);
    });
  });

  // ── X.1 — concurrent operations ─────────────────────────────────────────
  describe('X.1 — many operations in flight at once', () => {
    it('never overdraws when more is requested than exists', async () => {
      // Twelve requests of 1 USDC against a 10 USDC balance.
      const results = await Promise.allSettled(
        Array.from({ length: 12 }, () => startTransfer(100n)),
      );
      const accepted = results.filter((r) => r.status === 'fulfilled').length;
      const holding = await balanceOf(holdingWalletId);

      expect(accepted).toBeLessThanOrEqual(10);
      expect(holding.available).toBeGreaterThanOrEqual(0n);
      expect(holding.available + holding.pending).toBe(START);
    });

    it('two runners sweeping together step each operation once', async () => {
      const started = await Promise.all([
        startTransfer(100n),
        startTransfer(100n),
        startTransfer(100n),
        startTransfer(100n),
      ]);

      const second = new OperationRunnerService(
        operations,
        funding,
        transfers,
        withdrawals,
        treasury,
        { get: () => 'false' } as unknown as ConfigService,
      );
      await Promise.all([runner.tick(50), second.tick(50)]);
      // The lease is what makes this true: both runners saw all four as due.

      const ids = started.map((s) => s.operationId);
      for (const id of ids) {
        expect(submissions.filter((s) => s === id)).toHaveLength(1);
      }
    });

    it('hands an operation to one worker at a time', async () => {
      const { operationId } = await startTransfer(100n);

      const first = await operations.claim(operationId, 'worker-a', 60_000);
      const second = await operations.claim(operationId, 'worker-b', 60_000);

      expect(first).not.toBeNull();
      expect(second).toBeNull();
      expect(first!.claimedBy).toBe('worker-a');
    });

    it('lets another worker take over once a lease has lapsed', async () => {
      const { operationId } = await startTransfer(100n);

      // A worker that died mid-step leaves a lease behind; it must expire.
      await operations.claim(operationId, 'worker-a', -1_000);
      const takenOver = await operations.claim(operationId, 'worker-b', 60_000);

      expect(takenOver).not.toBeNull();
      expect(takenOver!.claimedBy).toBe('worker-b');
    });

    it('a claimed operation is not offered to the next sweep', async () => {
      const { operationId } = await startTransfer(100n);
      await operations.claim(operationId, 'worker-a', 60_000);

      const due = await operations.due(50);
      expect(due.map((o) => o.id)).not.toContain(operationId);
    });

    it('releases the lease so the operation can continue', async () => {
      const { operationId } = await startTransfer(100n);
      await operations.claim(operationId, 'worker-a', 60_000);
      await operations.release(operationId, 'worker-a');

      const due = await operations.due(50);
      expect(due.map((o) => o.id)).toContain(operationId);
    });

    it('one worker cannot release another worker\'s lease', async () => {
      const { operationId } = await startTransfer(100n);
      await operations.claim(operationId, 'worker-a', 60_000);
      await operations.release(operationId, 'worker-b');

      expect(
        await operations.claim(operationId, 'worker-b', 60_000),
      ).toBeNull();
    });

    it('drives a batch of concurrent transfers all the way to finalized', async () => {
      const started = await Promise.all([
        startTransfer(100n),
        startTransfer(100n),
        startTransfer(100n),
      ]);

      for (let pass = 0; pass < 4; pass += 1) {
        await runner.tick(50);
      }

      for (const { operationId } of started) {
        expect((await operations.require(operationId)).status).toBe(
          'finalized',
        );
      }
      expect((await balanceOf(routineWalletId)).available).toBe(3_000_000n);
      expect((await balanceOf(holdingWalletId)).available).toBe(
        START - 3_000_000n,
      );
    });

    it('keeps the ledger and the balances agreeing under concurrency', async () => {
      const started = await Promise.all(
        Array.from({ length: 6 }, () => startTransfer(100n)),
      );
      for (let pass = 0; pass < 4; pass += 1) await runner.tick(50);

      const entries = await db
        .select({ amount: schema.ledgerEntries.amount })
        .from(schema.ledgerEntries)
        .where(eq(schema.ledgerEntries.debitWalletId, holdingWalletId));

      const ledgerTotal = entries.reduce((sum, e) => sum + e.amount, 0n);
      const routine = await balanceOf(routineWalletId);
      const holding = await balanceOf(holdingWalletId);

      expect(entries).toHaveLength(started.length);
      expect(routine.available).toBe(ledgerTotal);
      expect(holding.available + routine.available).toBe(START);
      expect(holding.pending).toBe(0n);
    });
  });
});
