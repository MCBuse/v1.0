import { pgTable, uuid, varchar, bigint, text, timestamp } from 'drizzle-orm/pg-core';
import { wallets } from './wallets';

export const ledgerEntries = pgTable('ledger_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Double-entry: every transfer has a debit and credit
  debitWalletId: uuid('debit_wallet_id').notNull().references(() => wallets.id),
  creditWalletId: uuid('credit_wallet_id').notNull().references(() => wallets.id),
  amount: bigint('amount', { mode: 'bigint' }).notNull(), // always positive
  currency: varchar('currency', { length: 10 }).notNull(),
  type: varchar('type', { length: 30 }).notNull(), // 'on_ramp' | 'off_ramp' | 'p2p' | 'swap' | 'internal'
  status: varchar('status', { length: 20 }).notNull().default('completed'), // 'pending' | 'completed' | 'failed'
  solanaTxSignature: text('solana_tx_signature'), // on-chain tx hash if applicable
  paymentRequestId: uuid('payment_request_id'), // FK added later to avoid circular ref
  idempotencyKey: text('idempotency_key').unique(), // prevents double-spend on retry
  metadata: text('metadata'), // JSON string for extra context
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
