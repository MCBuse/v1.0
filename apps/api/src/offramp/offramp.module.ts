import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OffRampService } from './offramp.service';
import { OffRampController } from './offramp.controller';
import { StripeConnectCallbackController } from './stripe-connect-callback.controller';
import { OfframpSessionsService } from './offramp-sessions.service';
import { OfframpSolanaDepositService } from './offramp-solana-deposit.service';
import { MoonpayOfframpProvider } from './moonpay-offramp.provider';
import { StripeOfframpProvider } from './stripe-offramp.provider';
import { MockOffRampProvider } from './providers/mock-offramp.provider';
import { CircleOffRampProvider } from './providers/circle-offramp.provider';
import { MoonpayLegacyOffRampProvider } from './providers/moonpay-legacy-offramp.provider';
import { OFFRAMP_PROVIDER } from './offramp-provider.interface';
import { WalletsModule } from '../wallets/wallets.module';
import { UsersModule } from '../users/users.module';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';
import { StripeModule } from '../stripe/stripe.module';

@Module({
  imports: [ConfigModule, WalletsModule, UsersModule, StripeModule],
  providers: [
    MockOffRampProvider,
    CircleOffRampProvider,
    MoonpayLegacyOffRampProvider,
    StripeOfframpProvider,
    {
      provide: OFFRAMP_PROVIDER,
      useFactory: (
        config: ConfigService,
        mock: MockOffRampProvider,
        circle: CircleOffRampProvider,
        moonpay: MoonpayLegacyOffRampProvider,
      ) => {
        const provider = config.get<string>('OFFRAMP_PROVIDER') ?? 'stripe';
        if (provider === 'mock') return mock;
        if (provider === 'circle') return circle;
        if (provider === 'moonpay') return moonpay;
        if (provider === 'stripe') return mock;
        throw new Error(
          `Invalid OFFRAMP_PROVIDER: "${provider}". Supported values: "stripe", "moonpay", "circle", "mock".`,
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
  controllers: [OffRampController, StripeConnectCallbackController],
  exports: [OfframpSessionsService, MoonpayOfframpProvider, StripeOfframpProvider],
})
export class OffRampModule {}
