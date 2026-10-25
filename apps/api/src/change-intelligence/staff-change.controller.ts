import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { StaffChangeMerchant, StaffUpdateNowResponse } from '@repo/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  StaffChangeMerchantsDto,
  StaffUpdateNowDto,
} from './dto/staff-update-now.dto';
import {
  ChangeOperatorGuard,
  StaffChangeService,
} from './staff-change.service';

/** Staff "Update now" (plan §8). Operators only; merchants get 404. */
@ApiTags('staff-changes')
@ApiBearerAuth('access-token')
@Controller('staff/changes')
@UseGuards(JwtAuthGuard, ChangeOperatorGuard)
export class StaffChangeController {
  constructor(private readonly staff: StaffChangeService) {}

  @Get('merchants')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Merchants with Changes enabled, by name or owner email',
  })
  merchants(
    @Query() query: StaffChangeMerchantsDto,
  ): Promise<{ merchants: StaffChangeMerchant[] }> {
    return this.staff.merchants(query.q);
  }

  @Post('update-now')
  @HttpCode(202)
  @ApiOperation({ summary: 'Process one merchant now through the Changes job' })
  updateNow(
    @CurrentUser() user: { id: string },
    @Body() body: StaffUpdateNowDto,
  ): Promise<StaffUpdateNowResponse> {
    return this.staff.updateNow(user.id, body.merchantId, body.reason);
  }
}
