import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OnRampService } from './onramp.service';
import { InitiateOnRampDto } from './dto/initiate-onramp.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';

@ApiTags('onramp')
@ApiBearerAuth('access-token')
@UseGuards(VerifiedEmailGuard)
@Controller('onramp')
export class OnRampController {
  constructor(private readonly onRampService: OnRampService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fund savings wallet with USDC or EURC (fiat on-ramp)' })
  initiate(
    @CurrentUser() user: { id: string },
    @Body() dto: InitiateOnRampDto,
  ) {
    return this.onRampService.initiate(user.id, dto);
  }
}
