import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { ChangeReadiness, RunReason } from '@repo/shared';
import { DRIZZLE, type DrizzleDB } from '../database/database.provider';
import { ChangeIntelligenceConfig } from './change-intelligence.config';
import {
  ChangePublisherService,
  type PublishSummary,
} from './change-publisher.service';
import {
  ChangeSourceLoader,
  type LoadedChangeSource,
} from './change-source.loader';
import {
  ChangeWorkQueueService,
  LeaseLostError,
  RENEW_MS,
  type ClaimedChangeWork,
} from './change-work-queue.service';
import { evaluateMerchant } from './engine/evaluate';
import type { EvaluationResult } from './engine/types';

/** Retries of a serialization failure (SQLSTATE 40001) after the first attempt. */
export const SERIALIZATION_RETRIES = 3;
/** Above this many pending events a run re-evaluates everything, labelled `reconciliation`. */
export const RECONCILIATION_EVENT_THRESHOLD = 1000;
const FULL_REASONS: RunReason[] = [
  'model_upgrade',
  'settings_change',
  'reconciliation',
];

export type MerchantRunOutcome = {
  merchantId: string;
  runId: string;
  reason: RunReason;
  status: 'succeeded' | 'retry' | 'failed' | 'lease_lost';
  asOf: string;
  retries: number;
  error?: string;
  publish?: PublishSummary;
  counts?: EvaluationResult['counts'];
  /** Products in the evaluated source snapshot. */
  products?: number;
};

export type ChangeTickSummary = {
  asOf: string;
  scheduled: {
    initialization: number;
    modelUpgrade: number;
    settingsChange: number;
    clock: number;
  };
  processed: number;
  failed: number;
  /** Eligible work still due after this execution (durable, picked up next time). */
  deferred: number;
  retries: number;
  leaseLosses: number;
  events: number;
  nodes: {
    evaluated: number;
    changed: number;
    skipped: number;
    blocked: number;
  };
  readiness: Partial<Record<ChangeReadiness, number>>;
  durationMs: number;
  merchants: MerchantRunOutcome[];
};

