import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createHash } from 'crypto';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';

export interface WebhookClaim {
  /** False when this event has already been processed. */
  shouldProcess: boolean;
  duplicate: boolean;
  /** True when the same id arrived with a different body. */
  conflicting: boolean;
}

/**
 * Persists provider events and decides whether one should be acted on.
 *
 * Stripe delivers at least once and does not guarantee order. The event id is
 * the primary key, so a redelivery is recognised rather than replayed, and a
 * retry after a crash mid-processing is picked up again instead of being lost.
 */
@Injectable()
export class ProviderWebhookService {
  private readonly logger = new Logger(ProviderWebhookService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Claims an event for processing. The insert is the lock: only the caller
   * whose row lands actually does the work.
   */
  async claim(event: {
    id: string;
    provider: string;
    type: string;
    payload: string;
    createdAt?: Date | null;
  }): Promise<WebhookClaim> {
    const payloadHash = createHash('sha256')
      .update(event.payload)
      .digest('hex');

    const inserted = await this.db
      .insert(schema.providerWebhookEvents)
      .values({
        id: event.id,
        provider: event.provider,
        eventType: event.type,
        providerCreatedAt: event.createdAt ?? null,
        payloadHash,
        status: 'processing',
      })
      .onConflictDoNothing({ target: schema.providerWebhookEvents.id })
      .returning({ id: schema.providerWebhookEvents.id });

    if (inserted.length === 1) {
      return { shouldProcess: true, duplicate: false, conflicting: false };
    }

    const [existing] = await this.db
      .select()
      .from(schema.providerWebhookEvents)
      .where(eq(schema.providerWebhookEvents.id, event.id))
      .limit(1);

    if (!existing) {
      // Vanishingly unlikely, but do not silently drop the event.
      return { shouldProcess: true, duplicate: false, conflicting: false };
    }

    if (existing.payloadHash !== payloadHash) {
      this.logger.warn(
        `Provider event ${event.id} re-delivered with a different body; not reprocessing`,
      );
      return { shouldProcess: false, duplicate: true, conflicting: true };
    }

    if (existing.status === 'processed') {
      return { shouldProcess: false, duplicate: true, conflicting: false };
    }

    // A previous attempt started but never finished: allow another go.
    return { shouldProcess: true, duplicate: true, conflicting: false };
  }

  async markProcessed(eventId: string): Promise<void> {
    await this.db
      .update(schema.providerWebhookEvents)
      .set({ status: 'processed', processedAt: new Date(), errorDetail: null })
      .where(eq(schema.providerWebhookEvents.id, eventId));
  }

  async markFailed(eventId: string, detail: string): Promise<void> {
    await this.db
      .update(schema.providerWebhookEvents)
      .set({ status: 'failed', errorDetail: detail.slice(0, 2000) })
      .where(eq(schema.providerWebhookEvents.id, eventId));
  }

  /**
   * True when a newer event for the same object has already been processed.
   * Used to discard an out-of-order delivery rather than moving state back.
   */
  async isSupersededBy(params: {
    provider: string;
    eventType: string;
    createdAt: Date | null;
  }): Promise<boolean> {
    if (!params.createdAt) return false;
    const [row] = await this.db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(schema.providerWebhookEvents)
      .where(
        and(
          eq(schema.providerWebhookEvents.provider, params.provider),
          eq(schema.providerWebhookEvents.eventType, params.eventType),
          eq(schema.providerWebhookEvents.status, 'processed'),
          sql`${schema.providerWebhookEvents.providerCreatedAt} > ${params.createdAt}`,
        ),
      );
    return (row?.count ?? 0) > 0;
  }
}
