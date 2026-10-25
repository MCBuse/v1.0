import { ScoringClient } from '../credit-assessment/scoring-client';
import { CreditEvidenceService } from '../credit-assessment/credit-evidence.service';
import {
  CreditAccessService,
  CreditAnalystGuard,
} from '../credit-assessment/credit-access.service';
import { StaffCreditService } from '../credit-assessment/staff-credit.service';
import {
  MerchantCreditController,
  StaffCreditController,
} from '../credit-assessment/credit.controller';
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
import { ChangeIntelligenceModule } from '../change-intelligence/change-intelligence.module';
import { ChangeController } from '../change-intelligence/change.controller';
import { StaffController } from '../staff/staff.controller';
import { StaffChangeController } from '../change-intelligence/staff-change.controller';
import {
  ChangeOperatorGuard,
  StaffChangeService,
} from '../change-intelligence/staff-change.service';
import { ChangeJobTrigger } from '../change-intelligence/change-job-trigger';

@Module({
  imports: [RatesModule, AnalyticsIntelligenceModule, ChangeIntelligenceModule],
  // ChangeController lives here because it needs MerchantService owner resolution.
  controllers: [
    MerchantController,
    ChangeController,
    MerchantCreditController,
    StaffController,
    StaffCreditController,
    StaffChangeController,
  ],
  providers: [
    ScoringClient,
    CreditEvidenceService,
    CreditAccessService,
    CreditAnalystGuard,
    StaffCreditService,
    StaffChangeService,
    ChangeOperatorGuard,
    ChangeJobTrigger,
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
