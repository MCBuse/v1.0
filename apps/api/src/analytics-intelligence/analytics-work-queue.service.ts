import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';

export type WorkReason =
  | 'digital_sale_finalized'
  | 'cash_sale_recorded'
  | 'cash_sale_voided'
  | 'stock_adjusted'
  | 'import_committed'
  | 'manual';

export interface WorkTrigger {
  reason: WorkReason;
  sourceType: string;
  sourceId: string | null;
  at: string;
}

/** How many reasons to keep per pending row before dropping the oldest. */
const MAX_RETAINED_REASONS = 20;

/**
 * The queue behind "a sale or stock change eventually refreshes the insight".
 *
 * One row per merchant, so a busy hour coalesces into a single unit of work
 * rather than a backlog. Enqueuing happens inside the caller's transaction
 * where possible, so work is only queued if the change it describes actually
 * committed.
 */
@Injectable()
export class AnalyticsWorkQueueService {
  private readonly logger = new Logger(AnalyticsWorkQueueService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Records that a merchant's derived figures are stale.
   *
   * Never throws: failing to queue a recalculation must not roll back the sale
   * that caused it. A missed enqueue costs freshness, not money, and the next
   * change or the scheduled sweep picks it up.
   */
  async enqueue(
    merchantId: string,
    reason: WorkReason,
    source: { type: string; id?: string | null } = { type: 'unknown' },
  ): Promise<void> {
    const trigger: WorkTrigger = {
      reason,
      sourceType: source.type,
      sourceId: source.id ?? null,
      at: new Date().toISOString(),
    };

    try {
      await this.db.execute(sql`
        INSERT INTO merchant_analytics_work
          (merchant_id, status, reasons, first_queued_at, last_queued_at)
        VALUES (
          ${merchantId}::uuid,
          'pending',
          ${JSON.stringify([trigger])}::jsonb,
          now(),
          now()
        )
        ON CONFLICT (merchant_id) DO UPDATE SET
          status = 'pending',
          last_queued_at = now(),
          reasons = (
            SELECT jsonb_agg(value)
            FROM (
              SELECT value
              FROM jsonb_array_elements(
                merchant_analytics_work.reasons || ${JSON.stringify([trigger])}::jsonb
              ) WITH ORDINALITY AS t(value, ord)
              ORDER BY ord DESC
              LIMIT ${MAX_RETAINED_REASONS}
            ) recent
          )
      `);
    } catch (error) {
      this.logger.warn(
        `Could not queue analytics work for ${merchantId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Claims up to `limit` merchants, marking them in progress. */
  async claim(
    limit = 10,
  ): Promise<
    Array<{ merchantId: string; lastQueuedAt: Date; attempts: number }>
  > {
    const pending = await this.db
      .select()
      .from(schema.merchantAnalyticsWork)
      .where(eq(schema.merchantAnalyticsWork.status, 'pending'))
      .orderBy(asc(schema.merchantAnalyticsWork.lastQueuedAt))
      .limit(limit);

    const claimed: Array<{
      merchantId: string;
      lastQueuedAt: Date;
      attempts: number;
    }> = [];

    for (const row of pending) {
      // The status guard makes the claim atomic between competing workers.
      const updated = await this.db
        .update(schema.merchantAnalyticsWork)
        .set({
          status: 'processing',
          claimedAt: new Date(),
          attempts: row.attempts + 1,
        })
        .where(
          sql`${schema.merchantAnalyticsWork.merchantId} = ${row.merchantId}::uuid
              AND ${schema.merchantAnalyticsWork.status} = 'pending'`,
        )
        .returning({ merchantId: schema.merchantAnalyticsWork.merchantId });

      if (updated.length === 1) {
        claimed.push({
          merchantId: row.merchantId,
          lastQueuedAt: row.lastQueuedAt,
          attempts: row.attempts + 1,
        });
      }
    }

    return claimed;
  }

  /**
   * Clears completed work — but only if nothing new arrived while it ran.
   *
   * The status itself carries that answer: claiming sets `processing`, and
   * any enqueue sets `pending` again. So deleting only a row still marked
   * `processing` keeps work that landed mid-calculation, with no timestamp
   * comparison to get wrong. Postgres keeps microseconds where a JavaScript
   * Date keeps milliseconds, and that difference silently broke the first
   * version of this.
   */
  async complete(merchantId: string): Promise<void> {
    await this.db
      .delete(schema.merchantAnalyticsWork)
      .where(
        and(
          eq(schema.merchantAnalyticsWork.merchantId, merchantId),
          eq(schema.merchantAnalyticsWork.status, 'processing'),
        ),
      );
  }

  async fail(merchantId: string, message: string): Promise<void> {
    await this.db
      .update(schema.merchantAnalyticsWork)
      .set({
        status: 'pending',
        claimedAt: null,
        lastError: message.slice(0, 2000),
      })
      .where(eq(schema.merchantAnalyticsWork.merchantId, merchantId));
  }

  /** Queue depth and age, for the freshness and backlog reporting. */
  async backlog(): Promise<{
    pending: number;
    processing: number;
    oldestQueuedAt: string | null;
  }> {
    const rows = await this.db.select().from(schema.merchantAnalyticsWork);
    const oldest = rows
      .map((row) => row.firstQueuedAt)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    return {
      pending: rows.filter((row) => row.status === 'pending').length,
      processing: rows.filter((row) => row.status === 'processing').length,
      oldestQueuedAt: oldest ? oldest.toISOString() : null,
    };
  }
}
