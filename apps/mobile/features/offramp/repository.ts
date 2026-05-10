import { http } from '@/lib/api';

import {
  createOfframpSessionResponseSchema,
  initiateMoonpayDepositResponseSchema,
  offrampResponse,
  offrampTransactionListSchema,
  offrampTransactionStatusSchema,
  signOfframpUrlResponseSchema,
  type CreateOfframpSessionInput,
  type CreateOfframpSessionResponse,
  type InitiateMoonpayDepositInput,
  type InitiateMoonpayDepositResponse,
  type OfframpInput,
  type OfframpResponse,
  type OfframpTransactionList,
  type OfframpTransactionStatus,
  type SignOfframpUrlResponse,
} from './models';

export const offrampRepository = {
  async initiateOfframp(input: OfframpInput): Promise<OfframpResponse> {
    const raw = await http.post<unknown>('/offramp', input);
    return offrampResponse.parse(raw);
  },

  async createSession(input: CreateOfframpSessionInput): Promise<CreateOfframpSessionResponse> {
    const raw = await http.post<unknown>('/offramp/sessions', input);
    return createOfframpSessionResponseSchema.parse(raw);
  },

  async signUrl(transactionId: string, url: string): Promise<SignOfframpUrlResponse> {
    const raw = await http.post<unknown>(`/offramp/sessions/${transactionId}/signature`, {
      url,
    });
    return signOfframpUrlResponseSchema.parse(raw);
  },

  async initiateMoonpayDeposit(
    transactionId: string,
    input: InitiateMoonpayDepositInput,
  ): Promise<InitiateMoonpayDepositResponse> {
    const raw = await http.post<unknown>(
      `/offramp/sessions/${transactionId}/deposit`,
      input,
    );
    return initiateMoonpayDepositResponseSchema.parse(raw);
  },

  async getTransaction(id: string): Promise<OfframpTransactionStatus> {
    const raw = await http.get<unknown>(`/offramp/transactions/${id}`);
    return offrampTransactionStatusSchema.parse(raw);
  },

  async listTransactions(limit = 10): Promise<OfframpTransactionList> {
    const raw = await http.get<unknown>('/offramp/transactions', { params: { limit } });
    return offrampTransactionListSchema.parse(raw);
  },
};
