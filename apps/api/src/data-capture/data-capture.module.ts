import { Module } from '@nestjs/common';
import { RatesModule } from '../rates/rates.module';
import { MerchantController } from './merchant.controller';
import { MerchantService } from './merchant.service';
import { MerchantInventoryService } from './merchant-inventory.service';
import { MerchantImageService } from './merchant-image.service';

@Module({
  imports: [RatesModule],
  controllers: [MerchantController],
  providers: [MerchantService, MerchantInventoryService, MerchantImageService],
  exports: [MerchantService, MerchantInventoryService],
})
export class DataCaptureModule {}
