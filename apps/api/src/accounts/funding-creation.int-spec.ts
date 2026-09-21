import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import {
  connectTestDatabase,
  type TestDatabase,
} from '../database/testing/test-database';
import {
  createMerchantFixture,
  destroyMerchantFixture,
  type MerchantFixture,
} from '../database/testing/merchant-fixture';
import * as schema from '../database/schema';
import { FinancialOperationsService } from '../financial-operations/financial-operations.service';
import { OperationLedgerService } from '../financial-operations/operation-ledger.service';
import { MoneyAuditService } from '../financial-operations/money-audit.service';
import { AccountWalletsService } from './account-wallets.service';
import { AccountFundingService } from './account-funding.service';
import { OperationRunnerService } from './operation-runner.service';

describe('resumable Checkout creation', () => {
  let db: TestDatabase;
  let pool: Pool;
  let merchant: MerchantFixture;
  let ops: FinancialOperationsService;
  let funding: AccountFundingService;
  let runner: OperationRunnerService;
  let ready = true;
  let loseResponse = false;
  let creates: unknown[] = [];
  const sessions = new Map<string, any>();
  const config = new ConfigService({
    STRIPE_CARD_PAYMENT_CONFIGURATION: 'pmc_fixture',
    STRIPE_BANK_PAYMENT_CONFIGURATION: 'pmc_bank_fixture',
  });
  const treasury = {
    readiness: async () => ({
      configured: ready,
      canPayFees: ready,
      canCover: ready,
    }),
  };
  const stripe = {
    checkout: {
      sessions: {
        create: async (input: any, request: any) => {
          creates.push(input);
          let value = sessions.get(request.idempotencyKey);
          if (!value) {
            value = {
              id: `cs_${sessions.size}`,
              url: 'https://checkout.stripe.com/test',
              metadata: input.metadata,
              amount_total: input.line_items[0].price_data.unit_amount,
              currency: 'usd',
              livemode: false,
              status: 'open',
              payment_status: 'unpaid',
              payment_intent: 'pi_fixture',
            };
            sessions.set(request.idempotencyKey, value);
          }
          if (loseResponse) {
            loseResponse = false;
            throw Error('response lost');
          }
          return value;
        },
        retrieve: async (id: string) =>
          [...sessions.values()].find((s) => s.id === id),
      },
    },
  };
  beforeAll(async () => {
    ({ db, pool } = await connectTestDatabase());
    ops = new FinancialOperationsService(db);
    funding = new AccountFundingService(
      { stripe } as never,
      config,
      treasury as never,
      ops,
      new OperationLedgerService(db),
      new AccountWalletsService(db),
      new MoneyAuditService(db),
    );
    runner = new OperationRunnerService(
      ops,
      funding,
      null as never,
      null as never,
      treasury as never,
      config,
    );
  });
  beforeEach(async () => {
    merchant = await createMerchantFixture(db, 'Checkout');
    ready = true;
    loseResponse = false;
    creates = [];
    sessions.clear();
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await db
      .delete(schema.auditLogs)
      .where(eq(schema.auditLogs.userId, merchant.userId));
    await destroyMerchantFixture(db, merchant);
  });
  afterAll(async () => pool.end());
  const start = () =>
    funding.startFunding({
      userId: merchant.userId,
      method: 'card',
      amountCents: 100n,
      idempotencyKey: 'one-intent',
    });
  it('recovers a lost provider response with immutable inputs even when treasury readiness changes', async () => {
    loseResponse = true;
    await expect(start()).rejects.toThrow('response lost');
    ready = false;
    const recovered = await start();
    expect(recovered.status).toBe('collection_pending');
    expect(recovered.replayed).toBe(true);
    expect(sessions.size).toBe(1);
    expect(creates[1]).toEqual(creates[0]);
  });
  it('correlates a verified webhook through metadata before the session reference was saved', async () => {
    loseResponse = true;
    await expect(start()).rejects.toThrow();
    const session = [...sessions.values()][0];
    session.payment_status = 'paid';
    session.status = 'complete';
    await funding.applyCheckoutEvent({
      sessionId: session.id,
      eventType: 'checkout.session.completed',
      paymentStatus: 'unpaid',
    });
    const op = await ops.findByKey(merchant.userId, 'one-intent');
    expect(op?.status).toBe('collection_settled');
    expect(op?.paymentIntentId).toBe('pi_fixture');
    await funding.applyCheckoutEvent({
      sessionId: session.id,
      eventType: 'checkout.session.expired',
      paymentStatus: 'unpaid',
    });
    expect((await ops.require(op!.id)).status).toBe('collection_settled');
  });
  it('rejects a mismatched amount without crediting funds', async () => {
    await start();
    const session = [...sessions.values()][0];
    session.amount_total = 101;
    session.payment_status = 'paid';
    await expect(
      funding.applyCheckoutEvent({
        sessionId: session.id,
        eventType: 'checkout.session.completed',
        paymentStatus: 'paid',
      }),
    ).rejects.toThrow(/match/);
  });
  it('coalesces a recovery worker and repeated requests into one session', async () => {
    loseResponse = true;
    await expect(start()).rejects.toThrow();
    const op = (await ops.findByKey(merchant.userId, 'one-intent'))!;
    await Promise.all([start(), start(), runner.stepExclusively(op)]);
    expect(sessions.size).toBe(1);
    expect((await ops.require(op.id)).status).toBe('collection_pending');
  });
  it('does not blindly replay creation beyond the provider retention window', async () => {
    loseResponse = true;
    await expect(start()).rejects.toThrow();
    const op = (await ops.findByKey(merchant.userId, 'one-intent'))!;
    await db
      .update(schema.financialOperations)
      .set({ createdAt: new Date(Date.now() - 25 * 3600000) })
      .where(eq(schema.financialOperations.id, op.id));
    const count = creates.length;
    const replay = await start();
    expect(replay.status).toBe('created');
    expect(creates).toHaveLength(count);
    expect((await ops.require(op.id)).nextAttemptAt).not.toBeNull();
  });
});
