import { http } from '@/lib/api';

import { offrampResponse, type OfframpInput, type OfframpResponse } from './models';

export const offrampRepository = {
  async initiateOfframp(input: OfframpInput): Promise<OfframpResponse> {
    const raw = await http.post<unknown>('/offramp', input);
    return offrampResponse.parse(raw);
  },
};
