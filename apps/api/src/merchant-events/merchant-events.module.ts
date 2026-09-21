import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DataCaptureModule } from '../data-capture/data-capture.module';
import { MerchantEventsService } from './merchant-events.service';
import { MerchantPresentationService } from './merchant-presentation.service';
import { MerchantEventsController } from './merchant-events.controller';

@Global()
@Module({
  imports: [ConfigModule, DataCaptureModule],
  controllers: [MerchantEventsController],
  providers: [MerchantEventsService, MerchantPresentationService],
  exports: [MerchantEventsService, MerchantPresentationService],
})
export class MerchantEventsModule {}
