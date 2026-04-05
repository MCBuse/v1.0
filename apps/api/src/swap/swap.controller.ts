import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SwapService } from './swap.service';
import { PreviewSwapDto } from './dto/preview-swap.dto';
import { ExecuteSwapDto } from './dto/execute-swap.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';

@ApiTags('swap')
@ApiBearerAuth('access-token')
@UseGuards(VerifiedEmailGuard)
@Controller('swap')
export class SwapController {
  constructor(private readonly swapService: SwapService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Preview a USDC ↔ EURC swap rate',
    description:
      'Returns the expected output amount and exchange rate without executing the swap. ' +
      'No balance is changed.',
  })
  preview(
    @CurrentUser() user: { id: string },
    @Body() dto: PreviewSwapDto,
  ) {
    return this.swapService.preview(user.id, dto);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Execute a USDC ↔ EURC swap in the savings wallet',
    description:
      'Swaps fromCurrency for toCurrency inside the caller\'s savings wallet. ' +
      'Balances are updated atomically. Returns updated balances for both currencies.',
  })
  execute(
    @CurrentUser() user: { id: string },
    @Body() dto: ExecuteSwapDto,
  ) {
    return this.swapService.execute(user.id, dto);
  }
}
