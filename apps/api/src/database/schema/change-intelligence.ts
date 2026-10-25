import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import type {
  CaseResolution,
  ChangeCaseStatus,
  ChangeCaseType,
  ChangeIntelligenceSettings,
  ChangeReadiness,
  ChangeSeverity,
  RunReason,
} from '@repo/shared';
import { merchants } from './merchants';
import { users } from './users';

/**
 * Change Intelligence persistence (plan §4.1). Migration
 * 0038_change_intelligence.sql is the source of truth: it also holds the
 * capture triggers (`change_capture_*`), CHECK constraints and RLS.
 */

const tz = { withTimezone: true } as const;

/**
 * One row per merchant, kept after success. Capture triggers only ever bump
 * `requestedRevision`; work is pending while it exceeds `processedRevision`.
 * `status` is owned by the worker. Only the PK is indexed so the per-event
 * bump stays a HOT update (one row per merchant; scans are cheap).
 */
export const merchantChangeWork = pgTable('merchant_change_work', {
  merchantId: uuid('merchant_id')
    .primaryKey()
    .references(() => merchants.id, { onDelete: 'cascade' }),
  requestedRevision: bigint('requested_revision', { mode: 'bigint' })
    .notNull()
    .default(0n),
  processedRevision: bigint('processed_revision', { mode: 'bigint' })
    .notNull()
    .default(0n),
  claimedRevision: bigint('claimed_revision', { mode: 'bigint' }),
  leaseToken: uuid('lease_token'),
  leaseUntil: timestamp('lease_until', tz),
  claimedAt: timestamp('claimed_at', tz),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', tz),
  status: varchar('status', { length: 16 })
    .$type<'idle' | 'processing' | 'failed'>()
    .notNull()
    .default('idle'),
  lastError: text('last_error'),
  requestedReason: varchar('requested_reason', {
    length: 32,
  }).$type<RunReason>(),
  lastRequestedAt: timestamp('last_requested_at', tz).notNull().defaultNow(),
  bootstrapStatus: varchar('bootstrap_status', { length: 16 })
    .$type<'pending' | 'completed'>()
    .notNull()
    .default('pending'),
  modelVersion: varchar('model_version', { length: 64 }),
  settingsFingerprint: varchar('settings_fingerprint', { length: 64 }),
  lastDailyEvaluationDate: date('last_daily_evaluation_date'),
  nextDailyEvaluationAt: timestamp('next_daily_evaluation_at', tz),
  lastSuccessAt: timestamp('last_success_at', tz),
  lastFailureAt: timestamp('last_failure_at', tz),
  lastUpdateNowAt: timestamp('last_update_now_at', tz),
  /** Staff user behind a pending "Update now"; copied to the run, cleared on publish. */
  requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
});

export const merchantChangeRuns = pgTable(
  'merchant_change_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    modelVersion: varchar('model_version', { length: 64 }).notNull(),
    settings: jsonb('settings').$type<ChangeIntelligenceSettings>().notNull(),
    settingsFingerprint: varchar('settings_fingerprint', {
      length: 64,
    }).notNull(),
    asOf: timestamp('as_of', tz).notNull(),
    /** The claimed work revision; every event at or below it was visible. */
    sourceRevision: bigint('source_revision', { mode: 'bigint' }).notNull(),
    sourceCutoffAt: timestamp('source_cutoff_at', tz).notNull(),
    reason: varchar('reason', { length: 32 }).$type<RunReason>().notNull(),
    status: varchar('status', { length: 16 })
      .$type<'succeeded' | 'failed'>()
      .notNull(),
    startedAt: timestamp('started_at', tz).notNull(),
    completedAt: timestamp('completed_at', tz).notNull().defaultNow(),
    durationMs: integer('duration_ms'),
    counts: jsonb('counts').notNull().default({}),
    coverage: jsonb('coverage').notNull().default({}),
    fingerprint: varchar('fingerprint', { length: 64 }),
    error: text('error'),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
  },
  (t) => [
    unique('merchant_change_runs_merchant_id_unique').on(t.merchantId, t.id),
    index('merchant_change_runs_merchant_time').on(
      t.merchantId,
      t.completedAt.desc(),
      t.id.desc(),
    ),
    index('merchant_change_runs_retention').on(t.completedAt),
  ],
);

