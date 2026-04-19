import { http } from '@/lib/api';

import {
  transactionListResponse,
  type TransactionListResponse,
  type TransactionQuery,
} from './models';

export const transactionRepository = {
  async list(query?: TransactionQuery): Promise<TransactionListResponse> {
    const raw = await http.get<unknown>('/transactions', { params: query });
    return transactionListResponse.parse(raw);
  },
};
