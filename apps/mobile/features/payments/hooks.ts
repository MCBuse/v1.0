import { useOperation } from '@/lib/api';
import { paymentRepository } from './repository';
import type {
  CreatePaymentRequestInput,
  ExecutePaymentInput,
  OnRampInput,
  PaymentRequest,
  ExecutePaymentResponse,
  OnRampResponse,
} from './models';

export function useCreatePaymentRequest() {
  return useOperation<CreatePaymentRequestInput, PaymentRequest>({
    mutationFn: (input) => paymentRepository.createPaymentRequest(input),
  });
}

export function useExecutePayment() {
  return useOperation<ExecutePaymentInput, ExecutePaymentResponse>({
    mutationFn: (input) => paymentRepository.executePayment(input),
    invalidateKeys: [['transactions'], ['wallets']],
  });
}

export function useTopUp() {
  return useOperation<OnRampInput, OnRampResponse>({
    mutationFn: (input) => paymentRepository.topUp(input),
    invalidateKeys: [['wallets'], ['transactions']],
  });
}
