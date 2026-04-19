import { useDataScreen } from '@/lib/api';

import type { WalletsResponse } from './models';
import { walletsRepository } from './repository';

export function useWallets() {
  return useDataScreen<WalletsResponse>({
    queryKey: ['wallets'],
    queryFn:  () => walletsRepository.getWallets(),
  });
}
