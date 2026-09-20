import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FinancialOperationsService } from '../financial-operations/financial-operations.service';
import { AccountFundingService } from './account-funding.service';
import { AccountSummaryService } from './account-summary.service';
import { AccountTransferService } from './account-transfer.service';
import { AccountWithdrawalService } from './account-withdrawal.service';
import { PayoutDestinationsService } from './payout-destinations.service';
import {
  StartFundingDto,
  StartTransferDto,
  StartWithdrawalDto,
} from './dto/account-operations.dto';

function requireIdempotencyKey(key: string | undefined): string {
  if (!key || key.trim().length === 0) {
    throw new BadRequestException('Idempotency-Key header is required');
  }
  if (key.length > 128) {
    throw new BadRequestException('Idempotency-Key is too long');
  }
  return key.trim();
}

function parseCents(value: string): bigint {
  let amount: bigint;
  try {
    amount = BigInt(value);
  } catch {
    throw new BadRequestException('amountCents must be a whole number');
  }
  if (amount <= 0n) throw new BadRequestException('Amount must be positive');
  return amount;
}

@ApiTags('accounts')
@Controller('accounts')
@UseGuards(JwtAuthGuard)
export class AccountsController {
  constructor(
    private readonly summary: AccountSummaryService,
    private readonly funding: AccountFundingService,
    private readonly transfers: AccountTransferService,
    private readonly withdrawals: AccountWithdrawalService,
    private readonly destinations: PayoutDestinationsService,
    private readonly operations: FinancialOperationsService,
  ) {}

  @Get()
  async accounts(
    @CurrentUser('id') userId: string,
    @Query('timezone') timezone?: string,
  ) {
    return this.summary.forUser(userId, { timezone });
  }

  @Get('payout-destinations')
  async payoutDestinations(@CurrentUser('id') userId: string) {
    return this.destinations.capability(userId);
  }

  @Post('funding')
  async startFunding(
    @CurrentUser('id') userId: string,
    @Body() dto: StartFundingDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.funding.startFunding({
      userId,
      method: dto.method,
      amountCents: parseCents(dto.amountCents),
      idempotencyKey: requireIdempotencyKey(idempotencyKey),
      successUrl: dto.successUrl,
      cancelUrl: dto.cancelUrl,
    });
  }

  @Post('transfers')
  async startTransfer(
    @CurrentUser('id') userId: string,
    @Body() dto: StartTransferDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.transfers.startTransfer({
      userId,
      from: dto.from,
      to: dto.to,
      amountCents: parseCents(dto.amountCents),
      idempotencyKey: requireIdempotencyKey(idempotencyKey),
      purpose: dto.purpose,
      businessDate: dto.businessDate,
    });
  }

  @Post('withdrawals')
  async startWithdrawal(
    @CurrentUser('id') userId: string,
    @Body() dto: StartWithdrawalDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.withdrawals.startWithdrawal({
      userId,
      destinationId: dto.destinationId,
      amountCents: parseCents(dto.amountCents),
      idempotencyKey: requireIdempotencyKey(idempotencyKey),
    });
  }

  @Get('operations')
  async listOperations(@CurrentUser('id') userId: string) {
    const operations = await this.operations.listForUser(userId, 50);
    return { operations: operations.map((o) => this.present(o)) };
  }

  @Get('operations/:id')
  async operation(@CurrentUser('id') userId: string, @Param('id') id: string) {
    const operation = await this.operations.require(id);
    if (operation.userId !== userId) {
      // Same shape as a missing record: a caller must not be able to probe for
      // other people's operation ids.
      throw new BadRequestException('Operation not found');
    }
    return this.present(operation);
  }

  /** Public shape: no key material, no internal wallet ids beyond the user's own. */
  private present(
    operation: Awaited<ReturnType<FinancialOperationsService['require']>>,
  ) {
    return {
      id: operation.id,
      kind: operation.kind,
      status: operation.status,
      amountCents: operation.displayAmountMinor?.toString() ?? null,
      currency: operation.displayCurrency,
      settlementBaseUnits: operation.amountBaseUnits.toString(),
      settlementCurrency: operation.currency,
      chainSignature: operation.chainSignature,
      providerReference: operation.providerRef,
      failureCode: operation.failureCode,
      createdAt: operation.createdAt.toISOString(),
      finalizedAt: operation.finalizedAt?.toISOString() ?? null,
    };
  }
}
