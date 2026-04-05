import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { OnRampProvider, OnRampParams, OnRampResult } from '../onramp-provider.interface';

/**
 * Mock on-ramp provider for local dev and hackathon demo.
 * Instantly marks every on-ramp as completed — no real fiat movement.
 */
@Injectable()
export class MockOnRampProvider implements OnRampProvider {
  readonly providerName = 'mock';
  private readonly logger = new Logger(MockOnRampProvider.name);

  async initiateOnRamp(params: OnRampParams): Promise<OnRampResult> {
    const externalId = randomUUID();
    this.logger.log(
      `[MockOnRamp] Credited ${params.amount} ${params.currency} to wallet ${params.walletId} (externalId: ${externalId})`,
    );
    return {
      externalId,
      status: 'completed',
      amount: params.amount,
      currency: params.currency,
    };
  }
}
