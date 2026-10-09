import { http } from '@/lib/api';
import { finishMoneyIntent, moneyIntent } from '@/lib/api/money-intent';

import {
  swapPreviewResponse,
  swapExecuteResponse,
  type SwapPreviewInput,
  type SwapPreviewResponse,
  type SwapExecuteInput,
  type SwapExecuteResponse,
} from './models';

export const swapRepository = {
  async preview(input: SwapPreviewInput): Promise<SwapPreviewResponse> {
    const raw = await http.post<unknown>('/swap/preview', input);
    return swapPreviewResponse.parse(raw);
  },

  async execute(input: SwapExecuteInput): Promise<SwapExecuteResponse> {
    // Same key on every retry of this swap, so a lost response can't swap twice.
    const intent = await moneyIntent('swap', input);
    const raw = await http.post<unknown>('/swap', input, {
      headers: { 'Idempotency-Key': intent.key },
    });
    await finishMoneyIntent('swap');
    return swapExecuteResponse.parse(raw);
  },
};
