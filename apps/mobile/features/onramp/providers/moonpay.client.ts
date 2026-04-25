import type { OnrampWebClient } from './onramp-client.interface';

export class MoonpayWebClient implements OnrampWebClient {
  readonly providerName = 'moonpay';

  isCompletionUrl(url: string, redirectBase: string): boolean {
    if (!redirectBase) return false;
    return url.startsWith(redirectBase.split('?')[0]);
  }
}
