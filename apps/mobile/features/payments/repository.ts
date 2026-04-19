import { http } from '@/lib/api';

import {
  paymentRequestSchema,
  paymentResponseSchema,
  resolveResponseSchema,
  type CreatePaymentRequestInput,
  type ExecutePaymentInput,
  type PaymentRequest,
  type PaymentResponse,
  type ResolveResponse,
} from './models';

export const paymentsRepository = {
  async createPaymentRequest(input: CreatePaymentRequestInput): Promise<PaymentRequest> {
    const raw = await http.post<unknown>('/payment-requests', input);
    return paymentRequestSchema.parse(raw);
  },

  async resolvePaymentRequest(nonce: string): Promise<ResolveResponse> {
    const raw = await http.get<unknown>(`/payment-requests/resolve?nonce=${encodeURIComponent(nonce)}`);
    return resolveResponseSchema.parse(raw);
  },

  async executePayment(input: ExecutePaymentInput): Promise<PaymentResponse> {
    const raw = await http.post<unknown>('/payments', input);
    return paymentResponseSchema.parse(raw);
  },
};
