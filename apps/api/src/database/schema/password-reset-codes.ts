import { pgTable, uuid, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';

export const passwordResetCodes = pgTable('password_reset_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  channel: varchar('channel', { length: 16 }).notNull(), // 'email' | 'phone'
  codeHash: text('code_hash').notNull(), // bcrypt hash of the 6-digit code
  expiresAt: timestamp('expires_at').notNull(),
  consumedAt: timestamp('consumed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
