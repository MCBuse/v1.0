import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { ledgerEntries } from './ledger-entries';
import { paymentRequests } from './payment-requests';
import { users } from './users';
import { wallets } from './wallets';

export const merchants = pgTable(
  'merchants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicId: varchar('public_id', { length: 32 }).notNull(),
    businessName: varchar('business_name', { length: 160 }).notNull(),
    timezone: varchar('timezone', { length: 64 })
      .notNull()
      .default('Europe/Berlin'),
    displayCurrency: varchar('display_currency', { length: 3 })
      .notNull()
      .default('EUR'),
    receivingWalletId: uuid('receiving_wallet_id')
      .notNull()
      .references(() => wallets.id),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('merchants_public_id_unique').on(table.publicId),
    uniqueIndex('merchants_receiving_wallet_unique').on(
      table.receivingWalletId,
    ),
  ],
);

export const merchantMemberships = pgTable(
  'merchant_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: varchar('role', { length: 20 }).notNull().default('owner'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('merchant_memberships_merchant_user_unique').on(
      table.merchantId,
      table.userId,
    ),
    index('merchant_memberships_user_idx').on(table.userId),
  ],
);

export const merchantConsentRecords = pgTable(
  'merchant_consent_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    purpose: varchar('purpose', { length: 80 }).notNull(),
    version: varchar('version', { length: 32 }).notNull(),
    action: varchar('action', { length: 12 }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('merchant_consent_records_merchant_time_idx').on(
      table.merchantId,
      table.recordedAt,
    ),
  ],
);

export const merchantPaymentAttempts = pgTable(
  'merchant_payment_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentRequestId: uuid('payment_request_id')
      .notNull()
      .references(() => paymentRequests.id),
    payerUserId: uuid('payer_user_id')
      .notNull()
      .references(() => users.id),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('processing'),
    submittedSignature: text('submitted_signature'),
    errorCode: varchar('error_code', { length: 80 }),
    claimedAt: timestamp('claimed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('merchant_payment_attempts_request_unique').on(
      table.paymentRequestId,
    ),
    uniqueIndex('merchant_payment_attempts_idempotency_unique').on(
      table.idempotencyKey,
    ),
    index('merchant_payment_attempts_status_idx').on(table.status),
  ],
);

export const merchantTransactions = pgTable(
  'merchant_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    receiptNumber: varchar('receipt_number', { length: 32 }).notNull(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    paymentRequestId: uuid('payment_request_id')
      .notNull()
      .references(() => paymentRequests.id),
    ledgerEntryId: uuid('ledger_entry_id')
      .notNull()
      .references(() => ledgerEntries.id),
    displayAmountMinor: bigint('display_amount_minor', {
      mode: 'bigint',
    }).notNull(),
    displayCurrency: varchar('display_currency', { length: 3 })
      .notNull()
      .default('EUR'),
    settlementAmount: bigint('settlement_amount', { mode: 'bigint' }).notNull(),
    settlementCurrency: varchar('settlement_currency', {
      length: 10,
    }).notNull(),
    quoteRateScaled: bigint('quote_rate_scaled', { mode: 'bigint' }).notNull(),
    description: text('description'),
    merchantNameSnapshot: varchar('merchant_name_snapshot', { length: 160 }),
    status: varchar('status', { length: 20 }).notNull().default('finalized'),
    evidenceEnvironment: varchar('evidence_environment', { length: 20 })
      .notNull()
      .default('unknown'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('merchant_transactions_receipt_unique').on(table.receiptNumber),
    uniqueIndex('merchant_transactions_payment_request_unique').on(
      table.paymentRequestId,
    ),
    uniqueIndex('merchant_transactions_ledger_entry_unique').on(
      table.ledgerEntryId,
    ),
    index('merchant_transactions_merchant_time_idx').on(
      table.merchantId,
      table.occurredAt,
    ),
  ],
);

export const merchantCaptureExceptions = pgTable(
  'merchant_capture_exceptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    paymentRequestId: uuid('payment_request_id').references(
      () => paymentRequests.id,
    ),
    reasonCode: varchar('reason_code', { length: 80 }).notNull(),
    severity: varchar('severity', { length: 20 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('open'),
    details: text('details'),
    retryCount: integer('retry_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    index('merchant_capture_exceptions_merchant_status_idx').on(
      table.merchantId,
      table.status,
    ),
  ],
);
