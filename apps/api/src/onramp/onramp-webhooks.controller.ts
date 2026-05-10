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
import { OfframpSessionsService } from '../offramp/offramp-sessions.service';
import { MoonpayOfframpProvider } from '../offramp/moonpay-offramp.provider';

type ReqWithRaw = { rawBody?: Buffer };

@Public()
@Controller()
export class OnrampWebhooksController {
  private readonly logger = new Logger(OnrampWebhooksController.name);

  constructor(
    private readonly sessions: OnrampSessionsService,
    private readonly moonpay: MoonpayWidgetProvider,
    private readonly offrampSessions: OfframpSessionsService,
    private readonly moonpayOfframp: MoonpayOfframpProvider,
  ) {}

  @Post('onramp/webhooks/:provider')
  @Post('offramp/webhooks/:provider')
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

    if (this.isSellWebhook(parsed)) {
      const event = this.moonpayOfframp.parseWebhook(parsed);
      await this.offrampSessions.applyMoonpayWebhook(event, parsed);
    } else {
      const event = this.moonpay.parseWebhook(parsed);
      await this.sessions.applyMoonpayWebhook(event, parsed);
    }

    return { received: true };
  }

  private isSellWebhook(payload: unknown): boolean {
    if (typeof payload !== 'object' || payload === null) return false;
    const type = (payload as { type?: unknown }).type;
    return typeof type === 'string' && type.startsWith('sell_');
  }
}
