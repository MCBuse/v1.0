import { ScoringClient } from '../credit-assessment/scoring-client';
import { CreditEvidenceService } from '../credit-assessment/credit-evidence.service';
import { CreditAccessService, CreditAnalystGuard } from '../credit-assessment/credit-access.service';
import { StaffCreditService } from '../credit-assessment/staff-credit.service';
import { MerchantCreditController, StaffCreditController } from '../credit-assessment/credit.controller';
import { Module } from '@nestjs/common';
import { RatesModule } from '../rates/rates.module';
import { MerchantController } from './merchant.controller';
import { MerchantService } from './merchant.service';
import { MerchantInventoryService } from './merchant-inventory.service';
import { MerchantImageService } from './merchant-image.service';
import { MerchantActivityService } from './merchant-activity.service';
import { MerchantImportService } from './merchant-import.service';
import { MerchantFinanceService } from './merchant-finance.service';
import { MerchantEvidenceAttachmentService } from './merchant-evidence-attachment.service';
import { AnalyticsIntelligenceModule } from '../analytics-intelligence/analytics-intelligence.module';
import { GeneralAnalyticsService } from './analytics/general-analytics.service';
import { MerchantAssessmentService } from './assessment/merchant-assessment.service';

@Module({
  imports: [RatesModule, AnalyticsIntelligenceModule],
  controllers: [MerchantController, MerchantCreditController, StaffCreditController],
  providers: [
    ScoringClient, CreditEvidenceService, CreditAccessService, CreditAnalystGuard, StaffCreditService,
    GeneralAnalyticsService,
    MerchantAssessmentService,
    MerchantService,
    MerchantInventoryService,
    MerchantImageService,
    MerchantActivityService,
    MerchantImportService,
    MerchantFinanceService,
    MerchantEvidenceAttachmentService,
  ],
  exports: [
    MerchantService,
    MerchantInventoryService,
    GeneralAnalyticsService,
    MerchantAssessmentService,
  ],
})
export class DataCaptureModule {}
