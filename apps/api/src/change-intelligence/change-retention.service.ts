import { Inject, Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.provider';
import type { ChangeIntelligenceEnv } from './change-intelligence.config';

export type RetentionSettings = {
  /** Processed (or resolved) event detail. */
  eventDays: number;
  /** Runs, node transitions and resolved cases. */
  historyDays: number;
  batchSize: number;
  /** Per table per execution; the rest waits for the next execution. */
  maxBatches: number;
};

export const DEFAULT_RETENTION: Readonly<RetentionSettings> = Object.freeze({
  eventDays: 90,
  historyDays: 365,
  batchSize: 1000,
  maxBatches: 50,
});

const KEYS: Record<keyof RetentionSettings, [string, number]> = {
  eventDays: ['CHANGE_INTELLIGENCE_RETENTION_EVENT_DAYS', 1],
  historyDays: ['CHANGE_INTELLIGENCE_RETENTION_HISTORY_DAYS', 30],
  batchSize: ['CHANGE_INTELLIGENCE_RETENTION_BATCH_SIZE', 1],
  maxBatches: ['CHANGE_INTELLIGENCE_RETENTION_MAX_BATCHES', 1],
};

/** Reads the retention overrides; anything not a whole number at or above its floor is refused. */
export function retentionSettings(
  env: ChangeIntelligenceEnv = process.env,
): RetentionSettings {
  const settings = { ...DEFAULT_RETENTION };
  for (const [field, [key, min]] of Object.entries(KEYS) as Array<
    [keyof RetentionSettings, [string, number]]
  >) {
    const getter = (env as { get?: unknown }).get;
    const raw: unknown =
      typeof getter === 'function'
        ? (getter as (k: string) => unknown).call(env, key)
        : (env as Record<string, unknown>)[key];
    if (raw === undefined || raw === '') continue;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min)
      throw new Error(`${key} must be a whole number of at least ${min}`);
    settings[field] = value;
  }
  return settings;
}

export type RetentionSummary = {
  events: number;
  cases: number;
  transitions: number;
  runs: number;
  /** False when a table hit maxBatches; the next execution continues. */
  complete: boolean;
};

/**
 * Bounded retention (plan §8). Never deletes pending events, current states,
 * active cases, any case's own transitions while the case exists, the
 * transition a case points to, or a run still referenced by states,
 * transitions or events, or the merchant's latest successful run. Order
 * follows the composite foreign keys: events → resolved cases (with their
 * transitions) → node transitions → runs.
 */
@Injectable()
export class ChangeRetentionService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async run(
    settings: RetentionSettings = DEFAULT_RETENTION,
    options: { merchantId?: string } = {},
  ): Promise<RetentionSummary> {
    const only = (alias: string) =>
      options.merchantId
        ? sql`AND ${sql.raw(alias)}.merchant_id = ${options.merchantId}::uuid`
        : sql``;
    const older = (column: SQL, days: number) =>
      sql`${column} < now() - make_interval(days => ${days})`;
    const limit = settings.batchSize;
    let complete = true;
    const batches = async (statement: SQL): Promise<number> => {
      let total = 0;
      for (let batch = 0; batch < settings.maxBatches; batch += 1) {
        const deleted = (await this.db.execute(statement)).rows.length;
        total += deleted;
        if (deleted < limit) return total;
      }
      complete = false;
      return total;
    };

    const events = await batches(sql`
      DELETE FROM merchant_change_events e WHERE e.id IN (
        SELECT id FROM merchant_change_events
        WHERE status <> 'pending' AND ${older(sql`processed_at`, settings.eventDays)} ${only('merchant_change_events')}
        ORDER BY processed_at LIMIT ${limit})
      RETURNING e.id`);

    // A resolved case goes together with its own transitions (case FK).
    const cases = await batches(sql`
      WITH doomed AS (
        SELECT id, merchant_id FROM merchant_change_cases
        WHERE status = 'resolved' AND ${older(sql`resolved_at`, settings.historyDays)} ${only('merchant_change_cases')}
        ORDER BY resolved_at LIMIT ${limit}),
      own AS (
        DELETE FROM merchant_change_transitions t USING doomed d
        WHERE t.merchant_id = d.merchant_id AND t.case_id = d.id RETURNING t.id)
      DELETE FROM merchant_change_cases c USING doomed d
      WHERE c.id = d.id
      RETURNING c.id`);

    // Node transitions; case transitions stay with their case.
    const transitions = await batches(sql`
      DELETE FROM merchant_change_transitions t WHERE t.id IN (
        SELECT tr.id FROM merchant_change_transitions tr
        WHERE tr.case_id IS NULL AND ${older(sql`tr.created_at`, settings.historyDays)} ${only('tr')}
          AND NOT EXISTS (SELECT 1 FROM merchant_change_cases c
            WHERE c.merchant_id = tr.merchant_id AND c.latest_transition_id = tr.id)
        ORDER BY tr.created_at LIMIT ${limit})
      RETURNING t.id`);

    const runs = await batches(sql`
      DELETE FROM merchant_change_runs r WHERE r.id IN (
        SELECT x.id FROM merchant_change_runs x
        WHERE ${older(sql`x.completed_at`, settings.historyDays)} ${only('x')}
          AND NOT EXISTS (SELECT 1 FROM merchant_change_states s WHERE s.merchant_id = x.merchant_id AND s.run_id = x.id)
          AND NOT EXISTS (SELECT 1 FROM merchant_change_transitions t WHERE t.merchant_id = x.merchant_id AND t.run_id = x.id)
          AND NOT EXISTS (SELECT 1 FROM merchant_change_events e WHERE e.merchant_id = x.merchant_id AND e.run_id = x.id)
          AND x.id IS DISTINCT FROM (SELECT l.id FROM merchant_change_runs l
            WHERE l.merchant_id = x.merchant_id AND l.status = 'succeeded'
            ORDER BY l.completed_at DESC, l.id DESC LIMIT 1)
        ORDER BY x.completed_at LIMIT ${limit})
      RETURNING r.id`);

    return { events, cases, transitions, runs, complete };
  }
}
