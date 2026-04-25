import { MoonpayWebClient } from './moonpay.client';
import type { OnrampWebClient } from './onramp-client.interface';

const moonpay = new MoonpayWebClient();

export function getOnrampWebClient(provider: string): OnrampWebClient {
  if (provider === 'moonpay') return moonpay;
  throw new Error(`Unknown onramp provider: ${provider}`);
}
