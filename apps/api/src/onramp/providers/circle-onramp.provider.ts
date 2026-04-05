import { Injectable, NotImplementedException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OnRampProvider, OnRampParams, OnRampResult } from '../onramp-provider.interface';

/**
 * Real on-ramp via Circle Payments API.
 * Wire this up when ONRAMP_PROVIDER=circle. Requires CIRCLE_API_KEY.
 *
 * Circle flow:
 *   1. Create a Circle payment (card / wire) linked to user's savings pubkey
 *   2. Circle settles USDC/EURC to the MCBuse treasury wallet on-chain
 *   3. MCBuse credits user's custodial savings balance + ledger entry
 *   Webhook from Circle triggers step 3 for async payments.
 */
@Injectable()
export class CircleOnRampProvider implements OnRampProvider {
  readonly providerName = 'circle';

  constructor(private readonly config: ConfigService) {}

  async initiateOnRamp(_params: OnRampParams): Promise<OnRampResult> {
    const apiKey = this.config.get<string>('CIRCLE_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'On-ramp service is not configured. CIRCLE_API_KEY is required when ONRAMP_PROVIDER=circle.',
      );
    }
    // TODO: Phase 9 — implement Circle Payments API integration
    throw new NotImplementedException(
      'Circle on-ramp is not yet implemented. Use ONRAMP_PROVIDER=mock for development.',
    );
  }
}