export const merchantChangeEvents = pgTable(
  'merchant_change_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    /** The work revision this event advanced to, under the work row lock. */
    revision: bigint('revision', { mode: 'bigint' }).notNull(),
    sourceType: varchar('source_type', { length: 40 })
      .$type<
        | 'merchant_transactions'
        | 'merchant_cash_sales'
        | 'merchant_cash_sale_items'
        | 'merchant_products'
        | 'merchant_import_batches'
        | 'merchants'
      >()
      .notNull(),
    sourceId: uuid('source_id').notNull(),
    operation: varchar('operation', { length: 8 })
      .$type<'insert' | 'update' | 'delete'>()
      .notNull(),
    changedFields: text('changed_fields').array().notNull().default([]),
    oldProductId: uuid('old_product_id'),
    newProductId: uuid('new_product_id'),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
    status: varchar('status', { length: 16 })
      .$type<'pending' | 'processed' | 'resolved'>()
      .notNull()
      .default('pending'),
    runId: uuid('run_id'),
    processedAt: timestamp('processed_at', tz),
  },
  (t) => [
    foreignKey({
      name: 'merchant_change_events_run_fk',
      columns: [t.merchantId, t.runId],
      foreignColumns: [merchantChangeRuns.merchantId, merchantChangeRuns.id],
    }),
    index('merchant_change_events_pending')
      .on(t.merchantId, t.revision, t.id)
      .where(sql`${t.status} = 'pending'`),
    index('merchant_change_events_retention')
      .on(t.processedAt)
      .where(sql`${t.status} <> 'pending'`),
    index('merchant_change_events_run')
      .on(t.merchantId, t.runId)
      .where(sql`${t.runId} IS NOT NULL`),
  ],
);

export const merchantChangeStates = pgTable(
  'merchant_change_states',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    /** Null for merchant-level nodes. No FK: history outlives products. */
    productId: uuid('product_id'),
    nodeKey: varchar('node_key', { length: 80 }).notNull(),
    value: jsonb('value').notNull(),
    readiness: varchar('readiness', { length: 32 })
      .$type<ChangeReadiness>()
      .notNull(),
    fingerprint: varchar('fingerprint', { length: 64 }).notNull(),
    version: bigint('version', { mode: 'bigint' }).notNull().default(1n),
    lastChangedAt: timestamp('last_changed_at', tz).notNull(),
    runId: uuid('run_id').notNull(),
  },
  (t) => [
    // NULLS NOT DISTINCT, so ON CONFLICT works for merchant-level nodes too.
    unique('merchant_change_states_identity')
      .on(t.merchantId, t.productId, t.nodeKey)
      .nullsNotDistinct(),
    unique('merchant_change_states_merchant_id_unique').on(t.merchantId, t.id),
    foreignKey({
      name: 'merchant_change_states_run_fk',
      columns: [t.merchantId, t.runId],
      foreignColumns: [merchantChangeRuns.merchantId, merchantChangeRuns.id],
    }),
    index('merchant_change_states_recent').on(
      t.merchantId,
      t.lastChangedAt.desc(),
      t.id.desc(),
    ),
  ],
);

