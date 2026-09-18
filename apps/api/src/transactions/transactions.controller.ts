import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TransactionsService } from './transactions.service';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';
import { PaymentsService } from '../payments/payments.service';

@ApiTags('transactions')
@ApiBearerAuth('access-token')
@UseGuards(VerifiedEmailGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List transaction history',
    description:
      'Returns paginated ledger entries for the authenticated user. ' +
      'Filter by wallet type, currency, entry type, or date range. ' +
      'All amounts are returned as strings to preserve precision.',
  })
  list(
    @CurrentUser() user: { id: string },
    @Query() query: ListTransactionsDto,
  ) {
    return this.transactionsService.list(user.id, query);
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Transaction summary by currency',
    description:
      'Returns total credited and debited amounts per currency. ' +
      'Optionally filtered to a specific wallet (savings or routine).',
  })
  @ApiQuery({
    name: 'walletType',
    required: false,
    enum: ['savings', 'routine'],
    description: 'Restrict summary to a specific wallet',
  })
  summary(
    @CurrentUser() user: { id: string },
    @Query('walletType') walletType?: string,
  ) {
    return this.transactionsService.summary(user.id, walletType);
  }

  @Get(':id/receipt')
  @ApiOperation({ summary: 'Get a completed merchant receipt for its payer or merchant' })
  receipt(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentsService.getReceiptByTransactionId(user.id, id);
  }
}
