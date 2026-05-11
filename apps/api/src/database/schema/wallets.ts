import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const wallets = pgTable('wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  type: varchar('type', { length: 20 }).notNull(), // 'savings' | 'routine'
  solanaPubkey: text('solana_pubkey').notNull().unique(),
  // Legacy custodial keypair. Null for Privy-managed wallets; column dropped in the cutover migration.
  encryptedKeypair: text('encrypted_keypair'),
  privyWalletId: varchar('privy_wallet_id', { length: 100 }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
