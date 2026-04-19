import { http } from '@/lib/api';

import { onrampResponseSchema, type OnrampInput, type OnrampResponse } from './models';

export const onrampRepository = {
  async initiateOnramp(input: OnrampInput): Promise<OnrampResponse> {
    const raw = await http.post<unknown>('/onramp', input);
    return onrampResponseSchema.parse(raw);
  },
};
