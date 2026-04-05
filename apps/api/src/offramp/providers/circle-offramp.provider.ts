import {
  Injectable,
  NotImplementedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  OffRampProvider,
  OffRampParams,
  OffRampResult,
} from '../offramp-provider.interface';

/**
 * Real off-ramp via Circle Payouts API.
 * Wire this up when OFFRAMP_PROVIDER=circle. Requires CIRCLE_API_KEY.
 *
 * Circle flow:
 *   1. User submits bank account details (IBAN / routing + account number)
 *   2. POST /v1/payouts — Circle burns USDC/EURC from treasury wallet and pushes fiat via SEPA/ACH
 *   3. MCBuse deducts user custodial balance + writes ledger entry (type=off_ramp)
 *   Webhook from Circle confirms final settlement status.
 *
 * Docs: https://developers.circle.com/circle-mint/docs/payouts-quickstart
 */
@Injectable()
export class CircleOffRampProvider implements OffRampProvider {
  readonly providerName = 'circle';

  constructor(private readonly config: ConfigService) {}

  async initiateOffRamp(_params: OffRampParams): Promise<OffRampResult> {
    const apiKey = this.config.get<string>('CIRCLE_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Off-ramp service is not configured. CIRCLE_API_KEY is required when OFFRAMP_PROVIDER=circle.',
      );
    }
    // TODO: implement Circle Payouts API integration
    throw new NotImplementedException(
      'Circle off-ramp is not yet implemented. Use OFFRAMP_PROVIDER=mock for development.',
    );
  }
}
