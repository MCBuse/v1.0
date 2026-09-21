import { AccountsModule } from '../accounts/accounts.module';
import { Module } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { WalletsController } from './wallets.controller';
import { LedgerModule } from '../ledger/ledger.module';
import { UsersModule } from '../users/users.module';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';

@Module({
  imports: [LedgerModule, UsersModule, AccountsModule],
  providers: [WalletsService, VerifiedEmailGuard],
  controllers: [WalletsController],
  exports: [WalletsService],
})
export class WalletsModule {}
