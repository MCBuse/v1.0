import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { wallets } from './wallets';
import { ledgerEntries } from './ledger-entries';

/**
 * One durable record per money movement, covering reservations, provider
 * collection, chain submission and finality, payouts and recovery.
 *
 * The status column is the authoritative resume point. A process that dies
 * mid-flight leaves the row at its last *confirmed* step, never at an
 * optimistic one, so recovery can always tell what it is safe to do next.
 */
export const financialOperations = pgTable(
  'financial_operations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    kind: varchar('kind', { length: 32 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('created'),

    // Client-supplied key plus a hash of the inputs it was first used with.
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    inputFingerprint: varchar('input_fingerprint', { length: 64 }).notNull(),

    sourceWalletId: uuid('source_wallet_id').references(() => wallets.id),
    destinationWalletId: uuid('destination_wallet_id').references(
      () => wallets.id,
    ),

    // Settlement amount, always in token base units.
    amountBaseUnits: bigint('amount_base_units', { mode: 'bigint' }).notNull(),
    currency: varchar('currency', { length: 10 }).notNull(),

    // What the person was shown, kept separate from what settled.
    displayAmountMinor: bigint('display_amount_minor', { mode: 'bigint' }),
    displayCurrency: varchar('display_currency', { length: 10 }),
    quoteRateScaled: bigint('quote_rate_scaled', { mode: 'bigint' }),
    quotedAt: timestamp('quoted_at', { withTimezone: true }),

    provider: varchar('provider', { length: 32 }),
    providerRef: varchar('provider_ref', { length: 255 }),
    providerStatus: varchar('provider_status', { length: 64 }),
    paymentIntentId: varchar('payment_intent_id', { length: 255 }),
    refundId: varchar('refund_id', { length: 255 }),
    refundStatus: varchar('refund_status', { length: 64 }),
    providerDestinationId: varchar('provider_destination_id', { length: 255 }),
    providerAccountId: varchar('provider_account_id', { length: 255 }),

    chainSignature: varchar('chain_signature', { length: 128 }),
    chainStatus: varchar('chain_status', { length: 32 }),

    // Set when this operation compensates an earlier one.
    reversalOfOperationId: uuid('reversal_of_operation_id'),

    ledgerEntryId: uuid('ledger_entry_id').references(() => ledgerEntries.id),

    failureCode: varchar('failure_code', { length: 80 }),
    failureDetail: text('failure_detail'),

    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),

    // A lease held by whichever worker is acting on this operation right now.
    // `nextAttemptAt` says when work is due; these say who has it.
    claimedUntil: timestamp('claimed_until', { withTimezone: true }),
    claimedBy: varchar('claimed_by', { length: 64 }),

    reservedAt: timestamp('reserved_at', { withTimezone: true }),
    collectionSettledAt: timestamp('collection_settled_at', {
      withTimezone: true,
    }),
    chainSubmittedAt: timestamp('chain_submitted_at', { withTimezone: true }),
    chainConfirmedAt: timestamp('chain_confirmed_at', { withTimezone: true }),
    payoutSubmittedAt: timestamp('payout_submitted_at', { withTimezone: true }),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),

    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('financial_operations_idempotency_unique').on(
      table.userId,
      table.idempotencyKey,
    ),
    index('financial_operations_status_idx').on(
      table.status,
      table.nextAttemptAt,
      table.claimedUntil,
    ),
    index('financial_operations_user_idx').on(table.userId, table.createdAt),
    index('financial_operations_provider_ref_idx').on(table.providerRef),
    index('financial_operations_chain_signature_idx').on(table.chainSignature),
  ],
);

/**
 * Append-only. Every status change, provider response and recovery decision
 * lands here so a late failure is an added fact rather than an edit.
 */
export const financialOperationEvents = pgTable(
  'financial_operation_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    operationId: uuid('operation_id')
      .notNull()
      .references(() => financialOperations.id),
    sequence: integer('sequence').notNull(),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    fromStatus: varchar('from_status', { length: 32 }),
    toStatus: varchar('to_status', { length: 32 }),
    detail: jsonb('detail'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('financial_operation_events_sequence_unique').on(
      table.operationId,
      table.sequence,
    ),
    index('financial_operation_events_operation_idx').on(table.operationId),
  ],
);

/**
 * Registry of wallet-encryption key versions. The key material itself lives in
 * Secret Manager; this table only records which versions exist, when they were
 * introduced and whether they may still be used for decryption.
 */
export const walletEncryptionKeyVersions = pgTable(
  'wallet_encryption_key_versions',
  {
    version: varchar('version', { length: 32 }).primaryKey(),
    /** SHA-256 of the key, for detecting a misconfigured secret — never the key. */
    keyChecksum: varchar('key_checksum', { length: 64 }).notNull(),
    isCurrent: boolean('is_current').notNull().default(false),
    introducedAt: timestamp('introduced_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Set only after every wallet has been re-encrypted and recovery checked. */
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    notes: text('notes'),
  },
);

/**
 * Persisted provider events. Stripe delivers at least once and out of order,
 * so the event id is the primary key and processing is keyed off it.
 */
export const providerWebhookEvents = pgTable(
  'provider_webhook_events',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    provider: varchar('provider', { length: 32 }).notNull(),
    eventType: varchar('event_type', { length: 128 }).notNull(),
    /** Provider-side creation time, used to discard stale out-of-order events. */
    providerCreatedAt: timestamp('provider_created_at', { withTimezone: true }),
    payloadHash: varchar('payload_hash', { length: 64 }).notNull(),
    status: varchar('status', { length: 24 }).notNull().default('received'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    errorDetail: text('error_detail'),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('provider_webhook_events_type_idx').on(
      table.provider,
      table.eventType,
      table.receivedAt,
    ),
  ],
);

/** Signed bytes are private recovery material; never serialize these rows publicly. */
export const chainAttempts = pgTable('chain_attempts', {
  signature: varchar('signature', { length: 128 }).primaryKey(),
  intentKey: text('intent_key').unique(),
  inputFingerprint: text('input_fingerprint'),
  signedTransaction: text('signed_transaction').notNull(),
  blockhash: varchar('blockhash', { length: 128 }).notNull(),
  lastValidBlockHeight: bigint('last_valid_block_height', { mode: 'number' }).notNull(),
  network: varchar('network', { length: 24 }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('prepared'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
