import { useQuery } from '@tanstack/react-query';
import { onrampSessionRepository } from './session-repository';
import type { OnrampTransactionStatus } from './session-models';

const TERMINAL = new Set<OnrampTransactionStatus['status']>([
  'completed',
  'failed',
  'cancelled',
  'expired',
]);

export function useOnrampStatus(transactionId: string | undefined, enabled: boolean) {
  return useQuery<OnrampTransactionStatus, Error>({
    queryKey: ['onramp', 'transaction', transactionId],
    queryFn: () => onrampSessionRepository.getTransaction(transactionId!),
    enabled: Boolean(transactionId) && enabled,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      if (!s || TERMINAL.has(s)) return false;
      return 3000;
    },
  });
}

export function useOnrampTransactions(limit = 10) {
  return useQuery({
    queryKey: ['onramp', 'transactions', limit],
    queryFn: () => onrampSessionRepository.listTransactions(limit),
    refetchInterval: (q) => {
      const hasOpen = q.state.data?.data.some((tx) => !TERMINAL.has(tx.status));
      return hasOpen ? 5000 : false;
    },
  });
}
