import {
  Controller,
  Post,
  Param,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { OnrampSessionsService } from './onramp-sessions.service';
import { MoonpayWidgetProvider } from './widget/moonpay-widget.provider';

type ReqWithRaw = { rawBody?: Buffer };

@Public()
@Controller()
export class OnrampWebhooksController {
  private readonly logger = new Logger(OnrampWebhooksController.name);

  constructor(
    private readonly sessions: OnrampSessionsService,
    private readonly moonpay: MoonpayWidgetProvider,
  ) {}

  @Post('onramp/webhooks/:provider')
  @Post('webhooks/:provider')
  @HttpCode(HttpStatus.OK)
  async handle(
    @Param('provider') provider: string,
    @Req() req: ReqWithRaw,
    @Headers('moonpay-signature-v2') moonpaySigV2: string | undefined,
    @Headers() allHeaders: Record<string, string | string[] | undefined>,
  ) {
    if (provider !== 'moonpay') {
      throw new BadRequestException(`Unsupported webhook provider: ${provider}`);
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      this.logger.error('Missing rawBody on webhook request — enable Nest rawBody option');
      throw new UnauthorizedException('Missing raw body');
    }

    const sigHeader =
      moonpaySigV2 ??
      (typeof allHeaders['moonpay-signature-v2'] === 'string'
        ? allHeaders['moonpay-signature-v2']
        : undefined);

    if (!this.moonpay.verifyWebhook(rawBody, sigHeader)) {
      throw new UnauthorizedException('Invalid MoonPay signature');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString('utf8')) as unknown;
    } catch {
      throw new BadRequestException('Invalid JSON body');
    }

    const event = this.moonpay.parseWebhook(parsed);
    await this.sessions.applyMoonpayWebhook(event, parsed);

    return { received: true };
  }
}