export const merchantChangeCases = pgTable(
  'merchant_change_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').notNull(),
    caseType: varchar('case_type', { length: 40 })
      .$type<ChangeCaseType>()
      .notNull(),
    status: varchar('status', { length: 16 })
      .$type<ChangeCaseStatus>()
      .notNull()
      .default('active'),
    severity: varchar('severity', { length: 16 })
      .$type<ChangeSeverity>()
      .notNull(),
    priority: smallint('priority').notNull(),
    firstDetectedAt: timestamp('first_detected_at', tz).notNull(),
    lastDetectedAt: timestamp('last_detected_at', tz).notNull(),
    lastChangedAt: timestamp('last_changed_at', tz).notNull(),
    /** Plain pointer (transitions reference cases, not the other way). */
    latestTransitionId: uuid('latest_transition_id'),
    resolution: varchar('resolution', { length: 32 }).$type<CaseResolution>(),
    resolvedAt: timestamp('resolved_at', tz),
    evidence: jsonb('evidence').notNull().default({}),
    counters: jsonb('counters').notNull().default({}),
    settings: jsonb('settings').$type<ChangeIntelligenceSettings>().notNull(),
    settingsFingerprint: varchar('settings_fingerprint', {
      length: 64,
    }).notNull(),
    modelVersion: varchar('model_version', { length: 64 }).notNull(),
    identifiedDuringInitialAnalysis: boolean(
      'identified_during_initial_analysis',
    )
      .notNull()
      .default(false),
    notRecheckedSince: date('not_rechecked_since'),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', tz).notNull().defaultNow(),
  },
  (t) => [
    unique('merchant_change_cases_merchant_id_unique').on(t.merchantId, t.id),
    uniqueIndex('merchant_change_cases_one_active')
      .on(t.merchantId, t.productId, t.caseType)
      .where(sql`${t.status} = 'active'`),
    index('merchant_change_cases_recent').on(
      t.merchantId,
      t.lastChangedAt.desc(),
      t.id.desc(),
    ),
    index('merchant_change_cases_attention')
      .on(t.merchantId, t.priority, t.lastChangedAt.desc(), t.id.desc())
      .where(sql`${t.status} = 'active'`),
    index('merchant_change_cases_product').on(
      t.merchantId,
      t.productId,
      t.lastChangedAt.desc(),
    ),
  ],
);

/** Immutable: a BEFORE UPDATE trigger rejects edits. */
export const merchantChangeTransitions = pgTable(
  'merchant_change_transitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    productId: uuid('product_id'),
    nodeKey: varchar('node_key', { length: 80 }).notNull(),
    fromVersion: bigint('from_version', { mode: 'bigint' }),
    toVersion: bigint('to_version', { mode: 'bigint' }).notNull(),
    beforeValue: jsonb('before_value'),
    afterValue: jsonb('after_value').notNull(),
    beforeReadiness: varchar('before_readiness', {
      length: 32,
    }).$type<ChangeReadiness>(),
    afterReadiness: varchar('after_readiness', { length: 32 })
      .$type<ChangeReadiness>()
      .notNull(),
    parentTransitionIds: uuid('parent_transition_ids')
      .array()
      .notNull()
      .default([]),
    runId: uuid('run_id').notNull(),
    explanation: jsonb('explanation').notNull().default({}),
    caseId: uuid('case_id'),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
  },
  (t) => [
    unique('merchant_change_transitions_merchant_id_unique').on(
      t.merchantId,
      t.id,
    ),
    foreignKey({
      name: 'merchant_change_transitions_run_fk',
      columns: [t.merchantId, t.runId],
      foreignColumns: [merchantChangeRuns.merchantId, merchantChangeRuns.id],
    }),
    foreignKey({
      name: 'merchant_change_transitions_case_fk',
      columns: [t.merchantId, t.caseId],
      foreignColumns: [merchantChangeCases.merchantId, merchantChangeCases.id],
    }),
    index('merchant_change_transitions_case')
      .on(t.merchantId, t.caseId, t.createdAt)
      .where(sql`${t.caseId} IS NOT NULL`),
    index('merchant_change_transitions_run').on(t.merchantId, t.runId),
    index('merchant_change_transitions_node').on(
      t.merchantId,
      t.productId,
      t.nodeKey,
      t.createdAt.desc(),
    ),
    index('merchant_change_transitions_retention').on(t.createdAt),
  ],
);
