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

@Module({
  imports: [RatesModule],
  controllers: [MerchantController],
  providers: [MerchantService, MerchantInventoryService, MerchantImageService, MerchantActivityService, MerchantImportService, MerchantFinanceService, MerchantEvidenceAttachmentService],
  exports: [MerchantService, MerchantInventoryService],
})
export class DataCaptureModule {}
