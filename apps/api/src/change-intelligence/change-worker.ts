import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.provider';
import { ChangeProcessorService } from './change-processor.service';
import { ChangeWorkQueueService } from './change-work-queue.service';
import { ChangeWorkerModule } from './change-worker.module';

/**
 * Changes worker (plan §8). One execution:
 *   node dist/src/change-intelligence/change-worker.js            hourly tick
 *   ... --merchant <uuid|publicId>                                process one merchant now
 *   ... --retry-failed [--merchant <uuid|publicId>]               operator retry, then tick
 * Logs one JSON summary and exits non-zero when any merchant failed.
 */
const argValue = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

async function run() {
  const app = await NestFactory.createApplicationContext(ChangeWorkerModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const processor = app.get(ChangeProcessorService);
    const queue = app.get(ChangeWorkQueueService);
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
    let failed = 0;
    if (process.argv.includes('--retry-failed')) {
      const retried = await queue.operatorRetry(merchantId);
      Logger.log(JSON.stringify({ retried }), 'ChangesWorker');
    }
    if (merchantId && !process.argv.includes('--retry-failed')) {
      const outcome = await processor.processMerchant(merchantId);
      Logger.log(
        JSON.stringify(
          outcome ?? {
            merchantId,
            status: 'not_processed',
            detail: 'not enabled or already running',
          },
        ),
        'ChangesWorker',
      );
      if (!outcome || outcome.status !== 'succeeded') failed += 1;
    } else {
      const budgetMs = Number(
        process.env.CHANGE_INTELLIGENCE_BUDGET_MS ?? 45 * 60_000,
      );
      const summary = await processor.tick({ budgetMs });
      Logger.log(
        JSON.stringify({ ...summary, backlog: await queue.backlog() }),
        'ChangesWorker',
      );
      failed += summary.failed;
    }
    if (failed) throw new Error(`${failed} change intelligence run(s) failed`);
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
