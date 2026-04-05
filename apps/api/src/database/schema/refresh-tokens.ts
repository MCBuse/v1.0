import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core';
import { users } from './users';

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  jti: uuid('jti').notNull().unique(), // JWT ID — allows O(1) lookup without full-table bcrypt scan
  tokenHash: text('token_hash').notNull().unique(), // bcrypt hash of the raw token
  isRevoked: boolean('is_revoked').default(false).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  revokedAt: timestamp('revoked_at'),
});
