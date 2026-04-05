import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { PaymentRequestsService } from './payment-requests.service';
import { CreatePaymentRequestDto } from './dto/create-payment-request.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';

@ApiTags('payment-requests')
@ApiBearerAuth('access-token')
@UseGuards(VerifiedEmailGuard)
@Controller('payment-requests')
export class PaymentRequestsController {
  constructor(private readonly service: PaymentRequestsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a static or dynamic payment request (QR)' })
  create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreatePaymentRequestDto,
  ) {
    return this.service.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List own payment requests' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'completed', 'expired', 'cancelled'] })
  @ApiQuery({ name: 'type', required: false, enum: ['static', 'dynamic'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  list(
    @CurrentUser() user: { id: string },
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    return this.service.list(user.id, { status, type, limit, offset });
  }

  @Get('resolve')
  @ApiOperation({ summary: 'Resolve a payment request by nonce (QR scan)' })
  @ApiQuery({ name: 'nonce', required: true, description: 'Nonce from QR payload' })
  resolve(@Query('nonce') nonce: string) {
    return this.service.resolve(nonce);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single payment request by ID' })
  @ApiParam({ name: 'id', description: 'Payment request UUID' })
  findById(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.service.findById(user.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a pending payment request' })
  @ApiParam({ name: 'id', description: 'Payment request UUID' })
  cancel(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.service.cancel(user.id, id);
  }
}
