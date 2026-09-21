import {
  bigserial,
  index,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { merchants } from './merchants';
import { paymentRequests } from './payment-requests';
import { users } from './users';

/**
 * Durable, ordered log of what a merchant's connected devices need to know.
 *
 * The sequence is a database-assigned bigserial, which gives every consumer a
 * single total order and a cursor they can resume from. A device that was
 * offline asks for everything after the last id it saw rather than guessing.
 */
export const merchantEvents = pgTable(
  'merchant_events',
  {
    sequence: bigserial('sequence', { mode: 'bigint' }).primaryKey(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    type: varchar('type', { length: 48 }).notNull(),
    paymentRequestId: uuid('payment_request_id').references(
      () => paymentRequests.id,
    ),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('merchant_events_merchant_sequence_idx').on(
      table.merchantId,
      table.sequence,
    ),
    index('merchant_events_created_idx').on(table.createdAt),
  ],
);

/**
 * The request a merchant is currently showing on their counter device.
 *
 * Held server-side, one per merchant, so a phone that connects later sees the
 * same thing the desktop is showing rather than having to be told.
 */
export const merchantPresentedRequests = pgTable(
  'merchant_presented_requests',
  {
    merchantId: uuid('merchant_id')
      .primaryKey()
      .references(() => merchants.id),
    paymentRequestId: uuid('payment_request_id')
      .notNull()
      .references(() => paymentRequests.id),
    presentedByUserId: uuid('presented_by_user_id')
      .notNull()
      .references(() => users.id),
    presentedAt: timestamp('presented_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Mirrors the request status so a reconnecting device needs one read. */
    status: varchar('status', { length: 24 }).notNull().default('pending'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('merchant_presented_requests_request_unique').on(
      table.paymentRequestId,
    ),
  ],
);
