import { Global, Module } from '@nestjs/common';
import { FinancialOperationsService } from './financial-operations.service';

@Global()
@Module({
  providers: [FinancialOperationsService],
  exports: [FinancialOperationsService],
})
export class FinancialOperationsModule {}
