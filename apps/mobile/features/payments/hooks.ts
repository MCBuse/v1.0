import { useOperation } from '@/lib/api';

import {
  type CreatePaymentRequestInput,
  type ExecutePaymentInput,
  type ExecutePaymentResponse,
  type OnRampInput,
  type OnRampResponse,
  type PaymentRequest,
  type ResolveResponse,
} from './models';
import { paymentRepository } from './repository';

export function useCreatePaymentRequest() {
  return useOperation<CreatePaymentRequestInput, PaymentRequest>({
    mutationFn: (input) => paymentRepository.createPaymentRequest(input),
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

export function useTopUp() {
  return useOperation<OnRampInput, OnRampResponse>({
    mutationFn:     (input) => paymentRepository.topUp(input),
    invalidateKeys: [['wallets'], ['transactions']],
  });
}
