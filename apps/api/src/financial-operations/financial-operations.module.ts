import { Global, Module } from '@nestjs/common';
import { SolanaModule } from '../solana/solana.module';
import { FinancialOperationsService } from './financial-operations.service';
import { MoneyAuditService } from './money-audit.service';
import { ReconciliationService } from './reconciliation.service';

@Global()
@Module({
  imports: [SolanaModule],
  providers: [
    FinancialOperationsService,
    MoneyAuditService,
    ReconciliationService,
  ],
  exports: [
    FinancialOperationsService,
    MoneyAuditService,
    ReconciliationService,
  ],
})
export class FinancialOperationsModule {}
