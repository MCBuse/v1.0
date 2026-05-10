import { useDataScreen, useOperation } from '@/lib/api';

import type {
  CreateOfframpSessionInput,
  CreateOfframpSessionResponse,
  InitiateMoonpayDepositInput,
  InitiateMoonpayDepositResponse,
  OfframpInput,
  OfframpResponse,
  OfframpTransactionStatus,
  SignOfframpUrlResponse,
  StripeAccountStatus,
  StripeOnboardingLink,
} from './models';
import { offrampRepository } from './repository';

const TERMINAL = new Set<OfframpTransactionStatus['status']>([
  'completed',
  'failed',
  'cancelled',
]);

export function useInitiateOfframp() {
  return useOperation<OfframpInput, OfframpResponse>({
    mutationFn:     (input) => offrampRepository.initiateOfframp(input),
    invalidateKeys: [['wallets'], ['transactions']],
  });
}

export function useCreateOfframpSession() {
  return useOperation<CreateOfframpSessionInput, CreateOfframpSessionResponse>({
    mutationFn:     (input) => offrampRepository.createSession(input),
    invalidateKeys: [['wallets'], ['transactions']],
  });
}

export function useSignOfframpUrl() {
  return useOperation<{ transactionId: string; url: string }, SignOfframpUrlResponse>({
    mutationFn: ({ transactionId, url }) => offrampRepository.signUrl(transactionId, url),
  });
}

export function useInitiateMoonpayDeposit(transactionId: string | undefined) {
  return useOperation<InitiateMoonpayDepositInput, InitiateMoonpayDepositResponse>({
    mutationFn:     (input) => offrampRepository.initiateMoonpayDeposit(transactionId!, input),
    invalidateKeys: [['wallets'], ['transactions'], ['offramp', 'transaction', transactionId]],
  });
}

export function useOfframpStatus(transactionId: string | undefined, enabled: boolean) {
  return useDataScreen<OfframpTransactionStatus>({
    queryKey: ['offramp', 'transaction', transactionId],
    queryFn:  () => offrampRepository.getTransaction(transactionId!),
    enabled:  Boolean(transactionId) && enabled,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      if (!s || TERMINAL.has(s)) return false;
      return 3000;
    },
  });
}

export function useOfframpTransactions(limit = 10) {
  return useDataScreen({
    queryKey: ['offramp', 'transactions', limit],
    queryFn:  () => offrampRepository.listTransactions(limit),
    refetchInterval: (q) => {
      const hasOpen = q.state.data?.data.some((tx) => !TERMINAL.has(tx.status));
      return hasOpen ? 5000 : false;
    },
  });
}

export function useStripeAccountStatus(enabled = true) {
  return useDataScreen<StripeAccountStatus>({
    queryKey: ['offramp', 'stripe', 'account-status'],
    queryFn:  () => offrampRepository.getStripeAccountStatus(),
    enabled,
  });
}

export function useCreateStripeOnboardingLink() {
  return useOperation<void, StripeOnboardingLink>({
    mutationFn:     () => offrampRepository.createStripeOnboardingLink(),
    invalidateKeys: [['offramp', 'stripe', 'account-status']],
  });
}
