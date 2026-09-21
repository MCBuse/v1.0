import {
  boolean,
  index,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { merchants } from './merchants';
import type { CreditProfile } from '@repo/shared';
export const merchantCreditProfiles = pgTable('merchant_credit_profiles', {
  merchantId: uuid('merchant_id')
    .primaryKey()
    .references(() => merchants.id),
  data: jsonb('data').$type<CreditProfile>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const staffPermissions = pgTable('staff_permissions', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  permission: varchar('permission', { length: 40 })
    .notNull()
    .default('credit_analyst'),
  active: boolean('active').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const creditPilotEnrollments = pgTable('credit_pilot_enrollments', {
  merchantId: uuid('merchant_id')
    .primaryKey()
    .references(() => merchants.id),
  active: boolean('active').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const staffCreditAssessments = pgTable(
  'staff_credit_assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id').references(() => merchants.id),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    synthetic: boolean('synthetic').notNull(),
    modelVersion: varchar('model_version', { length: 64 }).notNull(),
    input: jsonb('input').notNull(),
    result: jsonb('result').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    inputFingerprint: varchar('input_fingerprint', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('staff_credit_assessments_idempotency').on(
      t.actorUserId,
      t.idempotencyKey,
    ),
    index('staff_credit_assessments_merchant_time').on(
      t.merchantId,
      t.createdAt,
    ),
  ],
);
