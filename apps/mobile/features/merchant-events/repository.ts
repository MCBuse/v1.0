import { http } from '@/lib/api';

import {
  merchantEventsPage,
  presentedRequestResponse,
  type MerchantEvent,
  type PresentedRequest,
} from './models';

export const merchantEventsRepository = {
  async presented(): Promise<{
    request: PresentedRequest | null;
    latestSequence: string | null;
  }> {
    return presentedRequestResponse.parse(
      await http.get<unknown>('/merchants/me/presented-request'),
    );
  },

  async since(after: string | null): Promise<{
    events: MerchantEvent[];
    latestSequence: string | null;
  }> {
    return merchantEventsPage.parse(
      await http.get<unknown>('/merchants/me/events', {
        params: after ? { after } : undefined,
      }),
    );
  },

  async present(paymentRequestId: string): Promise<PresentedRequest> {
    const raw = await http.post<unknown>(
      `/merchants/me/payment-requests/${paymentRequestId}/present`,
    );
    return raw as PresentedRequest;
  },

  async clear(): Promise<void> {
    await http.delete<unknown>('/merchants/me/presented-request');
  },
};
