import {
  pgTable,
  uuid,
  varchar,
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

export const onrampTransactions = pgTable(
  'onramp_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id),
    provider: varchar('provider', { length: 32 }).notNull(),
    /** MoonPay (or other provider) transaction id once known */
    externalTransactionId: varchar('external_transaction_id', { length: 128 }),
    /** Passed to provider as externalTransactionId for correlation */
    internalReference: varchar('internal_reference', { length: 128 }).notNull(),
    fiatAmount: numeric('fiat_amount', { precision: 20, scale: 8 }).notNull(),
    fiatCurrency: varchar('fiat_currency', { length: 10 }).notNull(),
    cryptoAmount: numeric('crypto_amount', { precision: 30, scale: 18 }),
    cryptoCurrency: varchar('crypto_currency', { length: 20 })
      .notNull()
      .default('USDC'),
    network: varchar('network', { length: 32 }).notNull().default('solana'),
    walletAddress: text('wallet_address').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    txHash: text('tx_hash'),
    rawWebhookPayload: jsonb('raw_webhook_payload'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('onramp_transactions_internal_reference_uidx').on(
      table.internalReference,
    ),
    uniqueIndex('onramp_transactions_provider_external_uidx')
      .on(table.provider, table.externalTransactionId)
      .where(sql`${table.externalTransactionId} IS NOT NULL`),
    uniqueIndex('onramp_transactions_tx_hash_uidx')
      .on(table.txHash)
      .where(sql`${table.txHash} IS NOT NULL`),
    index('onramp_transactions_wallet_status_idx').on(
      table.walletAddress,
      table.status,
    ),
  ],
);
