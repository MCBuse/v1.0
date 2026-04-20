import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { RatesService } from './rates.service';
import { PreviewRateDto } from './dto/preview-rate.dto';

@ApiTags('rates')
@Public()
@Controller('rates')
export class RatesController {
  constructor(private readonly ratesService: RatesService) {}

  @ApiOperation({ summary: 'Get all live exchange rates' })
  @Get()
  getAll() {
    return this.ratesService.getAll();
  }

  @ApiOperation({ summary: 'Preview conversion: amount × rate minus fee' })
  @Get('preview')
  preview(@Query() dto: PreviewRateDto) {
    return this.ratesService.preview(
      Number(dto.amount),
      dto.from.toUpperCase(),
      dto.to.toUpperCase(),
      dto.feePct,
    );
  }
}
