import { eq, inArray, sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import {
  connectTestDatabase,
  type TestDatabase,
} from '../database/testing/test-database';
import * as schema from '../database/schema';
import {
  AnalyticsWorkQueueService,
  type WorkTrigger,
} from './analytics-work-queue.service';

describe('analytics work queue (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let queue: AnalyticsWorkQueueService;

  let userId: string;
  let walletId: string;
  let merchantId: string;
  let otherMerchantId: string;
  let otherWalletId: string;

  beforeAll(async () => {
    const connection = await connectTestDatabase();
    db = connection.db;
    pool = connection.pool;
    queue = new AnalyticsWorkQueueService(db);

    const suffix = randomUUID().slice(0, 8);
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `work-${suffix}@mcbuse.test`,
        passwordHash: 'integration-test-not-a-real-hash',
        firstName: 'Work',
        lastName: 'Queue',
        username: `work${suffix}`,
      })
      .returning({ id: schema.users.id });
    userId = user.id;

    const wallets = await db
      .insert(schema.wallets)
      .values([
        {
          userId,
          type: 'routine',
          solanaPubkey: `wq-a-${suffix}`,
          encryptedKeypair: 'v1:00:00:00',
        },
        {
          userId,
          type: 'savings',
          solanaPubkey: `wq-b-${suffix}`,
          encryptedKeypair: 'v1:00:00:00',
        },
      ])
      .returning({ id: schema.wallets.id, type: schema.wallets.type });
    walletId = wallets.find((w) => w.type === 'routine')!.id;
    otherWalletId = wallets.find((w) => w.type === 'savings')!.id;

    const merchants = await db
      .insert(schema.merchants)
      .values([
        {
          publicId: `wq${suffix}`,
          businessName: 'Queue Shop',
          receivingWalletId: walletId,
        },
        {
          publicId: `wqo${suffix}`,
          businessName: 'Other Queue Shop',
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
  });

  afterAll(async () => {
    await db
      .delete(schema.merchantAnalyticsWork)
      .where(
        inArray(schema.merchantAnalyticsWork.merchantId, [
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
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await pool.end();
  });

  async function row(id = merchantId) {
    const [found] = await db
      .select()
      .from(schema.merchantAnalyticsWork)
      .where(eq(schema.merchantAnalyticsWork.merchantId, id));
    return found;
  }

  async function clear() {
    await db
      .delete(schema.merchantAnalyticsWork)
      .where(
        inArray(schema.merchantAnalyticsWork.merchantId, [
          merchantId,
          otherMerchantId,
        ]),
      );
  }

  beforeEach(clear);

  it('queues work for a merchant', async () => {
    await queue.enqueue(merchantId, 'digital_sale_finalized', {
      type: 'payment_request',
      id: 'req-1',
    });

    const work = await row();
    expect(work.status).toBe('pending');
    const reasons = work.reasons as WorkTrigger[];
    expect(reasons).toHaveLength(1);
    expect(reasons[0].reason).toBe('digital_sale_finalized');
    expect(reasons[0].sourceId).toBe('req-1');
  });

  it('coalesces a burst into a single row', async () => {
    for (let n = 0; n < 25; n += 1) {
      await queue.enqueue(merchantId, 'digital_sale_finalized', {
        type: 'payment_request',
        id: `req-${n}`,
      });
    }

    const all = await db
      .select()
      .from(schema.merchantAnalyticsWork)
      .where(eq(schema.merchantAnalyticsWork.merchantId, merchantId));
    expect(all).toHaveLength(1);

    // The reasons are retained up to a cap, newest kept.
    const reasons = all[0].reasons as WorkTrigger[];
    expect(reasons.length).toBeLessThanOrEqual(20);
    expect(reasons.length).toBeGreaterThan(0);
  });

  it('records each distinct kind of trigger', async () => {
    await queue.enqueue(merchantId, 'cash_sale_recorded', { type: 'cash' });
    await queue.enqueue(merchantId, 'stock_adjusted', { type: 'product' });
    await queue.enqueue(merchantId, 'import_committed', { type: 'import' });

    const result = await db.execute(sql`select reason from merchant_analytics_outbox where merchant_id=${merchantId}::uuid`);
    const reasons = result.rows as unknown as WorkTrigger[];
    expect(reasons.map((r) => r.reason)).toEqual(
      expect.arrayContaining([
        'cash_sale_recorded',
        'stock_adjusted',
        'import_committed',
      ]),
    );
  });

  it('keeps merchants separate', async () => {
    await queue.enqueue(merchantId, 'cash_sale_recorded', { type: 'cash' });
    await queue.enqueue(otherMerchantId, 'stock_adjusted', { type: 'product' });

    expect((await row(merchantId)).merchantId).toBe(merchantId);
    expect((await row(otherMerchantId)).merchantId).toBe(otherMerchantId);
  });

  describe('claiming', () => {
    it('claims pending work and marks it in progress', async () => {
      await queue.enqueue(merchantId, 'cash_sale_recorded', { type: 'cash' });

      const claimed = await queue.claim(10);
      expect(claimed.map((c) => c.merchantId)).toContain(merchantId);
      expect((await row()).status).toBe('processing');
    });

    it('does not hand the same work to a second worker', async () => {
      await queue.enqueue(merchantId, 'cash_sale_recorded', { type: 'cash' });

      const first = await queue.claim(10);
      const second = await queue.claim(10);

      expect(first.map((c) => c.merchantId)).toContain(merchantId);
      expect(second.map((c) => c.merchantId)).not.toContain(merchantId);
    });

    it('clears the row once the work completes', async () => {
      await queue.enqueue(merchantId, 'cash_sale_recorded', { type: 'cash' });
      const [claimed] = (await queue.claim(10)).filter(
        (c) => c.merchantId === merchantId,
      );

      await queue.complete(claimed.merchantId);
      expect(await row()).toBeUndefined();
    });

    it('keeps work that arrived while the worker was running', async () => {
      await queue.enqueue(merchantId, 'cash_sale_recorded', { type: 'cash' });
      const [claimed] = (await queue.claim(10)).filter(
        (c) => c.merchantId === merchantId,
      );

      // A sale lands mid-recalculation; its change must not be dropped.
      await new Promise((resolve) => setTimeout(resolve, 5));
      await queue.enqueue(merchantId, 'digital_sale_finalized', {
        type: 'payment_request',
      });

      await queue.complete(claimed.merchantId);

      const still = await row();
      expect(still).toBeDefined();
      expect(still.status).toBe('pending');
    });

    it('returns failed work to pending with the reason recorded', async () => {
      await queue.enqueue(merchantId, 'cash_sale_recorded', { type: 'cash' });
      await queue.claim(10);

      await queue.fail(merchantId, 'calculation blew up');

      const work = await row();
      expect(work.status).toBe('pending');
      expect(work.lastError).toBe('calculation blew up');
    });

    it('counts attempts so a poison item is visible', async () => {
      await queue.enqueue(merchantId, 'cash_sale_recorded', { type: 'cash' });
      await queue.claim(10);
      await queue.fail(merchantId, 'first failure');
      await db.update(schema.merchantAnalyticsWork).set({nextAttemptAt: new Date(0)}).where(eq(schema.merchantAnalyticsWork.merchantId, merchantId));
      await queue.claim(10);

      expect((await row()).attempts).toBe(2);
    });
  });

  describe('backlog reporting', () => {
    it('reports depth and the age of the oldest item', async () => {
      await queue.enqueue(merchantId, 'cash_sale_recorded', { type: 'cash' });
      await queue.enqueue(otherMerchantId, 'stock_adjusted', {
        type: 'product',
      });

      const backlog = await queue.backlog();
      expect(backlog.pending).toBeGreaterThanOrEqual(2);
      expect(backlog.oldestQueuedAt).not.toBeNull();
    });
  });

  it('rejects an invalid outbox write so the source transaction can roll back', async () => {
    // Durable enqueue failures must be observable.
    await expect(
      queue.enqueue(randomUUID(), 'cash_sale_recorded', { type: 'cash' }),
    ).rejects.toThrow();
  });
  it('recovers an expired lease and rejects stale completion', async () => {
    await queue.enqueue(merchantId, 'manual');
    const first = (await queue.claim(100)).find(w=>w.merchantId===merchantId)!;
    await db.update(schema.merchantAnalyticsWork).set({leaseUntil:new Date(0)}).where(eq(schema.merchantAnalyticsWork.merchantId, merchantId));
    const second = (await queue.claim(100)).find(w=>w.merchantId===merchantId)!;
    expect(second.token).not.toBe(first.token);
    await queue.complete(merchantId, first); expect(await row()).toBeDefined();
    await queue.complete(merchantId, second); expect(await row()).toBeUndefined();
  });

  it('does not let disabled merchants starve enabled work and resumes on enablement', async () => {
    await clear();
    await queue.enqueue(otherMerchantId, 'manual');
    await queue.enqueue(merchantId, 'manual');
    await queue.applyEligibility(true, [merchantId]);
    const [work] = await queue.claim(1, [merchantId]);
    expect(work.merchantId).toBe(merchantId);
    expect((await row(otherMerchantId))?.status).toBe('deferred');
    await queue.complete(merchantId, work);
    await queue.applyEligibility(true, [otherMerchantId]);
    const [resumed] = await queue.claim(1, [otherMerchantId]);
    expect(resumed.merchantId).toBe(otherMerchantId);
    await queue.complete(otherMerchantId, resumed);
  });

  it('retains disabled work as deferred for enabling later', async () => {
    await queue.enqueue(merchantId,'manual');
    const work=(await queue.claim(100)).find(w=>w.merchantId===merchantId)!;
    await queue.fail(merchantId,'disabled',work,true);
    expect((await row()).status).toBe('deferred');
    await queue.enqueue(merchantId,'manual');
    expect((await row()).status).toBe('pending');
  });

  it('rolls back the source stock update when its transactional outbox fails', async () => {
    const [product] = await db.insert(schema.merchantProducts).values({merchantId,name:'Outbox rollback',unitPriceMinor:100n,onHandQuantity:5,reservedQuantity:0}).returning();
    try {
      await db.execute(sql.raw(`ALTER TABLE merchant_analytics_outbox ADD CONSTRAINT test_outbox_failure CHECK (merchant_id <> '${merchantId}'::uuid) NOT VALID`));
      await expect(db.update(schema.merchantProducts).set({onHandQuantity:6}).where(eq(schema.merchantProducts.id,product.id))).rejects.toThrow();
      const [unchanged]=await db.select().from(schema.merchantProducts).where(eq(schema.merchantProducts.id,product.id));expect(unchanged.onHandQuantity).toBe(5);
    } finally {
      await db.execute(sql`ALTER TABLE merchant_analytics_outbox DROP CONSTRAINT IF EXISTS test_outbox_failure`);
      await db.delete(schema.merchantProducts).where(eq(schema.merchantProducts.id,product.id));
    }
  });

  it('queues reservation-only changes in the same commit', async () => {
    const [product]=await db.insert(schema.merchantProducts).values({merchantId,name:'Reservation source',unitPriceMinor:100n,onHandQuantity:5,reservedQuantity:0}).returning();
    try {
      const previous=(await row()).generation;
      await db.update(schema.merchantProducts).set({reservedQuantity:3}).where(eq(schema.merchantProducts.id,product.id));
      expect((await row()).generation).toBe(previous+1);
    } finally {await db.delete(schema.merchantProducts).where(eq(schema.merchantProducts.id,product.id));}
  });

});
