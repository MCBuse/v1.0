import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OffRampService } from './offramp.service';
import { OffRampController } from './offramp.controller';
import { OfframpSessionsService } from './offramp-sessions.service';
import { OfframpSolanaDepositService } from './offramp-solana-deposit.service';
import { MoonpayOfframpProvider } from './moonpay-offramp.provider';
import { MockOffRampProvider } from './providers/mock-offramp.provider';
import { CircleOffRampProvider } from './providers/circle-offramp.provider';
import { MoonpayLegacyOffRampProvider } from './providers/moonpay-legacy-offramp.provider';
import { OFFRAMP_PROVIDER } from './offramp-provider.interface';
import { WalletsModule } from '../wallets/wallets.module';
import { UsersModule } from '../users/users.module';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';

@Module({
  imports: [ConfigModule, WalletsModule, UsersModule],
  providers: [
    MockOffRampProvider,
    CircleOffRampProvider,
    MoonpayLegacyOffRampProvider,
    {
      provide: OFFRAMP_PROVIDER,
      useFactory: (
        config: ConfigService,
        mock: MockOffRampProvider,
        circle: CircleOffRampProvider,
        moonpay: MoonpayLegacyOffRampProvider,
      ) => {
        const provider = config.get<string>('OFFRAMP_PROVIDER') ?? 'mock';
        if (provider === 'mock') return mock;
        if (provider === 'circle') return circle;
        if (provider === 'moonpay') return moonpay;
        throw new Error(
          `Invalid OFFRAMP_PROVIDER: "${provider}". Supported values: "mock", "circle", "moonpay".`,
        );
      },
      inject: [
        ConfigService,
        MockOffRampProvider,
        CircleOffRampProvider,
        MoonpayLegacyOffRampProvider,
      ],
    },
    OffRampService,
    OfframpSessionsService,
    OfframpSolanaDepositService,
    MoonpayOfframpProvider,
    VerifiedEmailGuard,
  ],
  controllers: [OffRampController],
  exports: [OfframpSessionsService, MoonpayOfframpProvider],
})
export class OffRampModule {}
