import { Module, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { validate } from '../config/config.validation';
import { DatabaseModule } from '../database/database.module';
import { SolanaModule } from '../solana/solana.module';
import { FinancialOperationsModule } from '../financial-operations/financial-operations.module';
import { AccountsModule } from './accounts.module';
import { PaymentsModule } from '../payments/payments.module';
import { OperationRunnerService } from './operation-runner.service';
import { MerchantInventoryService } from '../data-capture/merchant-inventory.service';
import { PaymentsService } from '../payments/payments.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    DatabaseModule,
    SolanaModule,
    FinancialOperationsModule,
    AccountsModule,
    PaymentsModule,
  ],
})
class RecoveryWorkerModule {}
async function run() {
  const app = await NestFactory.createApplicationContext(RecoveryWorkerModule);
  try {
    await app.get(MerchantInventoryService).expireStaleInvoices();
    await app.get(OperationRunnerService).tick(100);
    await app.get(PaymentsService).reconcileSubmittedMerchantPayments();
  } finally {
    await app.close();
  }
}
void run()
  .then(() => process.exit(0))
  .catch((error) => {
    Logger.error(error.message, undefined, 'RecoveryWorker');
    process.exit(1);
  });
