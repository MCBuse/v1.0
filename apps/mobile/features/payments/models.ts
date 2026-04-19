import { z } from 'zod';

// ── Requests ─────────────────────────────────────────────────────────────────

export const createPaymentRequestInput = z.object({
  type: z.enum(['static', 'dynamic']),
  amount: z.string().optional(),           // base units, required for dynamic
  currency: z.enum(['USDC', 'EURC']).optional(),
  description: z.string().max(100).optional(),
  expiresInSeconds: z.number().optional(),
});
export type CreatePaymentRequestInput = z.infer<typeof createPaymentRequestInput>;

export const executePaymentInput = z.object({
  nonce: z.string(),
  amount: z.string().optional(),           // base units, required for static QR
  currency: z.enum(['USDC', 'EURC']).optional(),
});
export type ExecutePaymentInput = z.infer<typeof executePaymentInput>;

export const onRampInput = z.object({
  amount: z.string(),                      // base units
  currency: z.enum(['USDC', 'EURC']),
});
export type OnRampInput = z.infer<typeof onRampInput>;

// ── Responses ─────────────────────────────────────────────────────────────────

export const paymentRequest = z.object({
  id: z.string().uuid(),
  type: z.enum(['static', 'dynamic']),
  amount: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  nonce: z.string(),
  status: z.string(),
  expiresAt: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type PaymentRequest = z.infer<typeof paymentRequest>;

export const executePaymentResponse = z.object({}).passthrough();
export type ExecutePaymentResponse = z.infer<typeof executePaymentResponse>;

export const onRampResponse = z.object({}).passthrough();
export type OnRampResponse = z.infer<typeof onRampResponse>;
