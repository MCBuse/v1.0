import {
  index,
  uniqueIndex,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { merchants } from './merchants';
import { users } from './users';
import { merchantFinancePackages } from './merchant-workspace';

/**
 * An immutable assessment result.
 *
 * Nothing here is ever updated: a new run writes a new row. That is what lets
 * a finance package cite the exact result a merchant saw, and what stops a
 * later recalculation quietly changing the basis of a package already sent.
 *
 * `modelId` names which model produced it. Today that is only
 * `readiness-rules-v1`, the agreed demonstration fallback. When George's
 * scoring model arrives it writes rows under its own id alongside these,
 * rather than overwriting them.
 */
export const merchantAssessments = pgTable(
  'merchant_assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    idempotencyKey: varchar('idempotency_key', { length: 128 }),
    modelId: varchar('model_id', { length: 64 }).notNull(),
    modelVersion: varchar('model_version', { length: 32 }).notNull(),
    /** The window of activity the result was derived from. */
    evidenceFrom: timestamp('evidence_from', { withTimezone: true }).notNull(),
    evidenceTo: timestamp('evidence_to', { withTimezone: true }).notNull(),
    stage: varchar('stage', { length: 40 }).notNull(),
    /** Full immutable payload: measurements, requirements, limitations. */
    result: jsonb('result').notNull(),
    /** Business profile and consent as they stood at the moment of the run. */
    profileSnapshot: jsonb('profile_snapshot').notNull(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('merchant_assessments_idempotency_unique').on(table.merchantId, table.idempotencyKey),
    index('merchant_assessments_merchant_idx').on(
      table.merchantId,
      table.createdAt,
    ),
  ],
);

/** Ties a finance package to the exact saved assessment it reports. */
export const merchantFinancePackageAssessments = pgTable(
  'merchant_finance_package_assessments',
  {
    packageId: uuid('package_id')
      .primaryKey()
      .references(() => merchantFinancePackages.id),
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => merchantAssessments.id),
    linkedAt: timestamp('linked_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);
