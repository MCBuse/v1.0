import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.provider';
import { executionLog, type ChangeExecutionLog } from './change-monitoring';
import {
  ChangeProcessorService,
  summarizeRuns,
} from './change-processor.service';
import {
  ChangeRetentionService,
  retentionSettings,
} from './change-retention.service';
import { ChangeWorkQueueService } from './change-work-queue.service';
import { ChangeWorkerModule } from './change-worker.module';

/**
 * Changes worker and operator commands (plan §8). One execution:
 *   change-worker.js                                     hourly tick (the Cloud Run job)
 *   ... --merchant <uuid|publicId>                       process one merchant now
 *   ... --retry-failed [--merchant <ref>]                operator retry, then tick
 *   ... --rebuild model_upgrade|reconciliation [--merchant <ref>]
 *                                                        full re-evaluation, then tick
 *   ... --retention                                      bounded retention (CHANGE_INTELLIGENCE_RETENTION_*)
 * Logs one JSON line (`type: change_intelligence_execution`, or `..._retention`)
 * and exits non-zero when any merchant failed.
 */
const argValue = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const REBUILD_REASONS = ['model_upgrade', 'reconciliation'] as const;

async function run() {
  const app = await NestFactory.createApplicationContext(ChangeWorkerModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const processor = app.get(ChangeProcessorService);
    const queue = app.get(ChangeWorkQueueService);
    // One JSON object per line: Cloud Logging parses it as jsonPayload (and `severity`).
    const log = (record: object) =>
      console.log(JSON.stringify({ severity: 'INFO', ...record }));

    if (process.argv.includes('--retention')) {
      const summary = await app
        .get(ChangeRetentionService)
        .run(retentionSettings(process.env));
      log({ type: 'change_intelligence_retention', ...summary });
      return;
    }

    const merchantRef = argValue('--merchant');
    let merchantId: string | undefined;
    if (merchantRef) {
      const db = app.get<DrizzleDB>(DRIZZLE);
      const found = await db.execute(
        sql`SELECT id FROM merchants WHERE id::text = ${merchantRef} OR public_id = ${merchantRef}`,
      );
      merchantId = (found.rows[0] as { id: string } | undefined)?.id;
      if (!merchantId) throw new Error(`Merchant ${merchantRef} not found`);
    }

    const rebuild = argValue('--rebuild');
    if (process.argv.includes('--rebuild')) {
      if (
        !REBUILD_REASONS.includes(rebuild as (typeof REBUILD_REASONS)[number])
      )
        throw new Error(`--rebuild takes ${REBUILD_REASONS.join(' or ')}`);
      const requested = await queue.requestRebuild(
        rebuild as (typeof REBUILD_REASONS)[number],
        merchantId,
      );
      log({ rebuild, requested });
    }
    const retry = process.argv.includes('--retry-failed');
    if (retry) log({ retried: await queue.operatorRetry(merchantId) });

    let record: ChangeExecutionLog;
    const started = Date.now();
    if (merchantId && !retry && !rebuild) {
      const outcome = await processor.processMerchant(merchantId);
      if (!outcome)
        log({
          merchantId,
          status: 'not_processed',
          detail: 'not enabled or already running',
        });
      const summary = summarizeRuns({
        asOf: new Date(),
        merchants: outcome ? [outcome] : [],
        deferred: (await queue.backlog()).pending,
        startedMs: started,
      });
      if (!outcome) summary.failed += 1;
      record = executionLog(
        'merchant',
        summary,
        await queue.backlog(),
        await queue.missedDailyEvaluations(new Date()),
      );
    } else {
      const budgetMs = Number(
        process.env.CHANGE_INTELLIGENCE_BUDGET_MS ?? 45 * 60_000,
      );
      const summary = await processor.tick({ budgetMs });
      record = executionLog(
        retry ? 'retry' : 'tick',
        summary,
        await queue.backlog(),
        await queue.missedDailyEvaluations(new Date()),
      );
      for (const outcome of summary.merchants.filter((m) => m.error))
        log({
          severity: 'WARNING',
          type: 'change_intelligence_merchant_failure',
          merchantId: outcome.merchantId,
          runId: outcome.runId,
          status: outcome.status,
          error: outcome.error,
        });
    }
    log(record);
    if (record.failed)
      throw new Error(`${record.failed} change intelligence run(s) failed`);
  } finally {
    await app.close();
  }
}

void run()
  .then(() => process.exit(0))
  .catch((error) => {
    Logger.error(
      error instanceof Error ? error.message : String(error),
      undefined,
      'ChangesWorker',
    );
    process.exit(1);
  });
