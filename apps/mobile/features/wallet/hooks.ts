import { useDataScreen } from '@/lib/api';
import { walletRepository } from './repository';
import type { WalletMapResponse } from './models';

export function useWallets() {
  return useDataScreen<WalletMapResponse>({
    queryKey: ['wallets'],
    queryFn: () => walletRepository.getWallets(),
  });
}
