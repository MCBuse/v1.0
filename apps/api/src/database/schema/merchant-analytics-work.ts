import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { merchants } from './merchants';

/**
 * Pending analytics work, one row per merchant.
 *
 * The merchant id is the primary key, which is what makes coalescing free: a
 * hundred sales in a minute leave one row to process, not a hundred. The
 * reasons that produced it are kept so an operator can see what triggered a
 * recalculation rather than just that one happened.
 */
export const merchantAnalyticsWork = pgTable('merchant_analytics_work', {
  merchantId: uuid('merchant_id')
    .primaryKey()
    .references(() => merchants.id),
  status: varchar('status', { length: 16 }).notNull().default('pending'),
  /** Append-only within a cycle: {reason, sourceType, sourceId, at}. */
  reasons: jsonb('reasons').notNull().default([]),
  firstQueuedAt: timestamp('first_queued_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  /** Bumped on every enqueue; the worker uses it to detect work that
   *  arrived while it was already running. */
  lastQueuedAt: timestamp('last_queued_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
});
