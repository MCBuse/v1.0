import {
  pgTable,
  uuid,
  varchar,
  bigint,
  text,
  numeric,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { wallets } from './wallets';
import { ledgerEntries } from './ledger-entries';

export const offrampTransactions = pgTable(
  'offramp_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id),
    ledgerEntryId: uuid('ledger_entry_id').references(() => ledgerEntries.id),
    provider: varchar('provider', { length: 32 }).notNull(),
    externalTransactionId: varchar('external_transaction_id', { length: 128 }),
    internalReference: varchar('internal_reference', { length: 128 }).notNull(),
    cryptoAmount: bigint('crypto_amount', { mode: 'bigint' }).notNull(),
    cryptoCurrency: varchar('crypto_currency', { length: 20 }).notNull().default('USDC'),
    fiatAmount: numeric('fiat_amount', { precision: 20, scale: 8 }),
    fiatCurrency: varchar('fiat_currency', { length: 10 }).notNull().default('USD'),
    network: varchar('network', { length: 32 }).notNull().default('solana'),
    refundWalletAddress: text('refund_wallet_address').notNull(),
    depositWalletAddress: text('deposit_wallet_address'),
    depositWalletAddressTag: text('deposit_wallet_address_tag'),
    depositTxHash: text('deposit_tx_hash'),
    refundTxHash: text('refund_tx_hash'),
    trackerUrl: text('tracker_url'),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    rawWebhookPayload: jsonb('raw_webhook_payload'),
    depositInitiatedAt: timestamp('deposit_initiated_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('offramp_transactions_internal_reference_uidx').on(
      table.internalReference,
    ),
    uniqueIndex('offramp_transactions_provider_external_uidx')
      .on(table.provider, table.externalTransactionId)
      .where(sql`${table.externalTransactionId} IS NOT NULL`),
    uniqueIndex('offramp_transactions_deposit_tx_hash_uidx')
      .on(table.depositTxHash)
      .where(sql`${table.depositTxHash} IS NOT NULL`),
    index('offramp_transactions_user_status_idx').on(table.userId, table.status),
  ],
);
