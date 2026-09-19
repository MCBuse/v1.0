import { Module } from '@nestjs/common';
import { GroqNarrationService } from './groq-narration.service';
import { MerchantInsightsService } from './merchant-insights.service';

@Module({
  providers: [GroqNarrationService, MerchantInsightsService],
  exports: [MerchantInsightsService],
})
export class AnalyticsIntelligenceModule {}
