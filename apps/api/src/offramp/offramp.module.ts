import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OffRampService } from './offramp.service';
import { OffRampController } from './offramp.controller';
import { MockOffRampProvider } from './providers/mock-offramp.provider';
import { CircleOffRampProvider } from './providers/circle-offramp.provider';
import { OFFRAMP_PROVIDER } from './offramp-provider.interface';
import { WalletsModule } from '../wallets/wallets.module';
import { UsersModule } from '../users/users.module';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';

@Module({
  imports: [ConfigModule, WalletsModule, UsersModule],
  providers: [
    MockOffRampProvider,
    CircleOffRampProvider,
    {
      provide: OFFRAMP_PROVIDER,
      useFactory: (
        config: ConfigService,
        mock: MockOffRampProvider,
        circle: CircleOffRampProvider,
      ) => {
        const provider = config.get<string>('OFFRAMP_PROVIDER') ?? 'mock';
        if (provider === 'mock') return mock;
        if (provider === 'circle') return circle;
        throw new Error(
          `Invalid OFFRAMP_PROVIDER: "${provider}". Supported values: "mock", "circle".`,
        );
      },
      inject: [ConfigService, MockOffRampProvider, CircleOffRampProvider],
    },
    OffRampService,
    VerifiedEmailGuard,
  ],
  controllers: [OffRampController],
})
export class OffRampModule {}
