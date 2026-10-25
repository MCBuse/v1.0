import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ChangeIntelligenceConfig } from './change-intelligence.config';
import { ChangePublisherService } from './change-publisher.service';
import { ChangeProcessorService } from './change-processor.service';
import { ChangeSourceLoader } from './change-source.loader';
import { ChangeWorkQueueService } from './change-work-queue.service';

/**
 * Change Intelligence services. No timers: processing runs only in the
 * dedicated worker (change-worker.ts). Read APIs (Stage 4) import this module
 * for `ChangeIntelligenceConfig.isEnabledFor` and the queue's status helpers.
 * Constructing the config validates settings and the registry, so a bad
 * configuration refuses to start.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: ChangeIntelligenceConfig,
      useFactory: (config: ConfigService) =>
        new ChangeIntelligenceConfig(config),
      inject: [ConfigService],
    },
    ChangeWorkQueueService,
    ChangeSourceLoader,
    ChangePublisherService,
    ChangeProcessorService,
  ],
  exports: [
    ChangeIntelligenceConfig,
    ChangeWorkQueueService,
    ChangeProcessorService,
  ],
})
export class ChangeIntelligenceModule {}
