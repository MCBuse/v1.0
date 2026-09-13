import { Module } from '@nestjs/common';
import { PaymentRequestsService } from './payment-requests.service';
import { PaymentRequestsController } from './payment-requests.controller';
import { WalletsModule } from '../wallets/wallets.module';
import { UsersModule } from '../users/users.module';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';
import { DataCaptureModule } from '../data-capture/data-capture.module';

@Module({
  imports: [WalletsModule, UsersModule, DataCaptureModule],
  providers: [PaymentRequestsService, VerifiedEmailGuard],
  controllers: [PaymentRequestsController],
  exports: [PaymentRequestsService],
})
export class PaymentRequestsModule {}
