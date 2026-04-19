import { http } from '@/lib/api';

import {
  transactionListResponseSchema,
  type TransactionListParams,
  type TransactionListResponse,
} from './models';

export const transactionsRepository = {
  async listTransactions(params: TransactionListParams = {}): Promise<TransactionListResponse> {
    const query = new URLSearchParams();
    if (params.walletType) query.set('walletType', params.walletType);
    if (params.currency)   query.set('currency', params.currency);
    if (params.type)       query.set('type', params.type);
    if (params.limit)      query.set('limit', String(params.limit));
    if (params.offset)     query.set('offset', String(params.offset));

    const url = `/transactions${query.toString() ? `?${query}` : ''}`;
    const raw = await http.get<unknown>(url);
    return transactionListResponseSchema.parse(raw);
  },
};
