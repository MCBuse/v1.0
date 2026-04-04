import { pgTable, uuid, varchar, text, timestamp, inet } from 'drizzle-orm/pg-core';

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'), // nullable — some events happen before auth
  action: varchar('action', { length: 100 }).notNull(), // e.g. 'auth.login', 'transfer.initiated'
  entityType: varchar('entity_type', { length: 50 }), // e.g. 'wallet', 'payment_request'
  entityId: uuid('entity_id'),
  metadata: text('metadata'), // JSON — never include PII or secrets
  ipAddress: inet('ip_address'),
  correlationId: text('correlation_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
