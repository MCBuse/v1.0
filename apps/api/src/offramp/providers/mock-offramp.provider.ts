import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  OffRampProvider,
  OffRampParams,
  OffRampResult,
} from '../offramp-provider.interface';

/**
 * Mock off-ramp provider for local dev and hackathon demo.
 * Instantly marks every withdrawal as completed — no real fiat movement.
 */
@Injectable()
export class MockOffRampProvider implements OffRampProvider {
  readonly providerName = 'mock';
  private readonly logger = new Logger(MockOffRampProvider.name);

  async initiateOffRamp(params: OffRampParams): Promise<OffRampResult> {
    const externalId = `mock_offramp_${randomUUID()}`;
    this.logger.log(
      `[MockOffRamp] Withdrew ${params.amount} ${params.currency} from wallet ${params.walletId} (externalId: ${externalId})`,
    );
    return {
      externalId,
      status: 'completed',
      amount: params.amount,
      currency: params.currency,
      estimatedSettlement: new Date().toISOString(),
    };
  }
}
