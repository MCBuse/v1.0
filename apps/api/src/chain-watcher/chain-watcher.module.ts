import { Module } from '@nestjs/common';
import { SolanaModule } from '../solana/solana.module';
import { OnRampModule } from '../onramp/onramp.module';
import { SolanaOnrampReconcileService } from './solana-onramp-reconcile.service';

@Module({
  imports: [SolanaModule, OnRampModule],
  providers: [SolanaOnrampReconcileService],
})
export class ChainWatcherModule {}
