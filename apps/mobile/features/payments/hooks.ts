import { useDataScreen, useOperation } from '@/lib/api';

import {
  type CancelPaymentRequestResponse,
  type CreatePaymentRequestInput,
  type ExecutePaymentInput,
  type ExecutePaymentResponse,
  type ExecuteUsernamePaymentInput,
  type OnRampInput,
  type OnRampResponse,
  type PaymentRequest,
  type ResolveResponse,
} from './models';
import { paymentRepository } from './repository';

const TERMINAL_PAYMENT_REQUEST_STATUSES = new Set(['completed', 'expired', 'cancelled']);

export function useCreatePaymentRequest() {
  return useOperation<CreatePaymentRequestInput, PaymentRequest>({
    mutationFn: (input) => paymentRepository.createPaymentRequest(input),
  });
}

export function usePaymentRequest(id: string | undefined, enabled = true) {
  return useDataScreen<PaymentRequest>({
    queryKey: ['payment-request', id],
    queryFn:  () => paymentRepository.getPaymentRequest(id!),
    enabled:  Boolean(id) && enabled,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (!status || TERMINAL_PAYMENT_REQUEST_STATUSES.has(status)) return false;
      return 2000;
    },
  });
}

export function useCancelPaymentRequest() {
  return useOperation<string, CancelPaymentRequestResponse>({
    mutationFn:     (id) => paymentRepository.cancelPaymentRequest(id),
    invalidateKeys: [['payment-request']],
  });
}

export function useResolvePaymentRequest() {
  return useOperation<string, ResolveResponse>({
    mutationFn: (nonce) => paymentRepository.resolveNonce(nonce),
  });
}

export function useExecutePayment() {
  return useOperation<ExecutePaymentInput, ExecutePaymentResponse>({
    mutationFn:     (input) => paymentRepository.executePayment(input),
    invalidateKeys: [['wallets'], ['transactions']],
  });
}

export function useExecuteUsernamePayment() {
  return useOperation<ExecuteUsernamePaymentInput, ExecutePaymentResponse>({
    mutationFn:     (input) => paymentRepository.executeUsernamePayment(input),
    invalidateKeys: [['wallets'], ['transactions']],
  });
}

export function useTopUp() {
  return useOperation<OnRampInput, OnRampResponse>({
    mutationFn:     (input) => paymentRepository.topUp(input),
    invalidateKeys: [['wallets'], ['transactions']],
  });
}
