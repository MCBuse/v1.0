import { Controller, Get, Post, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { WalletsService } from './wallets.service';
import { InternalTransferDto } from './dto/internal-transfer.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';

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
  getBalance(
    @CurrentUser() user: { id: string },
    @Param('type') type: string,
  ) {
    return this.walletsService.findByUserId(user.id).then((w) => w[type]?.balances ?? []);
  }

  @Post('transfer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Internal transfer between savings and routine wallets' })
  internalTransfer(
    @CurrentUser() user: { id: string },
    @Body() dto: InternalTransferDto,
  ) {
    return this.walletsService.internalTransfer(user.id, dto);
  }
}
