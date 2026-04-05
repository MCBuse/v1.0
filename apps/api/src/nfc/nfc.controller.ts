import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { NfcService } from './nfc.service';
import { CreateNfcSessionDto } from './dto/create-nfc-session.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('nfc')
@ApiBearerAuth('access-token')
@Controller('nfc')
export class NfcController {
  constructor(private readonly nfcService: NfcService) {}

  @Post('session')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(VerifiedEmailGuard)
  @ApiOperation({
    summary: 'Create an NFC tap session',
    description:
      'Creates a short-lived payment request (default 60 s) optimised for NFC tap-to-pay. ' +
      'Returns an nfcPayload URI to write to an NFC tag or broadcast via Host Card Emulation (HCE). ' +
      'The payer executes the payment via POST /payments with the returned nonce — ' +
      'identical to the QR flow.',
  })
  createSession(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateNfcSessionDto,
  ) {
    return this.nfcService.createSession(user.id, dto);
  }

  @Get('resolve')
  @Public()
  @ApiOperation({
    summary: 'Resolve an NFC nonce (tap detected)',
    description:
      'Called by the payer\'s app immediately after detecting the NFC tag. ' +
      'Returns the payment details so the app can show a confirmation screen ' +
      'before the user approves. No auth required — the nonce is the secret.',
  })
  @ApiQuery({
    name: 'nonce',
    required: true,
    description: 'Nonce from the NFC payload URI',
  })
  resolveSession(@Query('nonce') nonce: string) {
    return this.nfcService.resolveSession(nonce);
  }
}
