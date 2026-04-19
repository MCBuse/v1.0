import { useOperation } from '@/lib/api';

import type { OnrampInput, OnrampResponse } from './models';
import { onrampRepository } from './repository';

export function useInitiateOnramp() {
  return useOperation<OnrampInput, OnrampResponse>({
    mutationFn:     (input) => onrampRepository.initiateOnramp(input),
    invalidateKeys: [['wallets'], ['transactions']],
  });
}
