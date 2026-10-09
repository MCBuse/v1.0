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
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { OnrampSessionsService } from './onramp-sessions.service';
import { MoonpayWidgetProvider } from './widget/moonpay-widget.provider';
import { StripeOnrampProvider } from './widget/stripe-onramp.provider';
import { OfframpSessionsService } from '../offramp/offramp-sessions.service';
import { MoonpayOfframpProvider } from '../offramp/moonpay-offramp.provider';
import { StripeOfframpProvider } from '../offramp/stripe-offramp.provider';
import { AccountsWebhookService } from '../accounts/accounts-webhook.service';

type ReqWithRaw = { rawBody?: Buffer };

@Public()
@SkipThrottle()
@Controller()
export class OnrampWebhooksController {
  private readonly logger = new Logger(OnrampWebhooksController.name);

  constructor(
    private readonly sessions: OnrampSessionsService,
    private readonly moonpay: MoonpayWidgetProvider,
    private readonly stripeOnramp: StripeOnrampProvider,
    private readonly offrampSessions: OfframpSessionsService,
    private readonly moonpayOfframp: MoonpayOfframpProvider,
    private readonly stripeOfframp: StripeOfframpProvider,
    private readonly accountsWebhooks: AccountsWebhookService,
  ) {}

  @Post('onramp/webhooks/:provider')
  @HttpCode(HttpStatus.OK)
  async handle(
    @Param('provider') provider: string,
    @Req() req: ReqWithRaw,
    @Headers('moonpay-signature-v2') moonpaySigV2: string | undefined,
    @Headers('stripe-signature') stripeSignature: string | undefined,
    @Headers() allHeaders: Record<string, string | string[] | undefined>,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      this.logger.error(
        'Missing rawBody on webhook request — enable Nest rawBody option',
      );
      throw new UnauthorizedException('Missing raw body');
    }

    if (provider === 'moonpay') {
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

      if (this.isMoonpaySellWebhook(parsed)) {
        const event = this.moonpayOfframp.parseWebhook(parsed);
        await this.offrampSessions.applyMoonpayWebhook(event, parsed);
      } else {
        const event = this.moonpay.parseWebhook(parsed);
        await this.sessions.applyMoonpayWebhook(event, parsed);
      }
      return { received: true };
    }

    if (provider === 'stripe') {
      const sigHeader =
        stripeSignature ??
        (typeof allHeaders['stripe-signature'] === 'string'
          ? allHeaders['stripe-signature']
          : undefined);
      if (!this.stripeOnramp.verifyWebhook(rawBody, sigHeader)) {
        throw new UnauthorizedException('Invalid Stripe signature');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody.toString('utf8')) as unknown;
      } catch {
        throw new BadRequestException('Invalid JSON body');
      }

      const eventType = this.extractEventType(parsed);

      // Account funding and withdrawal events are handled first; they carry
      // their own de-duplication and must not fall through to the legacy ramps.
      if (this.accountsWebhooks.handles(eventType)) {
        const result = await this.accountsWebhooks.handleStripeEvent(
          parsed,
          rawBody.toString('utf8'),
        );
        if (result.handled) return { received: true };
      }

      if (this.stripeOfframp.isOfframpEvent(eventType)) {
        const event = this.stripeOfframp.parseWebhook(parsed);
        await this.offrampSessions.applyStripeWebhook(event, parsed);
      } else if (this.stripeOnramp.isOnrampEvent(eventType)) {
        const event = this.stripeOnramp.parseWebhook(parsed);
        await this.sessions.applyStripeWebhook(event, parsed);
      } else {
        this.logger.debug(`Ignoring Stripe event type: ${eventType}`);
      }
      return { received: true };
    }

    throw new BadRequestException(`Unsupported webhook provider: ${provider}`);
  }

  @Post('offramp/webhooks/:provider')
  @HttpCode(HttpStatus.OK)
  async handleOfframp(
    @Param('provider') provider: string,
    @Req() req: ReqWithRaw,
    @Headers('moonpay-signature-v2') moonpaySigV2: string | undefined,
    @Headers('stripe-signature') stripeSignature: string | undefined,
    @Headers() allHeaders: Record<string, string | string[] | undefined>,
  ) {
    return this.handle(
      provider,
      req,
      moonpaySigV2,
      stripeSignature,
      allHeaders,
    );
  }

  @Post('webhooks/:provider')
  @HttpCode(HttpStatus.OK)
  async handleGeneric(
    @Param('provider') provider: string,
    @Req() req: ReqWithRaw,
    @Headers('moonpay-signature-v2') moonpaySigV2: string | undefined,
    @Headers('stripe-signature') stripeSignature: string | undefined,
    @Headers() allHeaders: Record<string, string | string[] | undefined>,
  ) {
    return this.handle(
      provider,
      req,
      moonpaySigV2,
      stripeSignature,
      allHeaders,
    );
  }

  private isMoonpaySellWebhook(payload: unknown): boolean {
    if (typeof payload !== 'object' || payload === null) return false;
    const type = (payload as { type?: unknown }).type;
    return typeof type === 'string' && type.startsWith('sell_');
  }

  private extractEventType(payload: unknown): string {
    if (typeof payload !== 'object' || payload === null) return '';
    const type = (payload as { type?: unknown }).type;
    return typeof type === 'string' ? type : '';
  }
}
