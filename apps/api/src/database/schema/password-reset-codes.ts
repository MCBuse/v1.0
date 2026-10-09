import { pgTable, uuid, text, timestamp, varchar, integer } from 'drizzle-orm/pg-core';
import { users } from './users';

export const passwordResetCodes = pgTable('password_reset_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  channel: varchar('channel', { length: 16 }).notNull(), // 'email' | 'phone'
  codeHash: text('code_hash').notNull(), // bcrypt hash of the 6-digit code
  expiresAt: timestamp('expires_at').notNull(),
  consumedAt: timestamp('consumed_at'),
  attempts: integer('attempts').notNull().default(0), // guesses made against this code
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
