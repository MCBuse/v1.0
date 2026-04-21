import { Injectable, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { CircleClient } from '../circle/circle.client';
import type { OnRampProvider, OnRampParams, OnRampResult } from '../onramp-provider.interface';

interface CirclePaymentResponse {
  id: string;
  status: string;
  amount: { amount: string; currency: string };
}

@Injectable()
export class CircleOnRampProvider implements OnRampProvider {
  readonly providerName = 'circle';

  constructor(
    private readonly config: ConfigService,
    private readonly circleClient: CircleClient,
  ) {}

  async initiateOnRamp(params: OnRampParams): Promise<OnRampResult> {
    if (!this.config.get<string>('CIRCLE_API_KEY')) {
      throw new ServiceUnavailableException(
        'CIRCLE_API_KEY is required when ONRAMP_PROVIDER=circle',
      );
    }
    if (!params.cardSourceId) {
      throw new BadRequestException(
        'cardSourceId is required for Circle on-ramp. Tokenize the card first via POST /onramp/cards',
      );
    }

    // Circle works with decimal strings: 1_000_000 base units → "1.00"
    const decimalAmount = (Number(params.amount) / 1_000_000).toFixed(2);
    const circleCurrency = params.currency === 'EURC' ? 'EUR' : 'USD';

    const payment = await this.circleClient.post<CirclePaymentResponse>('/v1/payments', {
      idempotencyKey: params.idempotencyKey ?? randomUUID(),
      amount: { amount: decimalAmount, currency: circleCurrency },
      source: { id: params.cardSourceId, type: 'card' },
      description: `MCBuse top-up: ${decimalAmount} ${circleCurrency}`,
      metadata: {
        walletId: params.walletId,
        sessionId: randomUUID(),
        ipAddress: '0.0.0.0',
      },
    });

    // Map Circle status → our status
    // Circle: 'pending' | 'confirmed' | 'paid' | 'action_required' | 'failed'
    const status =
      payment.status === 'paid' || payment.status === 'confirmed'
        ? 'completed'
        : payment.status === 'failed'
          ? 'failed'
          : 'pending';

    return {
      externalId: payment.id,
      status,
      amount: params.amount,
      currency: params.currency,
    };
  }
}
