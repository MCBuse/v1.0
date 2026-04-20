import { useOperation } from '@/lib/api';

import type {
  SwapPreviewInput,
  SwapPreviewResponse,
  SwapExecuteInput,
  SwapExecuteResponse,
} from './models';
import { swapRepository } from './repository';

export function useSwapPreview() {
  return useOperation<SwapPreviewInput, SwapPreviewResponse>({
    mutationFn: (input) => swapRepository.preview(input),
  });
}

export function useExecuteSwap() {
  return useOperation<SwapExecuteInput, SwapExecuteResponse>({
    mutationFn:     (input) => swapRepository.execute(input),
    invalidateKeys: [['wallets'], ['transactions']],
  });
}
