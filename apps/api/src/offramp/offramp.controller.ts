import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OffRampService } from './offramp.service';
import { InitiateOffRampDto } from './dto/initiate-offramp.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';

@ApiTags('offramp')
@ApiBearerAuth('access-token')
@UseGuards(VerifiedEmailGuard)
@Controller('offramp')
export class OffRampController {
  constructor(private readonly offRampService: OffRampService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Withdraw USDC or EURC from savings wallet to fiat (off-ramp)',
    description:
      'Deducts the specified amount from the savings wallet and initiates a fiat payout ' +
      'via the configured provider (mock returns instantly; circle requires bank account setup). ' +
      'Balance is debited atomically — no partial state on failure.',
  })
  withdraw(
    @CurrentUser() user: { id: string },
    @Body() dto: InitiateOffRampDto,
  ) {
    return this.offRampService.withdraw(user.id, dto);
  }
}
