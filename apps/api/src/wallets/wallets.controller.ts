import { Controller, Get, Post, Body, Headers, Param, Query, UseGuards, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiParam, ApiQuery } from '@nestjs/swagger';
import { WalletsService } from './wallets.service';
import { InternalTransferDto } from './dto/internal-transfer.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';

/**
 * A retry without a key would move money twice, so the key is required rather
 * than generated here — only the client knows which attempts are the same one.
 */
function requireIdempotencyKey(key: string | undefined): string {
  if (!key || key.trim().length === 0) {
    throw new BadRequestException('Idempotency-Key header is required');
  }
  if (key.length > 128) {
    throw new BadRequestException('Idempotency-Key is too long');
  }
  return key.trim();
}

@ApiTags('wallets')
@ApiBearerAuth('access-token')
@UseGuards(VerifiedEmailGuard)
@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get()
  @ApiOperation({ summary: 'Get both wallets with balances' })
  getWallets(@CurrentUser() user: { id: string }) {
    return this.walletsService.findByUserId(user.id);
  }

  @Get(':type/balance')
  @ApiOperation({ summary: 'Get balance for a specific wallet type and currency' })
  @ApiParam({ name: 'type', enum: ['savings', 'routine'] })
  @ApiQuery({ name: 'currency', enum: ['USDC', 'EURC'], required: true })
  getBalance(
    @CurrentUser() user: { id: string },
    @Param('type') type: string,
    @Query('currency') currency: string,
  ) {
    if (!currency) {
      throw new BadRequestException('currency query parameter is required');
    }
    return this.walletsService.getBalance(user.id, type, currency);
  }

  @Post('transfer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Internal transfer between savings and routine wallets' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Stable client-supplied key. A retry carrying the same key returns the ' +
      'original transfer; the same key with different inputs is refused.',
  })
  internalTransfer(
    @CurrentUser() user: { id: string },
    @Body() dto: InternalTransferDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.walletsService.internalTransfer(
      user.id,
      dto,
      requireIdempotencyKey(idempotencyKey),
    );
  }
}
