import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  OffRampProvider,
  OffRampParams,
  OffRampResult,
} from '../offramp-provider.interface';

@Injectable()
export class MoonpayLegacyOffRampProvider implements OffRampProvider {
  readonly providerName = 'moonpay';

  async initiateOffRamp(_params: OffRampParams): Promise<OffRampResult> {
    throw new BadRequestException(
      'MoonPay off-ramp uses the widget session flow. Use POST /offramp/sessions instead of POST /offramp.',
    );
  }
}
