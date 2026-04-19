import { useDataScreen } from '@/lib/api';

import type { TransactionListParams, TransactionListResponse } from './models';
import { transactionsRepository } from './repository';

export function useTransactions(params: TransactionListParams = {}) {
  return useDataScreen<TransactionListResponse>({
    queryKey: ['transactions', params],
    queryFn:  () => transactionsRepository.listTransactions(params),
  });
}
