import { Controller, Get, Redirect } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';

const CONNECT_RETURN_DEEP_LINK = 'mcbuse://offramp/connect/return';
const CONNECT_REFRESH_DEEP_LINK = 'mcbuse://offramp/connect/refresh';

@Public()
@ApiExcludeController()
@Controller('offramp/stripe/connect')
export class StripeConnectCallbackController {
  @Get('return')
  @Redirect(CONNECT_RETURN_DEEP_LINK, 302)
  returnToApp() {
    return;
  }

  @Get('refresh')
  @Redirect(CONNECT_REFRESH_DEEP_LINK, 302)
  refreshInApp() {
    return;
  }
}
