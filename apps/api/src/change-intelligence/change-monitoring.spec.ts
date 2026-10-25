import type { ChangeTickSummary } from './change-processor.service';
import type { ChangeBacklog } from './change-work-queue.service';
import { EXECUTION_LOG_TYPE, executionLog } from './change-monitoring';
import { MODEL_VERSION } from './engine/registry';

describe('executionLog', () => {
  const now = new Date('2026-10-25T10:00:00Z');
  const backlog: ChangeBacklog = {
    pending: 3,
    processing: 0,
    failed: 1,
    retrying: 1,
    oldestPendingEventAt: '2026-10-25T09:00:00.000Z',
    oldestDueAt: '2026-10-25T08:45:00.000Z',
    lastSuccessAt: '2026-10-25T09:59:00.000Z',
    failedMerchantIds: ['m-exhausted'],
  };
  const summary: ChangeTickSummary = {
    asOf: now.toISOString(),
    scheduled: {
      initialization: 0,
      modelUpgrade: 0,
      settingsChange: 0,
      clock: 2,
    },
    processed: 1,
    failed: 1,
    deferred: 3,
    retries: 2,
    leaseLosses: 1,
    events: 7,
    nodes: { evaluated: 40, changed: 5, skipped: 30, blocked: 5 },
    readiness: { ready: 20, building_baseline: 4 },
    durationMs: 1234,
    merchants: [
      {
        merchantId: 'm-ok',
        runId: 'r1',
        reason: 'clock',
        status: 'succeeded',
        asOf: '',
        retries: 2,
        products: 10,
      },
      {
        merchantId: 'm-bad',
        runId: 'r2',
        reason: 'clock',
        status: 'retry',
        asOf: '',
        retries: 0,
        error: 'boom',
      },
      {
        merchantId: 'm-lost',
        runId: 'r3',
        reason: 'clock',
        status: 'lease_lost',
        asOf: '',
        retries: 0,
      },
    ],
  };

  it('carries every §8 measure in one record', () => {
    expect(executionLog('tick', summary, backlog, ['m-late'], now)).toEqual({
      type: EXECUTION_LOG_TYPE,
      severity: 'ERROR',
      mode: 'tick',
      modelVersion: MODEL_VERSION,
      asOf: now.toISOString(),
      durationMs: 1234,
      queue: {
        depth: 3,
        processing: 0,
        retrying: 1,
        oldestDueAgeSeconds: 4500,
      },
      captureLagSeconds: 3600,
      scheduled: summary.scheduled,
      processed: 1,
      failed: 1,
      failedMerchantIds: ['m-bad'],
      exhaustedMerchantIds: ['m-exhausted'],
      retries: 2,
      leaseLosses: 1,
      events: 7,
      products: 10,
      nodes: summary.nodes,
      readiness: summary.readiness,
      lastSuccessAt: backlog.lastSuccessAt,
      missedDailyEvaluationMerchantIds: ['m-late'],
      runIds: ['r1', 'r2', 'r3'],
    });
  });

  it('is INFO with null ages when nothing is waiting', () => {
    const log = executionLog(
      'tick',
      { ...summary, failed: 0, merchants: [] },
      { ...backlog, oldestDueAt: null, oldestPendingEventAt: null },
      [],
      now,
    );
    expect(log.severity).toBe('INFO');
    expect(log.queue.oldestDueAgeSeconds).toBeNull();
    expect(log.captureLagSeconds).toBeNull();
    expect(log.runIds).toEqual([]);
  });
});
