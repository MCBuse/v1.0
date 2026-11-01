import { pgTable, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { users } from './users';

// Separate from password_reset_codes so a verification code can never reset a password.
export const emailVerificationCodes = pgTable('email_verification_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  codeHash: text('code_hash').notNull(), // bcrypt hash of the 6-digit code
  expiresAt: timestamp('expires_at').notNull(),
  consumedAt: timestamp('consumed_at'),
  attempts: integer('attempts').notNull().default(0), // guesses made against this code
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
