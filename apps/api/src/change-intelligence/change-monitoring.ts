import type { ChangeTickSummary } from './change-processor.service';
import type { ChangeBacklog } from './change-work-queue.service';
import { MODEL_VERSION } from './engine/registry';

/** `jsonPayload.type` of the one structured log line per execution (log-based metrics key on it). */
export const EXECUTION_LOG_TYPE = 'change_intelligence_execution';

export type ChangeExecutionLog = {
  type: typeof EXECUTION_LOG_TYPE;
  severity: 'INFO' | 'ERROR';
  mode: 'tick' | 'merchant' | 'retry';
  modelVersion: string;
  asOf: string;
  durationMs: number;
  queue: {
    depth: number;
    processing: number;
    retrying: number;
    oldestDueAgeSeconds: number | null;
  };
  /** Age of the oldest captured-but-unprocessed source event. */
  captureLagSeconds: number | null;
  scheduled: ChangeTickSummary['scheduled'];
  processed: number;
  failed: number;
  failedMerchantIds: string[];
  exhaustedMerchantIds: string[];
  retries: number;
  leaseLosses: number;
  events: number;
  products: number;
  nodes: ChangeTickSummary['nodes'];
  readiness: ChangeTickSummary['readiness'];
  lastSuccessAt: string | null;
  missedDailyEvaluationMerchantIds: string[];
  runIds: string[];
};

const ageSeconds = (iso: string | null, now: Date) =>
  iso === null
    ? null
    : Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 1000));

/**
 * One record with every §8 monitoring measure. Severity ERROR when the
 * execution had failures, so the exit code and the log agree.
 */
export function executionLog(
  mode: ChangeExecutionLog['mode'],
  summary: ChangeTickSummary,
  backlog: ChangeBacklog,
  missedDaily: string[],
  now: Date = new Date(),
): ChangeExecutionLog {
  const failedMerchantIds = summary.merchants
    .filter((m) => m.status === 'failed' || m.status === 'retry')
    .map((m) => m.merchantId);
  return {
    type: EXECUTION_LOG_TYPE,
    severity: summary.failed ? 'ERROR' : 'INFO',
    mode,
    modelVersion: MODEL_VERSION,
    asOf: summary.asOf,
    durationMs: summary.durationMs,
    queue: {
      depth: backlog.pending,
      processing: backlog.processing,
      retrying: backlog.retrying,
      oldestDueAgeSeconds: ageSeconds(backlog.oldestDueAt, now),
    },
    captureLagSeconds: ageSeconds(backlog.oldestPendingEventAt, now),
    scheduled: summary.scheduled,
    processed: summary.processed,
    failed: summary.failed,
    failedMerchantIds,
    exhaustedMerchantIds: backlog.failedMerchantIds,
    retries: summary.retries,
    leaseLosses: summary.leaseLosses,
    events: summary.events,
    products: summary.merchants.reduce((n, m) => n + (m.products ?? 0), 0),
    nodes: summary.nodes,
    readiness: summary.readiness,
    lastSuccessAt: backlog.lastSuccessAt,
    missedDailyEvaluationMerchantIds: missedDaily,
    runIds: summary.merchants.map((m) => m.runId),
  };
}
