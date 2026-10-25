import { Inject, Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import type { RunReason } from '@repo/shared';
import { DRIZZLE, type DrizzleDB } from '../database/database.provider';
import { ChangeIntelligenceConfig } from './change-intelligence.config';
import { MODEL_VERSION } from './engine/registry';

/** Either the pool-backed database or an open transaction. */
export type ChangeDbExecutor = Pick<DrizzleDB, 'execute'>;

export const LEASE_SECONDS = 120;
export const RENEW_MS = 30_000;
/** Backoff after failed attempt 1..4; attempt 5 marks the work `failed` (§4.5). */
export const RETRY_BACKOFF_MINUTES = [1, 5, 15, 60] as const;
export const MAX_ATTEMPTS = 5;

/** Full re-evaluation reasons; a later clock/source request never overrides them. */
const FULL_REASONS: RunReason[] = [
  'model_upgrade',
  'settings_change',
  'reconciliation',
];

export type ClaimedChangeWork = {
  merchantId: string;
  token: string;
  /** Every event with revision <= this is committed (the trigger holds the row lock). */
  claimedRevision: bigint;
  processedRevision: bigint;
  requestedReason: RunReason | null;
  bootstrapStatus: 'pending' | 'completed';
  modelVersion: string | null;
  settingsFingerprint: string | null;
  lastDailyEvaluationDate: string | null;
  attempts: number;
  /** Staff user behind a pending "Update now", recorded on the run. */
  requestedByUserId: string | null;
};

export class LeaseLostError extends Error {
  constructor(merchantId: string, detail: string) {
    super(`Change work lease lost for ${merchantId}: ${detail}`);
    this.name = 'LeaseLostError';
  }
}

type ClaimRow = {
  merchant_id: string;
  lease_token: string;
  claimed_revision: string;
  processed_revision: string;
  requested_reason: RunReason | null;
  bootstrap_status: 'pending' | 'completed';
  model_version: string | null;
  settings_fingerprint: string | null;
  last_daily_evaluation_date: string | null;
  attempts: number;
  requested_by_user_id: string | null;
};

export type ChangeBacklog = {
  /** Due now or waiting for a retry, eligible merchants only. */
  pending: number;
  processing: number;
  failed: number;
  retrying: number;
  oldestPendingEventAt: string | null;
  /** Oldest request among eligible due work (event or not). */
  oldestDueAt: string | null;
  lastSuccessAt: string | null;
  /** Merchants whose retries are exhausted (status `failed`). */
  failedMerchantIds: string[];
};

/**
 * Durable per-merchant change work (plan §4.4–§4.6). Same claim/renew/fail
 * shape as AnalyticsWorkQueueService, but work rows are kept and revisions
 * only grow. Leases and backoff use the database clock; `asOf` (the
 * calculation clock) is only used to decide daily rollovers.
 */
@Injectable()
export class ChangeWorkQueueService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly config: ChangeIntelligenceConfig,
  ) {}

  /** SQL predicate over `merchants m`, matching ChangeIntelligenceConfig.isEnabledFor. */
  eligible(): SQL {
    if (!this.config.enabled) return sql`false`;
    if (!this.config.allowlist.length) return sql`m.is_active`;
    return sql`(m.is_active AND (m.id::text IN (${sql.join(
      this.config.allowlist.map((id) => sql`${id}`),
      sql`, `,
    )}) OR m.public_id IN (${sql.join(
      this.config.allowlist.map((id) => sql`${id}`),
      sql`, `,
    )})))`;
  }

  /** Claims one due, enabled merchant (optionally a specific one) with a 120 s lease. */
  async claim(
    options: { merchantId?: string } = {},
  ): Promise<ClaimedChangeWork | null> {
    const only = options.merchantId
      ? sql`AND w.merchant_id = ${options.merchantId}::uuid`
      : sql``;
    const result = await this.db.execute(sql`
      WITH due AS (
        SELECT w.merchant_id FROM merchant_change_work w JOIN merchants m ON m.id = w.merchant_id
        WHERE w.requested_revision > w.processed_revision AND w.status <> 'failed'
          AND (w.lease_until IS NULL OR w.lease_until <= now())
          AND (w.next_attempt_at IS NULL OR w.next_attempt_at <= now())
          AND ${this.eligible()} ${only}
        ORDER BY w.last_success_at NULLS FIRST, w.merchant_id
        LIMIT 1 FOR UPDATE OF w SKIP LOCKED
      )
      UPDATE merchant_change_work w SET status = 'processing', lease_token = gen_random_uuid(),
        lease_until = now() + make_interval(secs => ${LEASE_SECONDS}), claimed_at = now(),
        claimed_revision = w.requested_revision
      FROM due WHERE w.merchant_id = due.merchant_id
      RETURNING w.merchant_id, w.lease_token, w.claimed_revision::text, w.processed_revision::text,
        w.requested_reason, w.bootstrap_status, w.model_version, w.settings_fingerprint,
        w.last_daily_evaluation_date::text, w.attempts, w.requested_by_user_id::text`);
    const row = (result.rows as unknown as ClaimRow[])[0];
    if (!row) return null;
    return {
      merchantId: row.merchant_id,
      token: row.lease_token,
      claimedRevision: BigInt(row.claimed_revision),
      processedRevision: BigInt(row.processed_revision),
      requestedReason: row.requested_reason,
      bootstrapStatus: row.bootstrap_status,
      modelVersion: row.model_version,
      settingsFingerprint: row.settings_fingerprint,
      lastDailyEvaluationDate: row.last_daily_evaluation_date,
      attempts: row.attempts,
      requestedByUserId: row.requested_by_user_id,
    };
  }

  /** Extends the lease. False when the token no longer owns the work. */
  async renew(work: ClaimedChangeWork): Promise<boolean> {
    const result = await this.db.execute(sql`
      UPDATE merchant_change_work SET lease_until = now() + make_interval(secs => ${LEASE_SECONDS})
      WHERE merchant_id = ${work.merchantId}::uuid AND lease_token = ${work.token}::uuid AND lease_until > now()
      RETURNING merchant_id`);
    return result.rows.length > 0;
  }

  /**
   * Inside the publishing transaction: locks the work row and proves the
   * lease is still ours and nobody published since the claim.
   */
  async lockForPublish(
    tx: ChangeDbExecutor,
    work: ClaimedChangeWork,
  ): Promise<void> {
    const result = await tx.execute(sql`
      SELECT lease_token::text AS token, lease_until > now() AS live, processed_revision::text AS processed
      FROM merchant_change_work WHERE merchant_id = ${work.merchantId}::uuid FOR UPDATE`);
    const row = result.rows[0] as
      | { token: string | null; live: boolean | null; processed: string }
      | undefined;
    if (!row || row.token !== work.token)
      throw new LeaseLostError(work.merchantId, 'token replaced');
    if (!row.live) throw new LeaseLostError(work.merchantId, 'lease expired');
    if (BigInt(row.processed) !== work.processedRevision)
      throw new LeaseLostError(
        work.merchantId,
        `processed revision moved to ${row.processed}`,
      );
  }

  /** Inside the publishing transaction, after lockForPublish. Later work stays due. */
  async completeInTx(
    tx: ChangeDbExecutor,
    work: ClaimedChangeWork,
    outcome: {
      reason: RunReason;
      lastDailyEvaluationDate: string | null;
      nextDailyEvaluationAt: Date;
      settingsFingerprint: string;
    },
  ): Promise<void> {
    await tx.execute(sql`
      UPDATE merchant_change_work SET
        processed_revision = GREATEST(processed_revision, ${work.claimedRevision.toString()}::bigint),
        status = 'idle', lease_token = NULL, lease_until = NULL, claimed_at = NULL, claimed_revision = NULL,
        attempts = 0, next_attempt_at = NULL, last_error = NULL, last_success_at = now(),
        requested_reason = CASE WHEN requested_reason IS NOT DISTINCT FROM ${work.requestedReason}::varchar
          THEN NULL ELSE requested_reason END,
        bootstrap_status = 'completed', model_version = ${MODEL_VERSION}, requested_by_user_id = NULL,
        settings_fingerprint = ${outcome.settingsFingerprint},
        last_daily_evaluation_date = COALESCE(${outcome.lastDailyEvaluationDate}::date, last_daily_evaluation_date),
        next_daily_evaluation_at = ${outcome.nextDailyEvaluationAt.toISOString()}::timestamptz
      WHERE merchant_id = ${work.merchantId}::uuid AND lease_token = ${work.token}::uuid`);
  }

  /**
   * Records a failed attempt: a `failed` run row and the retry schedule, in
   * one transaction, only while the lease is ours. Published results are
   * untouched. Returns what happened to the work.
   */
  async fail(
    work: ClaimedChangeWork,
    run: {
      id: string;
      reason: RunReason;
      asOf: Date;
      startedAt: Date;
      requestedByUserId: string | null;
    },
    error: unknown,
  ): Promise<'retry' | 'failed' | 'lease_lost'> {
    const message = (
      error instanceof Error ? error.message : String(error)
    ).slice(0, 2000);
    return this.db.transaction(async (tx) => {
      const locked = await tx.execute(sql`
        SELECT attempts FROM merchant_change_work
        WHERE merchant_id = ${work.merchantId}::uuid AND lease_token = ${work.token}::uuid FOR UPDATE`);
      const row = locked.rows[0] as { attempts: number } | undefined;
      if (!row) return 'lease_lost';
      const attempts = row.attempts + 1;
      const exhausted = attempts >= MAX_ATTEMPTS;
      const backoff =
        RETRY_BACKOFF_MINUTES[
          Math.min(attempts, RETRY_BACKOFF_MINUTES.length) - 1
        ];
      await tx.execute(sql`
        INSERT INTO merchant_change_runs (id, merchant_id, model_version, settings, settings_fingerprint, as_of,
          source_revision, source_cutoff_at, reason, status, started_at, duration_ms, error, requested_by_user_id)
        VALUES (${run.id}::uuid, ${work.merchantId}::uuid, ${MODEL_VERSION}, ${JSON.stringify(this.config.settings)}::jsonb,
          ${this.config.settingsFingerprint}, ${run.asOf.toISOString()}::timestamptz, ${work.claimedRevision.toString()}::bigint,
          now(), ${run.reason}, 'failed', ${run.startedAt.toISOString()}::timestamptz,
          GREATEST(0, (extract(epoch FROM clock_timestamp() - ${run.startedAt.toISOString()}::timestamptz) * 1000)::int),
          ${message}, ${run.requestedByUserId}::uuid)`);
      await tx.execute(sql`
        UPDATE merchant_change_work SET attempts = ${attempts}, last_error = ${message}, last_failure_at = now(),
          status = ${exhausted ? 'failed' : 'idle'},
          next_attempt_at = ${exhausted ? null : sql`now() + make_interval(mins => ${backoff})`},
          lease_token = NULL, lease_until = NULL, claimed_at = NULL, claimed_revision = NULL
        WHERE merchant_id = ${work.merchantId}::uuid`);
      return exhausted ? 'failed' : 'retry';
    });
  }

  /**
   * Requests a non-event run (clock, settings_change, reconciliation,
   * model_upgrade, or Update now as `source_change`). Marks the merchant due
   * now; a pending full re-evaluation is never downgraded.
   */
  async requestRun(merchantId: string, reason: RunReason): Promise<void> {
    await this.bump(
      sql`SELECT ${merchantId}::uuid AS merchant_id`,
      reason,
      true,
    );
  }

  /**
   * Operator rebuild (model upgrade / reconciliation): one merchant, or every
   * enabled merchant. A full re-evaluation of every product and node.
   */
  async requestRebuild(
    reason: 'model_upgrade' | 'reconciliation',
    merchantId?: string,
  ): Promise<string[]> {
    return this.bump(
      sql`SELECT m.id AS merchant_id FROM merchants m WHERE ${this.eligible()}
        ${merchantId ? sql`AND m.id = ${merchantId}::uuid` : sql``}`,
      reason,
      true,
    );
  }

  /**
   * Hourly scheduling (§4.6, §5.11, model upgrade): requests initialization
   * for enabled merchants without work, a model_upgrade or settings_change
   * when the stored identity differs, and a clock run when the merchant-local
   * date rolled over since the last daily evaluation. Returns merchant ids
   * per reason.
   */
  async enqueueScheduled(asOf: Date): Promise<{
    initialization: string[];
    modelUpgrade: string[];
    settingsChange: string[];
    clock: string[];
  }> {
    const base = (condition: SQL) => sql`
      SELECT m.id AS merchant_id FROM merchants m LEFT JOIN merchant_change_work w ON w.merchant_id = m.id
      WHERE ${this.eligible()} AND ${condition}`;
    const settled = sql`w.bootstrap_status = 'completed'`;
    const notPending = (reason: RunReason) =>
      sql`NOT (w.requested_reason IS NOT DISTINCT FROM ${reason}::varchar AND w.requested_revision > w.processed_revision)`;
    const initialization = await this.bump(
      base(sql`w.merchant_id IS NULL`),
      'initialization',
    );
    const modelUpgrade = await this.bump(
      base(
        sql`${settled} AND w.model_version IS DISTINCT FROM ${MODEL_VERSION} AND ${notPending('model_upgrade')}`,
      ),
      'model_upgrade',
    );
    const settingsChange = await this.bump(
      base(
        sql`${settled} AND w.settings_fingerprint IS DISTINCT FROM ${this.config.settingsFingerprint}
          AND ${notPending('settings_change')} AND ${notPending('model_upgrade')}`,
      ),
      'settings_change',
    );
    // Any pending run performs the daily evaluation too, so only idle merchants need a clock run.
    const clock = await this.bump(
      base(sql`${settled} AND w.requested_revision = w.processed_revision
        AND (w.last_daily_evaluation_date IS NULL
          OR ((${asOf.toISOString()}::timestamptz AT TIME ZONE m.timezone)::date - 1) > w.last_daily_evaluation_date)`),
      'clock',
    );
    return { initialization, modelUpgrade, settingsChange, clock };
  }

  private async bump(
    source: SQL,
    reason: RunReason,
    dueNow = false,
    executor: ChangeDbExecutor = this.db,
  ): Promise<string[]> {
    const full = sql.join(
      FULL_REASONS.map((r) => sql`${r}`),
      sql`, `,
    );
    const result = await executor.execute(sql`
      INSERT INTO merchant_change_work AS w (merchant_id, requested_revision, requested_reason, last_requested_at)
      SELECT s.merchant_id, 1, ${reason}, now() FROM (${source}) s
      ON CONFLICT (merchant_id) DO UPDATE SET
        requested_revision = w.requested_revision + 1, last_requested_at = now(),
        requested_reason = CASE
          WHEN w.requested_revision > w.processed_revision AND w.requested_reason IN (${full})
            AND excluded.requested_reason NOT IN (${full}) THEN w.requested_reason
          ELSE excluded.requested_reason END
        ${dueNow ? sql`, next_attempt_at = CASE WHEN w.status = 'failed' THEN w.next_attempt_at ELSE NULL END` : sql``}
      RETURNING w.merchant_id`);
    return (result.rows as Array<{ merchant_id: string }>).map(
      (row) => row.merchant_id,
    );
  }

  /** Operator retry: failed (or backing-off) work becomes due now. */
  async operatorRetry(merchantId?: string): Promise<string[]> {
    const only = merchantId
      ? sql`AND merchant_id = ${merchantId}::uuid`
      : sql``;
    const result = await this.db.execute(sql`
      UPDATE merchant_change_work SET status = 'idle', attempts = 0, next_attempt_at = NULL, last_error = NULL
      WHERE (status = 'failed' OR next_attempt_at IS NOT NULL) AND (lease_until IS NULL OR lease_until <= now()) ${only}
      RETURNING merchant_id`);
    return (result.rows as Array<{ merchant_id: string }>).map(
      (row) => row.merchant_id,
    );
  }

  /**
   * Staff "Update now" (plan §8), inside the caller's transaction: marks the
   * merchant due now for `userId` unless a run started for it within the last
   * minute or a live lease is held, in which case nothing changes. Only due
   * work is ever processed, so no rule is bypassed.
   */
  async requestUpdateNow(
    tx: ChangeDbExecutor,
    merchantId: string,
    userId: string,
  ): Promise<'queued' | 'already_running'> {
    await tx.execute(sql`
      INSERT INTO merchant_change_work (merchant_id) VALUES (${merchantId}::uuid) ON CONFLICT (merchant_id) DO NOTHING`);
    const locked = await tx.execute(sql`
      SELECT (status = 'processing' AND lease_until > now()) AS running,
        COALESCE(last_update_now_at > now() - interval '1 minute', false) AS recent
      FROM merchant_change_work WHERE merchant_id = ${merchantId}::uuid FOR UPDATE`);
    const row = locked.rows[0] as { running: boolean; recent: boolean };
    if (row.running || row.recent) return 'already_running';
    await this.bump(
      sql`SELECT ${merchantId}::uuid AS merchant_id`,
      'source_change',
      true,
      tx,
    );
    await tx.execute(sql`
      UPDATE merchant_change_work SET last_update_now_at = now(), requested_by_user_id = ${userId}::uuid
      WHERE merchant_id = ${merchantId}::uuid`);
    return 'queued';
  }

  /** "Already running" for Update now: a live lease is held. */
  async isRunning(merchantId: string): Promise<boolean> {
    const result = await this.db.execute(sql`
      SELECT 1 FROM merchant_change_work
      WHERE merchant_id = ${merchantId}::uuid AND status = 'processing' AND lease_until > now()`);
    return result.rows.length > 0;
  }

  async backlog(): Promise<ChangeBacklog> {
    const result = await this.db.execute(sql`
      SELECT
        count(*) FILTER (WHERE w.requested_revision > w.processed_revision AND w.status <> 'failed')::int AS pending,
        count(*) FILTER (WHERE w.status = 'processing' AND w.lease_until > now())::int AS processing,
        count(*) FILTER (WHERE w.status = 'failed')::int AS failed,
        count(*) FILTER (WHERE w.status <> 'failed' AND w.next_attempt_at > now())::int AS retrying,
        (SELECT min(e.created_at) FROM merchant_change_events e
          WHERE e.status = 'pending' AND e.merchant_id IN (
            SELECT w2.merchant_id FROM merchant_change_work w2 JOIN merchants m ON m.id = w2.merchant_id WHERE ${this.eligible()})
        ) AS oldest,
        min(w.last_requested_at) FILTER (WHERE w.requested_revision > w.processed_revision AND w.status <> 'failed') AS oldest_due,
        max(w.last_success_at) AS last_success,
        COALESCE(array_agg(w.merchant_id::text ORDER BY w.merchant_id) FILTER (WHERE w.status = 'failed'), '{}') AS failed_ids
      FROM merchant_change_work w JOIN merchants m ON m.id = w.merchant_id
      WHERE ${this.eligible()}`);
    const row = result.rows[0] as {
      pending: number;
      processing: number;
      failed: number;
      retrying: number;
      oldest: string | Date | null;
      oldest_due: string | Date | null;
      last_success: string | Date | null;
      failed_ids: string[];
    };
    const iso = (value: string | Date | null) =>
      value === null ? null : new Date(value).toISOString();
    return {
      pending: row.pending,
      processing: row.processing,
      failed: row.failed,
      retrying: row.retrying,
      oldestPendingEventAt: iso(row.oldest),
      oldestDueAt: iso(row.oldest_due),
      lastSuccessAt: iso(row.last_success),
      failedMerchantIds: row.failed_ids,
    };
  }

  /**
   * Initialized, enabled merchants whose daily evaluation for yesterday
   * (merchant-local) is missing more than `graceHours` after local midnight.
   */
  async missedDailyEvaluations(asOf: Date, graceHours = 2): Promise<string[]> {
    const result = await this.db.execute(sql`
      SELECT w.merchant_id::text AS id FROM merchant_change_work w JOIN merchants m ON m.id = w.merchant_id
      WHERE ${this.eligible()} AND w.bootstrap_status = 'completed'
        AND (${asOf.toISOString()}::timestamptz AT TIME ZONE m.timezone)::time >= make_time(${graceHours}, 0, 0)
        AND (w.last_daily_evaluation_date IS NULL
          OR w.last_daily_evaluation_date < (${asOf.toISOString()}::timestamptz AT TIME ZONE m.timezone)::date - 1)
      ORDER BY 1`);
    return (result.rows as Array<{ id: string }>).map((row) => row.id);
  }
}
