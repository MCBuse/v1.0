import { Module } from '@nestjs/common';
import { NfcService } from './nfc.service';
import { NfcController } from './nfc.controller';
import { UsersModule } from '../users/users.module';
import { PaymentRequestsModule } from '../payment-requests/payment-requests.module';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';

@Module({
  imports: [UsersModule, PaymentRequestsModule],
  providers: [NfcService, VerifiedEmailGuard],
  controllers: [NfcController],
})
export class NfcModule {}
