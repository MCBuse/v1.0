import { http } from '@/lib/api';
import { walletMapResponse, type WalletMapResponse } from './models';

export const walletRepository = {
  async getWallets(): Promise<WalletMapResponse> {
    const raw = await http.get<unknown>('/wallets');
    return walletMapResponse.parse(raw);
  },
};
