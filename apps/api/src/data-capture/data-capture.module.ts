import { Module } from '@nestjs/common';
import { RatesModule } from '../rates/rates.module';
import { MerchantController } from './merchant.controller';
import { MerchantService } from './merchant.service';

@Module({
  imports: [RatesModule],
  controllers: [MerchantController],
  providers: [MerchantService],
  exports: [MerchantService],
})
export class DataCaptureModule {}
