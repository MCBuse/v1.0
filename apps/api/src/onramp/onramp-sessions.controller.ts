import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OnrampSessionsService } from './onramp-sessions.service';
import { CreateOnrampSessionDto } from './dto/create-onramp-session.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';

@ApiTags('onramp')
@ApiBearerAuth('access-token')
@UseGuards(VerifiedEmailGuard)
@Controller('onramp')
export class OnrampSessionsController {
  constructor(private readonly sessions: OnrampSessionsService) {}

  @Post('sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a fiat→crypto widget session (MoonPay)' })
  createSession(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateOnrampSessionDto,
  ) {
    return this.sessions.createSession(user.id, dto);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List widget on-ramp transactions' })
  listTransactions(@CurrentUser() user: { id: string }, @Query('limit') limit?: string) {
    return this.sessions.listTransactions(user.id, limit ? Number(limit) : 20);
  }

  @Get('transactions/:id')
  @ApiOperation({ summary: 'Get widget on-ramp transaction status' })
  getTransaction(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.sessions.getTransaction(user.id, id);
  }
}
