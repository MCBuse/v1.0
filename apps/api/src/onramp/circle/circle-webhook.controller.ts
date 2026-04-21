import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { Public } from '../../auth/decorators/public.decorator';
import { CircleSettlementService } from './circle-settlement.service';

interface CircleWebhookBody {
  notificationType: string;
  payment?: {
    id: string;
    status: string;
  };
}

@Public()
@Controller('webhooks/circle')
export class CircleWebhookController {
  private readonly logger = new Logger(CircleWebhookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly settlement: CircleSettlementService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleCircleWebhook(
    @Req() req: { rawBody?: Buffer },
    @Headers('x-circle-signature') signature: string,
    @Body() body: CircleWebhookBody,
  ) {
    // Skip processing when in polling mode — Circle will retry, that's fine
    if (this.config.get<string>('CIRCLE_SETTLEMENT_MODE') === 'polling') {
      this.logger.debug('Webhook received but settlement mode is polling — ignoring');
      return { received: true };
    }

    this.verifySignature(req.rawBody, signature);

    const { notificationType, payment } = body;

    if (notificationType !== 'payments' || !payment) {
      return { received: true };
    }

    const { id: paymentId, status } = payment;

    if (status === 'paid' || status === 'confirmed') {
      await this.settlement.settle(paymentId, 'paid');
    } else if (status === 'failed') {
      await this.settlement.settle(paymentId, 'failed');
    }

    return { received: true };
  }

  private verifySignature(rawBody: Buffer | undefined | null, signature: string) {
    const secret = this.config.get<string>('CIRCLE_WEBHOOK_SECRET');
    if (!secret) {
      // Sandbox / dev — no secret configured, skip verification
      this.logger.warn('CIRCLE_WEBHOOK_SECRET not set — skipping signature verification');
      return;
    }
    if (!signature || !rawBody) {
      throw new UnauthorizedException('Missing Circle signature');
    }
    const computed = createHmac('sha256', secret)
      .update(rawBody)
      .digest('base64');
    const sigBuf = Buffer.from(signature);
    const computedBuf = Buffer.from(computed);
    if (
      sigBuf.length !== computedBuf.length ||
      !timingSafeEqual(sigBuf, computedBuf)
    ) {
      throw new UnauthorizedException('Invalid Circle signature');
    }
  }
}
