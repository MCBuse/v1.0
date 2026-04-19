import { useDataScreen } from '@/lib/api';
import { transactionRepository } from './repository';
import type { TransactionListResponse, TransactionQuery } from './models';

export function useTransactions(query?: TransactionQuery) {
  return useDataScreen<TransactionListResponse>({
    queryKey: ['transactions', query ?? {}],
    queryFn: () => transactionRepository.list(query),
  });
}
