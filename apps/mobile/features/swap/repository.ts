import { http } from '@/lib/api';

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
    const raw = await http.post<unknown>('/swap', input);
    return swapExecuteResponse.parse(raw);
  },
};
