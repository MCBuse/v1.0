import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OnRampService } from './onramp.service';
import { OnRampController } from './onramp.controller';
import { MockOnRampProvider } from './providers/mock-onramp.provider';
import { CircleOnRampProvider } from './providers/circle-onramp.provider';
import { ONRAMP_PROVIDER } from './onramp-provider.interface';
import { CircleClient } from './circle/circle.client';
import { CircleSettlementService } from './circle/circle-settlement.service';
import { CirclePollingService } from './circle/circle-polling.service';
import { CircleWebhookController } from './circle/circle-webhook.controller';
import { LedgerModule } from '../ledger/ledger.module';
import { WalletsModule } from '../wallets/wallets.module';
import { UsersModule } from '../users/users.module';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';

@Module({
  imports: [HttpModule, ConfigModule, LedgerModule, WalletsModule, UsersModule],
  providers: [
    CircleClient,
    CircleSettlementService,
    CirclePollingService,
    MockOnRampProvider,
    CircleOnRampProvider,
    {
      provide: ONRAMP_PROVIDER,
      useFactory: (
        config: ConfigService,
        mock: MockOnRampProvider,
        circle: CircleOnRampProvider,
      ) => {
        const provider = config.get<string>('ONRAMP_PROVIDER') ?? 'mock';
        if (provider === 'circle') return circle;
        if (provider === 'mock') return mock;
        throw new Error(
          `Invalid ONRAMP_PROVIDER: "${provider}". Supported values: "mock", "circle".`,
        );
      },
      inject: [ConfigService, MockOnRampProvider, CircleOnRampProvider],
    },
    OnRampService,
    VerifiedEmailGuard,
  ],
  controllers: [OnRampController, CircleWebhookController],
})
export class OnRampModule {}
