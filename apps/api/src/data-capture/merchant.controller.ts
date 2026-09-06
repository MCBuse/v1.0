import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateMerchantPaymentRequestDto } from './dto/create-merchant-payment-request.dto';
import { ListMerchantTransactionsDto } from './dto/list-merchant-transactions.dto';
import { UpdateMerchantConsentDto } from './dto/update-merchant-consent.dto';
import { MerchantService } from './merchant.service';

@ApiTags('merchants')
@ApiBearerAuth('access-token')
@Controller('merchants/me')
export class MerchantController {
  constructor(private readonly merchants: MerchantService) {}

  @Get()
  @ApiOperation({ summary: 'Get the current user merchant profile' })
  getMe(@CurrentUser() user: { id: string }) {
    return this.merchants.getMe(user.id);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get merchant EUR sales and balance summary' })
  getSummary(
    @CurrentUser() user: { id: string },
    @Query('period') period = '30d',
  ) {
    return this.merchants.getSummary(user.id, period);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List merchant-facing receipts' })
  listTransactions(
    @CurrentUser() user: { id: string },
    @Query() query: ListMerchantTransactionsDto,
  ) {
    return this.merchants.listTransactions(user.id, query);
  }

  @Post('payment-requests')
  @ApiOperation({
    summary: 'Create a EUR-denominated merchant payment request',
  })
  createPaymentRequest(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateMerchantPaymentRequestDto,
  ) {
    return this.merchants.createPaymentRequest(user.id, dto);
  }

  @Get('payment-requests/:id')
  @ApiOperation({ summary: 'Get a merchant payment request state' })
  getPaymentRequest(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.merchants.getPaymentRequest(user.id, id);
  }

  @Get('consents')
  getConsent(@CurrentUser() user: { id: string }) {
    return this.merchants.getConsent(user.id);
  }

  @Post('consents')
  updateConsent(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateMerchantConsentDto,
  ) {
    return this.merchants.updateConsent(user.id, dto.active);
  }

  @Get('evidence-readiness')
  getReadiness(@CurrentUser() user: { id: string }) {
    return this.merchants.getReadiness(user.id);
  }
}
