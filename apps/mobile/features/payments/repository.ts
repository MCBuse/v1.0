import { http } from '@/lib/api';
import { finishMoneyIntent, moneyIntent } from '@/lib/api/money-intent';

import {
  cancelPaymentRequestResponse,
  executePaymentResponse,
  onRampResponse,
  paymentRequest,
  merchantReceipt,
  resolveResponse,
  type CancelPaymentRequestResponse,
  type CreatePaymentRequestInput,
  type ExecutePaymentInput,
  type ExecutePaymentResponse,
  type ExecuteUsernamePaymentInput,
  type OnRampInput,
  type OnRampResponse,
  type PaymentRequest,
  type ResolveResponse,
  type MerchantReceipt,
} from './models';

export const paymentRepository = {
  async createPaymentRequest(input: CreatePaymentRequestInput): Promise<PaymentRequest> {
    const raw = await http.post<unknown>('/payment-requests', input);
    return paymentRequest.parse(raw);
  },

  async getPaymentRequest(id: string): Promise<PaymentRequest> {
    const raw = await http.get<unknown>(`/payment-requests/${id}`);
    return paymentRequest.parse(raw);
  },

  async cancelPaymentRequest(id: string): Promise<CancelPaymentRequestResponse> {
    const raw = await http.post<unknown>(`/payment-requests/${id}/cancel`);
    return cancelPaymentRequestResponse.parse(raw);
  },

  async resolveNonce(nonce: string): Promise<ResolveResponse> {
    const raw = await http.get<unknown>('/payment-requests/resolve', { params: { nonce } });
    return resolveResponse.parse(raw);
  },

  async executePayment(input: ExecutePaymentInput): Promise<ExecutePaymentResponse> {
    const raw = await http.post<unknown>('/payments', input);
    return executePaymentResponse.parse(raw);
  },

  async getMerchantReceipt(paymentRequestId: string): Promise<MerchantReceipt> {
    const raw = await http.get<unknown>(`/payments/receipts/${paymentRequestId}`);
    return merchantReceipt.parse(raw);
  },

  async executeUsernamePayment(input: ExecuteUsernamePaymentInput): Promise<ExecutePaymentResponse> {
    const raw = await http.post<unknown>('/payments/username', input);
    return executePaymentResponse.parse(raw);
  },

  async topUp(input: OnRampInput): Promise<OnRampResponse> {
    const intent = await moneyIntent('onramp', input);
    const raw = await http.post<unknown>('/onramp', input, {
      headers: { 'Idempotency-Key': intent.key },
    });
    await finishMoneyIntent('onramp');
    return onRampResponse.parse(raw);
  },
};
