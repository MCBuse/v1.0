import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AnalyticsWorkerModule } from './worker.module';
import { MerchantInsightsService } from './merchant-insights.service';
import { AnalyticsOrchestratorService } from './analytics-orchestrator.service';

async function run() {
  const app = await NestFactory.createApplicationContext(
    AnalyticsWorkerModule,
    { logger: ['log', 'warn', 'error'] },
  );
  try {
    if (!process.argv.includes('--queue'))
      await app.get(MerchantInsightsService).runAll();
    const result = process.argv.includes('--queue')
      ? await app.get(AnalyticsOrchestratorService).tick()
      : await app.get(AnalyticsOrchestratorService).tick(1000);
    Logger.log(JSON.stringify(result), 'AnalyticsWorker');
    if (result.failed)
      throw new Error(`${result.failed} analytics calculations failed`);
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
      'AnalyticsWorker',
    );
    process.exit(1);
  });
