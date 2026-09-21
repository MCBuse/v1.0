import { http } from '@/lib/api';

import { transferResponse, type TransferInput, type TransferResponse } from './models';

export const transferRepository = {
  async transfer(input: TransferInput): Promise<TransferResponse> {
    const { idempotencyKey, ...body } = input;
    const raw = await http.post<unknown>('/wallets/transfer', body, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    return transferResponse.parse(raw);
  },
};
