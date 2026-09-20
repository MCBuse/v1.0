import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StripeModule } from '../stripe/stripe.module';
import { TreasuryModule } from '../treasury/treasury.module';
import { RatesModule } from '../rates/rates.module';
import { OperationLedgerService } from '../financial-operations/operation-ledger.service';
import { AccountsController } from './accounts.controller';
import { AccountFundingService } from './account-funding.service';
import { AccountSummaryService } from './account-summary.service';
import { AccountTransferService } from './account-transfer.service';
import { AccountWalletsService } from './account-wallets.service';
import { AccountWithdrawalService } from './account-withdrawal.service';
import { OperationRunnerService } from './operation-runner.service';
import { PayoutDestinationsService } from './payout-destinations.service';

@Module({
  imports: [ConfigModule, StripeModule, TreasuryModule, RatesModule],
  controllers: [AccountsController],
  providers: [
    OperationLedgerService,
    AccountWalletsService,
    AccountSummaryService,
    AccountFundingService,
    AccountTransferService,
    AccountWithdrawalService,
    PayoutDestinationsService,
    OperationRunnerService,
  ],
  exports: [
    AccountWalletsService,
    AccountFundingService,
    AccountTransferService,
    AccountWithdrawalService,
    PayoutDestinationsService,
    OperationLedgerService,
  ],
})
export class AccountsModule {}
