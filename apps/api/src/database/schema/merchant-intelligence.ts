import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { merchants } from './merchants';

export const merchantAnalyticsSnapshots = pgTable(
  'merchant_analytics_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
    calculationVersion: varchar('calculation_version', { length: 64 }).notNull(),
    inputFingerprint: varchar('input_fingerprint', { length: 64 }).notNull(),
    periodFrom: timestamp('period_from', { withTimezone: true }).notNull(),
    periodTo: timestamp('period_to', { withTimezone: true }).notNull(),
    sourceCoverage: jsonb('source_coverage').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('merchant_analytics_snapshot_fingerprint_unique').on(
      table.merchantId,
      table.calculationVersion,
      table.inputFingerprint,
    ),
    index('merchant_analytics_snapshot_latest_idx').on(table.merchantId, table.generatedAt),
  ],
);

export const merchantInsights = pgTable(
  'merchant_insights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
    snapshotId: uuid('snapshot_id').notNull().references(() => merchantAnalyticsSnapshots.id),
    code: varchar('code', { length: 100 }).notNull(),
    kind: varchar('kind', { length: 32 }).notNull(),
    priority: integer('priority').notNull(),
    title: varchar('title', { length: 240 }).notNull(),
    summary: text('summary').notNull(),
    recommendation: text('recommendation'),
    evidence: jsonb('evidence').notNull(),
    limitations: jsonb('limitations').notNull(),
    narrationSource: varchar('narration_source', { length: 24 }).notNull().default('deterministic'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('merchant_insights_snapshot_code_unique').on(table.snapshotId, table.code),
    index('merchant_insights_active_idx').on(table.merchantId, table.active, table.priority),
  ],
);

export const merchantAnalyticsRuns = pgTable(
  'merchant_analytics_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    status: varchar('status', { length: 20 }).notNull().default('running'),
    calculationVersion: varchar('calculation_version', { length: 64 }).notNull(),
    processedMerchants: integer('processed_merchants').notNull().default(0),
    failedMerchants: integer('failed_merchants').notNull().default(0),
    errorSummary: text('error_summary'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [index('merchant_analytics_runs_started_idx').on(table.startedAt)],
);

export const merchantNarrationCache = pgTable(
  'merchant_narration_cache',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
    inputFingerprint: varchar('input_fingerprint', { length: 64 }).notNull(),
    calculationVersion: varchar('calculation_version', { length: 64 }).notNull(),
    model: varchar('model', { length: 80 }).notNull(),
    promptVersion: varchar('prompt_version', { length: 64 }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('success'),
    output: jsonb('output').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('merchant_narration_cache_key_unique').on(
      table.merchantId,
      table.inputFingerprint,
      table.calculationVersion,
      table.model,
      table.promptVersion,
    ),
    index('merchant_narration_cache_created_idx').on(table.createdAt),
    index('merchant_narration_cache_usage_idx').on(table.status, table.createdAt, table.merchantId),
  ],
);
