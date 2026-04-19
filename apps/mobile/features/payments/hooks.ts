import { useOperation } from '@/lib/api';

import type {
  CreatePaymentRequestInput,
  ExecutePaymentInput,
  PaymentRequest,
  PaymentResponse,
  ResolveResponse,
} from './models';
import { paymentsRepository } from './repository';

export function useCreatePaymentRequest() {
  return useOperation<CreatePaymentRequestInput, PaymentRequest>({
    mutationFn: (input) => paymentsRepository.createPaymentRequest(input),
  });
}

export function useResolvePaymentRequest() {
  return useOperation<string, ResolveResponse>({
    mutationFn: (nonce) => paymentsRepository.resolvePaymentRequest(nonce),
  });
}

export function useExecutePayment() {
  return useOperation<ExecutePaymentInput, PaymentResponse>({
    mutationFn:     (input) => paymentsRepository.executePayment(input),
    invalidateKeys: [['wallets'], ['transactions']],
  });
}
