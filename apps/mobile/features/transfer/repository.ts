import { http } from '@/lib/api';

import { transferResponse, type TransferInput, type TransferResponse } from './models';

export const transferRepository = {
  async transfer(input: TransferInput): Promise<TransferResponse> {
    const raw = await http.post<unknown>('/wallets/transfer', input);
    return transferResponse.parse(raw);
  },
};
