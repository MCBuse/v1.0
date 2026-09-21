/**
 * Cross-instance event delivery, against a real Postgres.
 *
 * Two MerchantEventsService instances stand in for two API processes. They
 * share nothing but the database, so anything one sees from the other's write
 * arrived through LISTEN/NOTIFY rather than in-process memory.
 */
import { ConfigService } from '@nestjs/config';
import { eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { filter, firstValueFrom, timeout, toArray, take } from 'rxjs';
import {
  connectTestDatabase,
  type TestDatabase,
} from '../database/testing/test-database';
import * as schema from '../database/schema';
import {
  MerchantEventsService,
  type MerchantEvent,
} from './merchant-events.service';
import { MerchantPresentationService } from './merchant-presentation.service';

describe('merchant events (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let writer: MerchantEventsService;
  let reader: MerchantEventsService;
  let presentation: MerchantPresentationService;

  let userId: string;
  let merchantId: string;
  let walletId: string;
  let requestId: string;
  let secondRequestId: string;
  let otherMerchantId: string;
  let otherWalletId: string;
  let otherUserId: string;

  beforeAll(async () => {
    const connection = await connectTestDatabase();
    db = connection.db;
    pool = connection.pool;

    const config = new ConfigService();
    writer = new MerchantEventsService(db, config);
    reader = new MerchantEventsService(db, config);
    // Only the reader listens; the writer just inserts. That is the point.
    await reader.onModuleInit();
    presentation = new MerchantPresentationService(db, writer);

    const suffix = randomUUID().slice(0, 8);
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `events-${suffix}@mcbuse.test`,
        passwordHash: 'integration-test-not-a-real-hash',
        firstName: 'Event',
        lastName: 'Stream',
        username: `events${suffix}`,
      })
      .returning({ id: schema.users.id });
    userId = user.id;

    const [other] = await db
      .insert(schema.users)
      .values({
        email: `events-other-${suffix}@mcbuse.test`,
        passwordHash: 'integration-test-not-a-real-hash',
        firstName: 'Other',
        lastName: 'Merchant',
        username: `eventso${suffix}`,
      })
      .returning({ id: schema.users.id });
    otherUserId = other.id;

    const wallets = await db
      .insert(schema.wallets)
      .values([
        {
          userId,
          type: 'routine',
          solanaPubkey: `ev-routine-${suffix}`,
          encryptedKeypair: 'v1:00:00:00',
        },
        {
          userId: otherUserId,
          type: 'routine',
          solanaPubkey: `ev-other-${suffix}`,
          encryptedKeypair: 'v1:00:00:00',
        },
      ])
      .returning({ id: schema.wallets.id, userId: schema.wallets.userId });
    walletId = wallets.find((w) => w.userId === userId)!.id;
    otherWalletId = wallets.find((w) => w.userId === otherUserId)!.id;

    const merchants = await db
      .insert(schema.merchants)
      .values([
        {
          publicId: `ev${suffix}`,
          businessName: 'Event Test Shop',
          receivingWalletId: walletId,
        },
        {
          publicId: `evo${suffix}`,
          businessName: 'Other Shop',
          receivingWalletId: otherWalletId,
        },
      ])
      .returning({
        id: schema.merchants.id,
        receivingWalletId: schema.merchants.receivingWalletId,
      });
    merchantId = merchants.find((m) => m.receivingWalletId === walletId)!.id;
    otherMerchantId = merchants.find(
      (m) => m.receivingWalletId === otherWalletId,
    )!.id;

    const requests = await db
      .insert(schema.paymentRequests)
      .values([
        {
          creatorWalletId: walletId,
          merchantId,
          type: 'dynamic',
          nonce: randomUUID(),
          amount: 1_150_000n,
          currency: 'USDC',
          displayAmountMinor: 1_000n,
          quoteRateScaled: 870_070n,
          status: 'pending',
        },
        {
          creatorWalletId: walletId,
          merchantId,
          type: 'dynamic',
          nonce: randomUUID(),
          amount: 2_300_000n,
          currency: 'USDC',
          displayAmountMinor: 2_000n,
          quoteRateScaled: 870_070n,
          status: 'pending',
        },
      ])
      .returning({ id: schema.paymentRequests.id });
    requestId = requests[0].id;
    secondRequestId = requests[1].id;
  }, 60_000);

  afterAll(async () => {
    await reader.onModuleDestroy();
    await writer.onModuleDestroy();

    await db
      .delete(schema.merchantPresentedRequests)
      .where(
        inArray(schema.merchantPresentedRequests.merchantId, [
          merchantId,
          otherMerchantId,
        ]),
      );
    await db
      .delete(schema.merchantEvents)
      .where(
        inArray(schema.merchantEvents.merchantId, [
          merchantId,
          otherMerchantId,
        ]),
      );
    await db
      .delete(schema.paymentRequests)
      .where(
        inArray(schema.paymentRequests.merchantId, [
          merchantId,
          otherMerchantId,
        ]),
      );
    await db
      .delete(schema.merchants)
      .where(inArray(schema.merchants.id, [merchantId, otherMerchantId]));
    await db
      .delete(schema.wallets)
      .where(inArray(schema.wallets.id, [walletId, otherWalletId]));
    await db
      .delete(schema.users)
      .where(inArray(schema.users.id, [userId, otherUserId]));
    await pool.end();
  }, 60_000);

  /**
   * Waits for one event of a given type.
   *
   * NOTIFY delivery is asynchronous, so an event from an earlier case can
   * still be in flight when the next one subscribes. Filtering by type keeps
   * each case independent of the ones before it.
   */
  function nextEventOfType(type: MerchantEvent['type'], merchant = merchantId) {
    return firstValueFrom(
      reader.streamFor(merchant).pipe(
        filter((event) => event.type === type),
        take(1),
        timeout(5_000),
      ),
    );
  }

  it('delivers an event written by one instance to a listener on another', async () => {
    const received = firstValueFrom(
      reader.streamFor(merchantId).pipe(take(1), timeout(5_000)),
    );

    await writer.publish({
      merchantId,
      type: 'request_presented',
      paymentRequestId: requestId,
      payload: { hello: 'world' },
    });

    const event = await received;
    expect(event.type).toBe('request_presented');
    expect(event.paymentRequestId).toBe(requestId);
    expect(event.payload).toEqual({ hello: 'world' });
  }, 30_000);

  it('propagates within two seconds', async () => {
    const received = firstValueFrom(
      reader.streamFor(merchantId).pipe(take(1), timeout(5_000)),
    );
    const startedAt = Date.now();

    await writer.publish({
      merchantId,
      type: 'request_status_changed',
      paymentRequestId: requestId,
      payload: { status: 'completed' },
    });

    await received;
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  }, 30_000);

  it('never leaks one merchant’s events to another', async () => {
    const collected: MerchantEvent[] = [];
    const subscription = reader
      .streamFor(otherMerchantId)
      .subscribe((event) => collected.push(event));

    await writer.publish({
      merchantId,
      type: 'request_presented',
      paymentRequestId: requestId,
      payload: {},
    });
    await new Promise((resolve) => setTimeout(resolve, 800));

    subscription.unsubscribe();
    expect(collected).toHaveLength(0);
  }, 30_000);

  it('replays exactly what a device missed while it was away', async () => {
    const before = await writer.latestSequence(merchantId);

    await writer.publish({
      merchantId,
      type: 'request_presented',
      paymentRequestId: requestId,
      payload: { n: 1 },
    });
    await writer.publish({
      merchantId,
      type: 'request_status_changed',
      paymentRequestId: requestId,
      payload: { n: 2 },
    });

    const missed = await writer.since(merchantId, before);
    expect(missed).toHaveLength(2);
    expect(missed.map((e) => e.payload.n)).toEqual([1, 2]);

    // Sequences are strictly increasing, so the cursor is unambiguous.
    const sequences = missed.map((e) => BigInt(e.sequence));
    expect(sequences[1]).toBeGreaterThan(sequences[0]);
  }, 30_000);

  it('returns nothing when a device is already up to date', async () => {
    const latest = await writer.latestSequence(merchantId);
    expect(await writer.since(merchantId, latest)).toEqual([]);
  }, 30_000);

  it('gives a brand new device the whole history', async () => {
    const all = await writer.since(merchantId, null);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((e) => e.merchantId === merchantId)).toBe(true);
  }, 30_000);

  describe('presentation', () => {
    it('persists the presented request server-side and announces it', async () => {
      const received = nextEventOfType('request_presented');

      const view = await presentation.present({
        merchantId,
        paymentRequestId: requestId,
        actorUserId: userId,
      });
      expect(view.paymentRequestId).toBe(requestId);
      expect(view.displayAmountMinor).toBe('1000');

      const event = await received;
      expect(event.type).toBe('request_presented');

      // A device connecting later reads the same thing without being told.
      const current = await presentation.current(merchantId);
      expect(current?.paymentRequestId).toBe(requestId);
    }, 30_000);

    it('replaces the presented request rather than stacking them', async () => {
      await presentation.present({
        merchantId,
        paymentRequestId: secondRequestId,
        actorUserId: userId,
      });

      const current = await presentation.current(merchantId);
      expect(current?.paymentRequestId).toBe(secondRequestId);

      const rows = await db
        .select()
        .from(schema.merchantPresentedRequests)
        .where(eq(schema.merchantPresentedRequests.merchantId, merchantId));
      expect(rows).toHaveLength(1);
    }, 30_000);

    it('announces a status change for the request on screen', async () => {
      const received = nextEventOfType('request_status_changed');

      await presentation.noteStatusChange(
        merchantId,
        secondRequestId,
        'completed',
      );

      const event = await received;
      expect(event.type).toBe('request_status_changed');
      expect(event.payload).toEqual({
        paymentRequestId: secondRequestId,
        status: 'completed',
      });
    }, 30_000);

    it('says nothing about a request that is not being presented', async () => {
      const before = await writer.latestSequence(merchantId);
      await presentation.noteStatusChange(merchantId, requestId, 'completed');
      const after = await writer.latestSequence(merchantId);
      expect(after).toBe(before);
    }, 30_000);

    it('clears the presented request and announces that too', async () => {
      const received = nextEventOfType('request_cleared');

      await presentation.clear(merchantId);
      const event = await received;
      expect(event.type).toBe('request_cleared');
      expect(await presentation.current(merchantId)).toBeNull();
    }, 30_000);

    it('refuses a request belonging to a different merchant', async () => {
      await expect(
        presentation.present({
          merchantId: otherMerchantId,
          paymentRequestId: requestId,
          actorUserId: otherUserId,
        }),
      ).rejects.toThrow(/not found for this merchant/i);
    }, 30_000);
  });

  it('delivers a burst in order', async () => {
    const received = firstValueFrom(
      reader.streamFor(merchantId).pipe(take(5), toArray(), timeout(10_000)),
    );

    for (let n = 0; n < 5; n += 1) {
      await writer.publish({
        merchantId,
        type: 'request_status_changed',
        paymentRequestId: requestId,
        payload: { n },
      });
    }

    const events = await received;
    expect(events.map((e) => e.payload.n)).toEqual([0, 1, 2, 3, 4]);
  }, 30_000);
});
