import { ForbiddenException } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import {
  connectTestDatabase,
  type TestDatabase,
} from '../database/testing/test-database';
import * as schema from '../database/schema';
import { AccountWalletsService } from './account-wallets.service';
import { AccountTransferService } from './account-transfer.service';
import { DayEndService } from './day-end.service';

/** What the day-end service hands to the transfer service. */
type StartTransferCall = Parameters<AccountTransferService['startTransfer']>[0];

/** The transfer service is stubbed: this suite is about the day-end rules. */
function stubTransfers() {
  const startTransfer = jest.fn((params: StartTransferCall) =>
    Promise.resolve({
      operationId: randomUUID(),
      status: 'reserved',
      amountCents: params.amountCents.toString(),
      from: params.from,
      to: params.to,
      replayed: false,
    }),
  );

  return {
    service: { startTransfer } as unknown as AccountTransferService,
    lastCall(): StartTransferCall {
      const call = startTransfer.mock.calls.at(-1);
      if (!call) throw new Error('startTransfer was never called');
      return call[0];
    },
  };
}

describe('DayEndService (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let dayEnd: DayEndService;
  let transfers: ReturnType<typeof stubTransfers>;

  let ownerId: string;
  let otherUserId: string;
  let merchantId: string;
  let routineWalletId: string;
  let holdingWalletId: string;
  const createdOperationIds: string[] = [];
  const TIMEZONE = 'Europe/Berlin';

  beforeAll(async () => {
    const connection = await connectTestDatabase();
    db = connection.db;
    pool = connection.pool;

    const suffix = randomUUID().slice(0, 8);
    const [owner] = await db
      .insert(schema.users)
      .values({
        email: `dayend-${suffix}@mcbuse.test`,
        passwordHash: 'integration-test-not-a-real-hash',
        firstName: 'Day',
        lastName: 'End',
        username: `dayend${suffix}`,
      })
      .returning({ id: schema.users.id });
    ownerId = owner.id;

    const [other] = await db
      .insert(schema.users)
      .values({
        email: `dayend-other-${suffix}@mcbuse.test`,
        passwordHash: 'integration-test-not-a-real-hash',
        firstName: 'Other',
        lastName: 'Staff',
        username: `dayendo${suffix}`,
      })
      .returning({ id: schema.users.id });
    otherUserId = other.id;

    const wallets = await db
      .insert(schema.wallets)
      .values([
        {
          userId: ownerId,
          type: 'savings',
          solanaPubkey: `de-holding-${suffix}`,
          encryptedKeypair: 'v1:00:00:00',
        },
        {
          userId: ownerId,
          type: 'routine',
          solanaPubkey: `de-routine-${suffix}`,
          encryptedKeypair: 'v1:00:00:00',
        },
      ])
      .returning({ id: schema.wallets.id, type: schema.wallets.type });
    holdingWalletId = wallets.find((w) => w.type === 'savings')!.id;
    routineWalletId = wallets.find((w) => w.type === 'routine')!.id;

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
        available: 10_000_000n,
        pending: 0n,
      },
    ]);

    const [merchant] = await db
      .insert(schema.merchants)
      .values({
        publicId: `de${suffix}`,
        businessName: 'Day End Test Shop',
        timezone: TIMEZONE,
        receivingWalletId: routineWalletId,
      })
      .returning({ id: schema.merchants.id });
    merchantId = merchant.id;

    // Two owner-level members. Only one of them holds the receiving wallet,
    // and this release restricts money movement to that person.
    await db.insert(schema.merchantMemberships).values([
      { merchantId, userId: ownerId, role: 'owner' },
      { merchantId, userId: otherUserId, role: 'owner' },
    ]);

    const walletsService = new AccountWalletsService(db);
    transfers = stubTransfers();
    dayEnd = new DayEndService(db, walletsService, transfers.service);
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
      .delete(schema.merchantTransactions)
      .where(eq(schema.merchantTransactions.merchantId, merchantId));
    if (createdPaymentRequestIds.length) {
      await db
        .delete(schema.paymentRequests)
        .where(inArray(schema.paymentRequests.id, createdPaymentRequestIds));
    }
    // The sale ledger entries reference the wallets, so they must go first.
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
    await db
      .delete(schema.merchantMemberships)
      .where(eq(schema.merchantMemberships.merchantId, merchantId));
    await db
      .delete(schema.merchants)
      .where(eq(schema.merchants.id, merchantId));
    await db
      .delete(schema.balances)
      .where(
        inArray(schema.balances.walletId, [holdingWalletId, routineWalletId]),
      );
    await db
      .delete(schema.wallets)
      .where(inArray(schema.wallets.id, [holdingWalletId, routineWalletId]));
    await db
      .delete(schema.users)
      .where(inArray(schema.users.id, [ownerId, otherUserId]));
    await pool.end();
  });

  /** Mid-afternoon in the merchant's timezone, so no date ambiguity. */
  function todayAt(hour: number): Date {
    const businessDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    return new Date(`${businessDate}T${String(hour).padStart(2, '0')}:00:00Z`);
  }

  const createdPaymentRequestIds: string[] = [];

  async function recordSale(displayMinor: bigint, settlement: bigint) {
    const at = todayAt(12);

    // A merchant transaction always originates from a payment request.
    const [request] = await db
      .insert(schema.paymentRequests)
      .values({
        creatorWalletId: routineWalletId,
        merchantId,
        type: 'dynamic',
        nonce: randomUUID(),
        amount: settlement,
        currency: 'USDC',
        displayAmountMinor: displayMinor,
        quoteRateScaled: 870_070n,
        status: 'completed',
      })
      .returning({ id: schema.paymentRequests.id });
    createdPaymentRequestIds.push(request.id);

    const [ledgerEntry] = await db
      .insert(schema.ledgerEntries)
      .values({
        debitWalletId: holdingWalletId,
        creditWalletId: routineWalletId,
        amount: settlement,
        currency: 'USDC',
        type: 'p2p',
        status: 'completed',
        idempotencyKey: `dayend-sale-${randomUUID()}`,
      })
      .returning({ id: schema.ledgerEntries.id });

    await db.insert(schema.merchantTransactions).values({
      receiptNumber: `DE-${randomUUID().slice(0, 8).toUpperCase()}`,
      merchantId,
      paymentRequestId: request.id,
      ledgerEntryId: ledgerEntry.id,
      displayAmountMinor: displayMinor,
      displayCurrency: 'EUR',
      settlementAmount: settlement,
      settlementCurrency: 'USDC',
      quoteRateScaled: 870_070n,
      status: 'finalized',
      evidenceEnvironment: 'test',
      occurredAt: at,
      finalizedAt: at,
    });
  }

  it('reports nothing to sweep on a day with no digital receipts', async () => {
    const view = await dayEnd.view(ownerId);
    expect(view.timezone).toBe(TIMEZONE);
    expect(view.today.digitalReceiptCount).toBe(0);
    expect(view.suggestion.amountCents).toBe('0');
    expect(view.suggestion.cappedBy).toBe('no_receipts');
    expect(view.suggestion.explanation).toMatch(/no digital payments/i);
  });

  it('suggests the day’s digital takings once sales exist', async () => {
    await recordSale(1_000n, 1_150_000n); // EUR 10.00 -> 1.15 USDC
    await recordSale(2_000n, 2_300_000n);

    const view = await dayEnd.view(ownerId);
    expect(view.today.digitalReceiptCount).toBe(2);
    // 3_450_000 base units = 345 cents
    expect(view.today.digitalReceiptsCents).toBe('345');
    expect(view.suggestion.amountCents).toBe('345');
    expect(view.suggestion.cappedBy).toBe('none');
  });

  it('reports the Routine balance that backs the suggestion', async () => {
    const view = await dayEnd.view(ownerId);
    expect(view.routine.availableCents).toBe('1000');
    expect(view.routine.pendingCents).toBe('0');
  });

  it('keeps recorded cash separate and explains why', async () => {
    const view = await dayEnd.view(ownerId);
    expect(view.today.cashRecordedCurrency).toBe('EUR');
    expect(view.cashNote).toMatch(/cannot be moved between accounts/i);
  });

  it('caps the suggestion at the available Routine funds', async () => {
    await db
      .update(schema.balances)
      .set({ available: 200_000n })
      .where(eq(schema.balances.walletId, routineWalletId));

    const view = await dayEnd.view(ownerId);
    expect(view.suggestion.amountCents).toBe('20');
    expect(view.suggestion.cappedBy).toBe('available_funds');
    expect(view.suggestion.explanation).toMatch(/limited by the funds/i);

    await db
      .update(schema.balances)
      .set({ available: 10_000_000n })
      .where(eq(schema.balances.walletId, routineWalletId));
  });

  it('records the business date, actor and purpose on a confirmed sweep', async () => {
    const result = await dayEnd.confirm({
      userId: ownerId,
      amountCents: 345n,
      idempotencyKey: randomUUID(),
    });
    expect(result).toBeDefined();

    const call = transfers.lastCall();
    expect(call.from).toBe('routine');
    expect(call.to).toBe('holding');
    expect(call.purpose).toBe('day_end');
    expect(call.actorUserId).toBe(ownerId);
    expect(call.amountCents).toBe(345n);
    expect(call.businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('lets the merchant confirm an edited amount', async () => {
    await dayEnd.confirm({
      userId: ownerId,
      amountCents: 100n,
      idempotencyKey: randomUUID(),
    });
    const call = transfers.lastCall();
    expect(call.amountCents).toBe(100n);
  });

  it('refuses a zero or negative amount', async () => {
    await expect(
      dayEnd.confirm({
        userId: ownerId,
        amountCents: 0n,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow(/enter an amount/i);
  });

  it('subtracts sweeps already made today from the suggestion', async () => {
    const [operation] = await db
      .insert(schema.financialOperations)
      .values({
        userId: ownerId,
        kind: 'merchant_dayend',
        status: 'finalized',
        idempotencyKey: randomUUID(),
        inputFingerprint: 'f'.repeat(64),
        sourceWalletId: routineWalletId,
        destinationWalletId: holdingWalletId,
        amountBaseUnits: 2_000_000n,
        currency: 'USDC',
        displayAmountMinor: 200n,
        displayCurrency: 'USD',
        metadata: {
          purpose: 'day_end',
          businessDate: new Intl.DateTimeFormat('en-CA', {
            timeZone: TIMEZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date()),
          actorUserId: ownerId,
        },
      })
      .returning({ id: schema.financialOperations.id });
    createdOperationIds.push(operation.id);

    const view = await dayEnd.view(ownerId);
    expect(view.previousTransfers).toHaveLength(1);
    expect(view.previousTransfers[0].amountCents).toBe('200');
    expect(view.previousTransfers[0].actorUserId).toBe(ownerId);
    // 345 taken, 200 already moved.
    expect(view.suggestion.amountCents).toBe('145');
  });

  it('refuses to let a co-owner who does not hold the receiving account sweep', async () => {
    await expect(dayEnd.view(otherUserId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      dayEnd.confirm({
        userId: otherUserId,
        amountCents: 100n,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
