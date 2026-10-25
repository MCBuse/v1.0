import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GroqNarrationService } from './groq-narration.service';
import { MerchantInsightsService } from './merchant-insights.service';
import { AnalyticsWorkQueueService } from './analytics-work-queue.service';
import { AnalyticsOrchestratorService } from './analytics-orchestrator.service';
import { ChangeIntelligenceModule } from '../change-intelligence/change-intelligence.module';

@Module({
  imports: [ConfigModule, ChangeIntelligenceModule],
  providers: [
    GroqNarrationService,
    MerchantInsightsService,
    AnalyticsWorkQueueService,
    AnalyticsOrchestratorService,
  ],
  exports: [
    MerchantInsightsService,
    AnalyticsWorkQueueService,
    AnalyticsOrchestratorService,
  ],
})
export class AnalyticsIntelligenceModule {}
