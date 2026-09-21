import { Global, Module } from '@nestjs/common';
import { FinancialOperationsService } from './financial-operations.service';
import { MoneyAuditService } from './money-audit.service';

@Global()
@Module({
  providers: [FinancialOperationsService, MoneyAuditService],
  exports: [FinancialOperationsService, MoneyAuditService],
})
export class FinancialOperationsModule {}
