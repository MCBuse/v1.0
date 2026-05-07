import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { ExecutePaymentDto } from './dto/execute-payment.dto';
import { ExecuteUsernamePaymentDto } from './dto/execute-username-payment.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';

@ApiTags('payments')
@ApiBearerAuth('access-token')
@UseGuards(VerifiedEmailGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Execute a P2P payment via QR nonce',
    description:
      'Scan a QR code to get the nonce. ' +
      'For dynamic QR the amount is fixed server-side. ' +
      'For static QR supply amount + currency in the body.',
  })
  execute(
    @CurrentUser() user: { id: string },
    @Body() dto: ExecutePaymentDto,
  ) {
    return this.paymentsService.execute(user.id, dto);
  }

  @Post('username')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Execute a P2P payment by username',
    description:
      'Sends from the payer routine wallet to the recipient routine wallet. ' +
      'The username may be supplied with or without @.',
  })
  executeByUsername(
    @CurrentUser() user: { id: string },
    @Body() dto: ExecuteUsernamePaymentDto,
  ) {
    return this.paymentsService.executeByUsername(user.id, dto);
  }
}
