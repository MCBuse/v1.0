import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OnRampService } from './onramp.service';
import { OnRampController } from './onramp.controller';
import { OnrampSessionsController } from './onramp-sessions.controller';
import { OnrampWebhooksController } from './onramp-webhooks.controller';
import { OnrampSessionsService } from './onramp-sessions.service';
import { WidgetOnrampSettlementService } from './widget-onramp-settlement.service';
import { MoonpayWidgetProvider } from './widget/moonpay-widget.provider';
import { StripeOnrampProvider } from './widget/stripe-onramp.provider';
import { MockOnRampProvider } from './providers/mock-onramp.provider';
import { CircleOnRampProvider } from './providers/circle-onramp.provider';
import { ONRAMP_PROVIDER } from './onramp-provider.interface';
import { StripeModule } from '../stripe/stripe.module';
import { CircleClient } from './circle/circle.client';
import { CircleSettlementService } from './circle/circle-settlement.service';
import { CirclePollingService } from './circle/circle-polling.service';
import { CircleWebhookController } from './circle/circle-webhook.controller';
import { LedgerModule } from '../ledger/ledger.module';
import { WalletsModule } from '../wallets/wallets.module';
import { UsersModule } from '../users/users.module';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';
import { OffRampModule } from '../offramp/offramp.module';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    LedgerModule,
    WalletsModule,
    UsersModule,
    OffRampModule,
    StripeModule,
  ],
  providers: [
    CircleClient,
    CircleSettlementService,
    CirclePollingService,
    MockOnRampProvider,
    CircleOnRampProvider,
    StripeOnrampProvider,
    {
      provide: ONRAMP_PROVIDER,
      useFactory: (
        config: ConfigService,
        mock: MockOnRampProvider,
        circle: CircleOnRampProvider,
        moonpay: MoonpayWidgetProvider,
      ) => {
        const provider = config.get<string>('ONRAMP_PROVIDER') ?? 'stripe';
        if (provider === 'circle') return circle;
        if (provider === 'moonpay') return moonpay;
        if (provider === 'mock') return mock;
        if (provider === 'stripe') return mock;
        throw new Error(
          `Invalid ONRAMP_PROVIDER: "${provider}". Supported values: "stripe", "moonpay", "circle", "mock".`,
        );
      },
      inject: [ConfigService, MockOnRampProvider, CircleOnRampProvider, MoonpayWidgetProvider],
    },
    OnRampService,
    MoonpayWidgetProvider,
    OnrampSessionsService,
    WidgetOnrampSettlementService,
    VerifiedEmailGuard,
  ],
  controllers: [
    OnRampController,
    OnrampSessionsController,
    OnrampWebhooksController,
    CircleWebhookController,
  ],
  exports: [WidgetOnrampSettlementService],
})
export class OnRampModule {}
