import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ChangeIntelligenceConfig } from './change-intelligence.config';
import { ChangePublisherService } from './change-publisher.service';
import { ChangeProcessorService } from './change-processor.service';
import { ChangeReadService } from './change-read.service';
import { ChangeRetentionService } from './change-retention.service';
import { ChangeSourceLoader } from './change-source.loader';
import { ChangeWorkQueueService } from './change-work-queue.service';

/**
 * Change Intelligence services. No timers: processing runs only in the
 * dedicated worker (change-worker.ts). The API imports this module for the
 * merchant read side (ChangeReadService) and the Deep Analytics adapter.
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
    ChangeReadService,
    ChangeRetentionService,
  ],
  exports: [
    ChangeIntelligenceConfig,
    ChangeWorkQueueService,
    ChangeProcessorService,
    ChangeReadService,
    ChangeRetentionService,
  ],
})
export class ChangeIntelligenceModule {}