const isSerializationFailure = (error: unknown): boolean => {
  for (let e: unknown = error; e && typeof e === 'object'; ) {
    if ((e as { code?: unknown }).code === '40001') return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
};

/** Aggregates merchant outcomes into the execution summary (tick and operator commands). */
export function summarizeRuns(input: {
  asOf: Date;
  scheduled?: ChangeTickSummary['scheduled'];
  merchants: MerchantRunOutcome[];
  deferred: number;
  startedMs: number;
}): ChangeTickSummary {
  const summary: ChangeTickSummary = {
    asOf: input.asOf.toISOString(),
    scheduled: input.scheduled ?? {
      initialization: 0,
      modelUpgrade: 0,
      settingsChange: 0,
      clock: 0,
    },
    processed: 0,
    failed: 0,
    deferred: input.deferred,
    retries: 0,
    leaseLosses: 0,
    events: 0,
    nodes: { evaluated: 0, changed: 0, skipped: 0, blocked: 0 },
    readiness: {},
    durationMs: 0,
    merchants: input.merchants,
  };
  for (const outcome of input.merchants) {
    summary.retries += outcome.retries;
    if (outcome.status === 'succeeded') summary.processed += 1;
    else if (outcome.status === 'lease_lost') summary.leaseLosses += 1;
    else summary.failed += 1;
    summary.events += outcome.publish?.events ?? 0;
    for (const key of ['evaluated', 'changed', 'skipped', 'blocked'] as const)
      summary.nodes[key] += outcome.counts?.[key] ?? 0;
    for (const [readiness, count] of Object.entries(
      outcome.publish?.readiness ?? {},
    ) as Array<[ChangeReadiness, number]>)
      summary.readiness[readiness] =
        (summary.readiness[readiness] ?? 0) + count;
  }
  summary.durationMs = Date.now() - input.startedMs;
  return summary;
}

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Orchestrates one merchant run (plan §4.4): claim → fixed asOf and run id →
 * REPEATABLE READ load → pure evaluation → publication in one transaction
 * that re-verifies the lease. Failures are recorded separately and leave
 * published results untouched.
 */
@Injectable()
export class ChangeProcessorService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly config: ChangeIntelligenceConfig,
    private readonly queue: ChangeWorkQueueService,
    private readonly loader: ChangeSourceLoader,
    private readonly publisher: ChangePublisherService,
  ) {}

  /**
   * Processes one merchant now (CLI "process one merchant now"). Marks it due
   * when nothing is pending. Returns null when the merchant is not enabled or
   * another worker holds its lease.
   */
  async processMerchant(
    merchantId: string,
    options: { asOf?: Date; requestedBy?: string | null } = {},
  ): Promise<MerchantRunOutcome | null> {
    let work = await this.queue.claim({ merchantId });
    if (!work && !(await this.queue.isRunning(merchantId))) {
      await this.queue.requestRun(merchantId, 'source_change');
      work = await this.queue.claim({ merchantId });
    }
    return work ? this.processWork(work, options) : null;
  }

  /**
   * One worker execution (plan §8): enqueue due clock / settings / model
   * work, then process merchants until ~80% of the budget is used. Remaining
   * work stays durable.
   */
  async tick(
    options: { budgetMs?: number; asOf?: Date } = {},
  ): Promise<ChangeTickSummary> {
    const started = Date.now();
    const budgetMs = options.budgetMs ?? 45 * 60_000;
    const scheduleAsOf = options.asOf ?? new Date();
    const scheduled = await this.queue.enqueueScheduled(scheduleAsOf);
    const merchants: MerchantRunOutcome[] = [];
    while (Date.now() - started < budgetMs * 0.8) {
      const work = await this.queue.claim();
      if (!work) break;
      merchants.push(await this.processWork(work, { asOf: options.asOf }));
    }
    return summarizeRuns({
      asOf: scheduleAsOf,
      scheduled: {
        initialization: scheduled.initialization.length,
        modelUpgrade: scheduled.modelUpgrade.length,
        settingsChange: scheduled.settingsChange.length,
        clock: scheduled.clock.length,
      },
      merchants,
      deferred: (await this.queue.backlog()).pending,
      startedMs: started,
    });
  }

  /** Processes already-claimed work (exposed for tests and operator tooling). */
  async processWork(
    work: ClaimedChangeWork,
    options: { asOf?: Date; requestedBy?: string | null },
  ): Promise<MerchantRunOutcome> {
    const run = {
      id: randomUUID(),
      startedAt: new Date(),
      requestedByUserId: options.requestedBy ?? work.requestedByUserId,
    };
    const asOf = options.asOf ?? run.startedAt;
    let reason: RunReason =
      work.bootstrapStatus === 'pending'
        ? 'initialization'
        : work.requestedReason && FULL_REASONS.includes(work.requestedReason)
          ? work.requestedReason
          : (work.requestedReason ?? 'source_change');
    let leaseLost = false;
    const heartbeat = setInterval(() => {
      void this.queue
        .renew(work)
        .then((ok) => {
          if (!ok) leaseLost = true;
        })
        .catch(() => undefined);
    }, RENEW_MS);
    let retries = 0;
    const base = {
      merchantId: work.merchantId,
      runId: run.id,
      asOf: asOf.toISOString(),
    };
    try {
      for (;;) {
        try {
          const full =
            reason === 'initialization' || FULL_REASONS.includes(reason);
          const source = await this.db.transaction(
            (tx) =>
              this.loader.load(tx, {
                merchantId: work.merchantId,
                claimedRevision: work.claimedRevision,
                asOf,
                settings: this.config.settings,
                full,
              }),
            { isolationLevel: 'repeatable read', accessMode: 'read only' },
          );
          reason = this.finalReason(reason, full, source);
          if (leaseLost)
            throw new LeaseLostError(work.merchantId, 'renewal failed');
          const result = evaluateMerchant({
            merchantId: work.merchantId,
            timezone: source.merchant.timezone,
            asOf,
            settings: this.config.settings,
            reason,
            sales: source.sales,
            products: source.products,
            previousStates: source.previousStates,
            previousActiveCases: source.activeCases,
            lastDailyEvaluationDate: work.lastDailyEvaluationDate,
            affected:
              reason === 'initialization' || FULL_REASONS.includes(reason)
                ? 'all'
                : source.affected,
          });
          const publish = await this.db.transaction((tx) =>
            this.publisher.publish(
              tx,
              work,
              { ...run, reason },
              source,
              result,
            ),
          );
          return {
            ...base,
            reason,
            status: 'succeeded',
            retries,
            publish,
            counts: result.counts,
            products: source.products.length,
          };
        } catch (error) {
          if (
            isSerializationFailure(error) &&
            retries < SERIALIZATION_RETRIES
          ) {
            retries += 1;
            await sleep(50 + Math.floor(Math.random() * 200 * retries));
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      if (error instanceof LeaseLostError)
        return {
          ...base,
          reason,
          status: 'lease_lost',
          retries,
          error: error.message,
        };
      const disposition = await this.queue.fail(
        work,
        { ...run, reason, asOf },
        error,
      );
      return {
        ...base,
        reason,
        status: disposition === 'lease_lost' ? 'lease_lost' : disposition,
        retries,
        error: messageOf(error),
      };
    } finally {
      clearInterval(heartbeat);
    }
  }

  /** Event-driven runs are `source_change`; a large backlog becomes a labelled reconciliation. */
  private finalReason(
    reason: RunReason,
    full: boolean,
    source: LoadedChangeSource,
  ): RunReason {
    if (full) return reason;
    if (source.events.length > RECONCILIATION_EVENT_THRESHOLD)
      return 'reconciliation';
    return source.events.length ? 'source_change' : reason;
  }
}
