import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AnalyticsWorkerModule } from './worker.module';
import { MerchantInsightsService } from './merchant-insights.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AnalyticsWorkerModule, { logger: ['log', 'warn', 'error'] });
  try {
    const result = await app.get(MerchantInsightsService).runAll();
    Logger.log(JSON.stringify(result), 'AnalyticsWorker');
  } finally {
    await app.close();
  }
}

void run().then(() => process.exit(0)).catch((error) => {
  Logger.error(error instanceof Error ? error.message : String(error), undefined, 'AnalyticsWorker');
  process.exit(1);
});
