import { pgTable, uuid, varchar, bigint, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { wallets } from './wallets';

export const balances = pgTable('balances', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletId: uuid('wallet_id').notNull().references(() => wallets.id),
  currency: varchar('currency', { length: 10 }).notNull(), // 'USDC' | 'EURC'
  // Store amounts as integers (minor units / lamports) — NO floating point
  available: bigint('available', { mode: 'bigint' }).default(sql`0`).notNull(),
  pending: bigint('pending', { mode: 'bigint' }).default(sql`0`).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
