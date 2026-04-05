import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SwapService } from './swap.service';
import { SwapController } from './swap.controller';
import { MockSwapProvider } from './providers/mock-swap.provider';
import { JupiterSwapProvider } from './providers/jupiter-swap.provider';
import { SWAP_PROVIDER } from './swap-provider.interface';
import { WalletsModule } from '../wallets/wallets.module';
import { UsersModule } from '../users/users.module';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';

@Module({
  imports: [ConfigModule, WalletsModule, UsersModule],
  providers: [
    MockSwapProvider,
    JupiterSwapProvider,
    {
      provide: SWAP_PROVIDER,
      useFactory: (
        config: ConfigService,
        mock: MockSwapProvider,
        jupiter: JupiterSwapProvider,
      ) => {
        const provider = config.get<string>('SWAP_PROVIDER') ?? 'mock';
        if (provider === 'mock') return mock;
        if (provider === 'jupiter') return jupiter;
        throw new Error(
          `Invalid SWAP_PROVIDER: "${provider}". Supported values: "mock", "jupiter".`,
        );
      },
      inject: [ConfigService, MockSwapProvider, JupiterSwapProvider],
    },
    SwapService,
    VerifiedEmailGuard,
  ],
  controllers: [SwapController],
})
export class SwapModule {}
