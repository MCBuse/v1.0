import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalyticsWorkQueueService } from './analytics-work-queue.service';
import { MerchantInsightsService } from './merchant-insights.service';

/** The plan's one-minute cadence for change-driven recalculation. */
const TICK_MS = 60_000;
const STARTUP_DELAY_MS = 20_000;
const BATCH_SIZE = 10;

/**
 * Light orchestration: a sale or a stock change eventually refreshes the
 * merchant's derived figures and their insights.
 *
 * The expensive calculation deliberately does not happen in the request that
 * caused it. A payment enqueues a marker and returns; this worker picks it up
 * within the minute. Nothing a customer waits on depends on analytics.
 */
@Injectable()
export class AnalyticsOrchestratorService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AnalyticsOrchestratorService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly queue: AnalyticsWorkQueueService,
    private readonly insights: MerchantInsightsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (this.config.get<string>('MERCHANT_ORCHESTRATION_ENABLED') === 'false') {
      this.logger.warn('Analytics orchestration is disabled by configuration');
      return;
    }
    setTimeout(() => void this.tick(), STARTUP_DELAY_MS);
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass over the queue. Public so tests can drive it directly. */
  async tick(
    limit = BATCH_SIZE,
  ): Promise<{ processed: number; failed: number }> {
    if (this.running) return { processed: 0, failed: 0 };
    this.running = true;
    let processed = 0;
    let failed = 0;

    try {
      const claimed = await this.queue.claim(limit);
      for (const work of claimed) {
        try {
          await this.insights.runForMerchant(work.merchantId);
          // Only clears the row if nothing new arrived while this ran.
          await this.queue.complete(work.merchantId);
          processed += 1;
        } catch (error) {
          failed += 1;
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Analytics recalculation failed for ${work.merchantId}: ${message}`,
          );
          await this.queue.fail(work.merchantId, message);
        }
      }
    } catch (error) {
      this.logger.error(
        `Analytics orchestration cycle failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
    }

    return { processed, failed };
  }
}
