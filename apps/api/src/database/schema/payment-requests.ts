import { pgTable, uuid, varchar, bigint, text, timestamp, boolean } from 'drizzle-orm/pg-core';
import { wallets } from './wallets';

export const paymentRequests = pgTable('payment_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  creatorWalletId: uuid('creator_wallet_id').notNull().references(() => wallets.id),
  type: varchar('type', { length: 10 }).notNull(), // 'static' | 'dynamic'
  amount: bigint('amount', { mode: 'bigint' }), // null for static QR
  currency: varchar('currency', { length: 10 }), // 'USDC' | 'EURC'
  description: text('description'),
  nonce: text('nonce').notNull().unique(),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending' | 'completed' | 'expired' | 'cancelled'
  expiresAt: timestamp('expires_at'), // null = never expires (static QR)
  completedAt: timestamp('completed_at'),
  ledgerEntryId: uuid('ledger_entry_id'), // set when paid
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
