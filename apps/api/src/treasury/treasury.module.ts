import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SolanaModule } from '../solana/solana.module';
import { TreasuryService } from './treasury.service';

@Module({
  imports: [ConfigModule, SolanaModule],
  providers: [TreasuryService],
  exports: [TreasuryService],
})
export class TreasuryModule {}
