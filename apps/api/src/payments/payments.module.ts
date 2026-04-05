import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { MockTransferProvider } from './providers/mock-transfer.provider';
import { SolanaTransferProvider } from './providers/solana-transfer.provider';
import { TRANSFER_PROVIDER } from './transfer-provider.interface';
import { PaymentRequestsModule } from '../payment-requests/payment-requests.module';
import { UsersModule } from '../users/users.module';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';

@Module({
  imports: [ConfigModule, PaymentRequestsModule, UsersModule],
  providers: [
    MockTransferProvider,
    SolanaTransferProvider,
    {
      provide: TRANSFER_PROVIDER,
      useFactory: (
        config: ConfigService,
        mock: MockTransferProvider,
        solana: SolanaTransferProvider,
      ) => {
        const provider = config.get<string>('TRANSFER_PROVIDER') ?? 'mock';
        if (provider === 'solana') return solana;
        if (provider === 'mock') return mock;
        throw new Error(
          `Invalid TRANSFER_PROVIDER: "${provider}". Supported values: "mock", "solana".`,
        );
      },
      inject: [ConfigService, MockTransferProvider, SolanaTransferProvider],
    },
    PaymentsService,
    VerifiedEmailGuard,
  ],
  controllers: [PaymentsController],
})
export class PaymentsModule {}
