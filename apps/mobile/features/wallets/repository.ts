import { http } from '@/lib/api';

import { walletsResponseSchema, type WalletsResponse } from './models';

export const walletsRepository = {
  async getWallets(): Promise<WalletsResponse> {
    const raw = await http.get<unknown>('/wallets');
    return walletsResponseSchema.parse(raw);
  },
};
