import {
  pgTable,
  uuid,
  varchar,
  bigint,
  text,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';
import { wallets } from './wallets';

export type LineItem = {
  name: string;
  quantity: number;
  unitAmount: string; // base units (USDC/EURC have 6 decimals)
};

export const paymentRequests = pgTable('payment_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  creatorWalletId: uuid('creator_wallet_id')
    .notNull()
    .references(() => wallets.id),
  type: varchar('type', { length: 10 }).notNull(), // 'static' | 'dynamic'
  amount: bigint('amount', { mode: 'bigint' }), // null for static QR
  currency: varchar('currency', { length: 10 }), // 'USDC' | 'EURC'
  description: text('description'),
  lineItems: jsonb('line_items').$type<LineItem[]>(), // optional itemised invoice
  nonce: text('nonce').notNull().unique(),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending' | 'completed' | 'expired' | 'cancelled'
  expiresAt: timestamp('expires_at'), // null = never expires (static QR)
  completedAt: timestamp('completed_at'),
  ledgerEntryId: uuid('ledger_entry_id'), // set when paid
  merchantId: uuid('merchant_id'), // FK added in migration to avoid a circular schema import
  displayAmountMinor: bigint('display_amount_minor', { mode: 'bigint' }),
  displayCurrency: varchar('display_currency', { length: 3 }),
  quoteRateScaled: bigint('quote_rate_scaled', { mode: 'bigint' }), // EUR per USDC, scaled to 1e6
  quotedAt: timestamp('quoted_at', { withTimezone: true }),
  processingAt: timestamp('processing_at', { withTimezone: true }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
