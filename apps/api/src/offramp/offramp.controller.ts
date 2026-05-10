import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { OffRampService } from './offramp.service';
import { InitiateOffRampDto } from './dto/initiate-offramp.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';
import { OfframpSessionsService } from './offramp-sessions.service';
import { CreateOfframpSessionDto } from './dto/create-offramp-session.dto';
import { SignOfframpUrlDto } from './dto/sign-offramp-url.dto';
import { InitiateMoonpayDepositDto } from './dto/initiate-moonpay-deposit.dto';
import { StripeOfframpProvider } from './stripe-offramp.provider';

@ApiTags('offramp')
@ApiBearerAuth('access-token')
@UseGuards(VerifiedEmailGuard)
@Controller('offramp')
export class OffRampController {
  constructor(
    private readonly offRampService: OffRampService,
    private readonly sessions: OfframpSessionsService,
    private readonly stripeOfframp: StripeOfframpProvider,
  ) {}

  @Post('stripe/onboarding-link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a Stripe Connect Express onboarding link' })
  createStripeOnboardingLink(@CurrentUser() user: { id: string }) {
    return this.stripeOfframp.createOnboardingLink(user.id);
  }

  @Get('stripe/account-status')
  @ApiOperation({ summary: 'Get Stripe Connect account status' })
  getStripeAccountStatus(@CurrentUser() user: { id: string }) {
    return this.stripeOfframp.getAccountStatus(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Withdraw USDC or EURC from savings wallet to fiat (off-ramp)',
    description:
      'Deducts the specified amount from the savings wallet and initiates a fiat payout ' +
      'via the configured legacy provider (mock returns instantly; Circle is not wired to mobile). ' +
      'Balance is debited atomically — no partial state on failure.',
  })
  withdraw(
    @CurrentUser() user: { id: string },
    @Body() dto: InitiateOffRampDto,
  ) {
    return this.offRampService.withdraw(user.id, dto);
  }

  @Post('sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create a MoonPay sell widget session',
    description:
      'Reserves USDC from the Holding wallet and returns React Native SDK config for MoonPay sell.',
  })
  createSession(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateOfframpSessionDto,
  ) {
    return this.sessions.createSession(user.id, dto);
  }

  @Post('sessions/:id/signature')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Local off-ramp transaction id' })
  @ApiOperation({ summary: 'Sign a MoonPay off-ramp SDK URL' })
  signUrl(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: SignOfframpUrlDto,
  ) {
    return this.sessions.signWidgetUrl(user.id, id, dto);
  }

  @Post('sessions/:id/deposit')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Local off-ramp transaction id' })
  @ApiOperation({ summary: 'Send the MoonPay sell crypto deposit from Holding' })
  initiateDeposit(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: InitiateMoonpayDepositDto,
  ) {
    return this.sessions.initiateDeposit(user.id, id, dto);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List MoonPay off-ramp transactions' })
  listTransactions(@CurrentUser() user: { id: string }, @Query('limit') limit?: string) {
    return this.sessions.listTransactions(user.id, limit ? Number(limit) : 20);
  }

  @Get('transactions/:id')
  @ApiParam({ name: 'id', description: 'Local off-ramp transaction id' })
  @ApiOperation({ summary: 'Get MoonPay off-ramp transaction status' })
  getTransaction(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.sessions.getTransaction(user.id, id);
  }
}
