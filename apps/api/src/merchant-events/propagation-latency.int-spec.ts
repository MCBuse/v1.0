import { ConfigService } from '@nestjs/config';
import { eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { filter, firstValueFrom, take, timeout } from 'rxjs';
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
import { MerchantEventsService } from './merchant-events.service';
import { percentile } from '../common/percentile';

/**
 * Q.12 and P.3 — how long a change actually takes to reach another instance,
 * measured rather than asserted once.
 *
 * The existing suite proves one event arrives inside two seconds. That is a
 * pass/fail on a single sample, which says nothing about the tail. This
 * measures a run of events and reports the distribution, so the two-second
 * target is checked against a p95 rather than against whichever sample
 * happened to be taken.
 */
describe('event propagation latency (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let writer: MerchantEventsService;
  let reader: MerchantEventsService;
  let merchant: MerchantFixture;
  let requestId: string;

  /** Enough samples for a p95 to mean something without making the suite slow. */
  const SAMPLES = 40;
  const TARGET_P95_MS = 2_000;

  beforeAll(async () => {
    const connection = await connectTestDatabase();
    db = connection.db;
    pool = connection.pool;

    const config = new ConfigService();
    writer = new MerchantEventsService(db, config);
    reader = new MerchantEventsService(db, config);
    // Only the reader listens: anything it sees crossed the database.
    await reader.onModuleInit();

    merchant = await createMerchantFixture(db, 'Latency');

    const [request] = await db
      .insert(schema.paymentRequests)
      .values({
        merchantId: merchant.merchantId,
        creatorWalletId: merchant.routineWalletId,
        nonce: randomUUID(),
        type: 'dynamic',
        amount: 500n,
        currency: 'USDC',
        status: 'pending',
        displayAmountMinor: 500n,
        displayCurrency: 'EUR',
        quoteRateScaled: 920_000_000n,
        expiresAt: new Date(Date.now() + 3_600_000),
      })
      .returning({ id: schema.paymentRequests.id });
    requestId = request.id;
  });

  afterAll(async () => {
    await reader.onModuleDestroy?.();
    await db
      .delete(schema.merchantEvents)
      .where(eq(schema.merchantEvents.merchantId, merchant.merchantId));
    await db
      .delete(schema.paymentRequests)
      .where(inArray(schema.paymentRequests.id, [requestId]));
    await destroyMerchantFixture(db, merchant);
    await pool.end();
  });

  it('keeps cross-instance propagation inside two seconds at the 95th percentile', async () => {
    const samples: number[] = [];

    for (let index = 0; index < SAMPLES; index += 1) {
      const marker = randomUUID();
      const received = firstValueFrom(
        reader.streamFor(merchant.merchantId).pipe(
          filter((event) => (event.payload as { marker?: string }).marker === marker),
          take(1),
          timeout(10_000),
        ),
      );
      const startedAt = performance.now();

      await writer.publish({
        merchantId: merchant.merchantId,
        type: 'request_status_changed',
        paymentRequestId: requestId,
        payload: { marker },
      });

      await received;
      samples.push(performance.now() - startedAt);
    }

    const p50 = percentile(samples, 50);
    const p95 = percentile(samples, 95);
    const worst = Math.max(...samples);

    // Reported, not just asserted: a number nobody can read is not evidence.
    process.stdout.write(
      `propagation over ${SAMPLES} events — p50 ${p50.toFixed(1)}ms, p95 ${p95.toFixed(1)}ms, max ${worst.toFixed(1)}ms\n`,
    );

    expect(samples).toHaveLength(SAMPLES);
    expect(p95).toBeLessThan(TARGET_P95_MS);
  }, 120_000);

  it('delivers a burst without the tail collapsing', async () => {
    // Twenty events published back to back: the interesting question is
    // whether the last one is as fast as the first.
    const markers: string[] = Array.from({ length: 20 }, () => randomUUID());
    const seen = new Map<string, number>();
    const subscription = reader
      .streamFor(merchant.merchantId)
      .subscribe((event) => {
        const marker = (event.payload as { marker?: string }).marker;
        if (marker && markers.includes(marker))
          seen.set(marker, performance.now());
      });

    const publishedAt = new Map<string, number>();
    for (const marker of markers) {
      publishedAt.set(marker, performance.now());
      await writer.publish({
        merchantId: merchant.merchantId,
        type: 'request_status_changed',
        paymentRequestId: requestId,
        payload: { marker },
      });
    }

    const deadline = Date.now() + 15_000;
    while (seen.size < markers.length && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    subscription.unsubscribe();

    expect(seen.size).toBe(markers.length);
    const latencies = markers.map(
      (marker) => seen.get(marker)! - publishedAt.get(marker)!,
    );
    process.stdout.write(
      `burst of ${markers.length} — p95 ${percentile(latencies, 95).toFixed(1)}ms\n`,
    );
    expect(percentile(latencies, 95)).toBeLessThan(TARGET_P95_MS);
  }, 120_000);
});
