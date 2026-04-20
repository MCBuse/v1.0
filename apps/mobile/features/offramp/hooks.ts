import { useOperation } from '@/lib/api';

import type { OfframpInput, OfframpResponse } from './models';
import { offrampRepository } from './repository';

export function useInitiateOfframp() {
  return useOperation<OfframpInput, OfframpResponse>({
    mutationFn:     (input) => offrampRepository.initiateOfframp(input),
    invalidateKeys: [['wallets'], ['transactions']],
  });
}
