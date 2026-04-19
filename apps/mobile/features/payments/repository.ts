import { http } from '@/lib/api';

import {
  executePaymentResponse,
  onRampResponse,
  paymentRequest,
  resolveResponse,
  type CreatePaymentRequestInput,
  type ExecutePaymentInput,
  type ExecutePaymentResponse,
  type OnRampInput,
  type OnRampResponse,
  type PaymentRequest,
  type ResolveResponse,
} from './models';

export const paymentRepository = {
  async createPaymentRequest(input: CreatePaymentRequestInput): Promise<PaymentRequest> {
    const raw = await http.post<unknown>('/payment-requests', input);
    return paymentRequest.parse(raw);
  },

  async resolveNonce(nonce: string): Promise<ResolveResponse> {
    const raw = await http.get<unknown>('/payment-requests/resolve', { params: { nonce } });
    return resolveResponse.parse(raw);
  },

  async executePayment(input: ExecutePaymentInput): Promise<ExecutePaymentResponse> {
    const raw = await http.post<unknown>('/payments', input);
    return executePaymentResponse.parse(raw);
  },

  async topUp(input: OnRampInput): Promise<OnRampResponse> {
    const raw = await http.post<unknown>('/onramp', input);
    return onRampResponse.parse(raw);
  },
};
