import { useOperation } from '@/lib/api';

import type { TransferInput, TransferResponse } from './models';
import { transferRepository } from './repository';

export function useInternalTransfer() {
  return useOperation<TransferInput, TransferResponse>({
    mutationFn:     (input) => transferRepository.transfer(input),
    invalidateKeys: [['wallets'], ['transactions']],
  });
}
