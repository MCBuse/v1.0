import { http } from '@/lib/api/client';
import {
  createOnrampSessionResponseSchema,
  onrampTransactionListSchema,
  onrampTransactionStatusSchema,
  type CreateOnrampSessionInput,
  type CreateOnrampSessionResponse,
  type OnrampTransactionList,
  type OnrampTransactionStatus,
} from './session-models';

export const onrampSessionRepository = {
  async createSession(input: CreateOnrampSessionInput): Promise<CreateOnrampSessionResponse> {
    const raw = await http.post<unknown>('/onramp/sessions', input);
    return createOnrampSessionResponseSchema.parse(raw);
  },

  async getTransaction(id: string): Promise<OnrampTransactionStatus> {
    const raw = await http.get<unknown>(`/onramp/transactions/${id}`);
    return onrampTransactionStatusSchema.parse(raw);
  },

  async listTransactions(limit = 10): Promise<OnrampTransactionList> {
    const raw = await http.get<unknown>('/onramp/transactions', { params: { limit } });
    return onrampTransactionListSchema.parse(raw);
  },
};
