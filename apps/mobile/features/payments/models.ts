import { z } from 'zod';

// ── Requests ──────────────────────────────────────────────────────────────────

export const createPaymentRequestInput = z.object({
  type:              z.enum(['static', 'dynamic']),
  amount:            z.string().optional(),
  currency:          z.enum(['USDC', 'EURC']).optional(),
  description:       z.string().max(100).optional(),
  expiresInSeconds:  z.number().optional(),
});
export type CreatePaymentRequestInput = z.infer<typeof createPaymentRequestInput>;

export const executePaymentInput = z.object({
  nonce:    z.string(),
  amount:   z.string().optional(),
  currency: z.enum(['USDC', 'EURC']).optional(),
});
export type ExecutePaymentInput = z.infer<typeof executePaymentInput>;

export const onRampInput = z.object({
  amount:   z.string(),
  currency: z.enum(['USDC', 'EURC']),
});
export type OnRampInput = z.infer<typeof onRampInput>;

// ── Responses ─────────────────────────────────────────────────────────────────

export const paymentRequest = z.object({
  id:          z.string(),
  type:        z.enum(['static', 'dynamic']),
  amount:      z.string().nullable().optional(),
  currency:    z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  nonce:       z.string(),
  status:      z.string(),
  expiresAt:   z.string().nullable().optional(),
  createdAt:   z.string(),
  qrString:    z.string().optional(),
});
export type PaymentRequest = z.infer<typeof paymentRequest>;

export const resolveResponse = paymentRequest.extend({
  creatorWallet: z.object({
    id:           z.string(),
    solanaPubkey: z.string(),
    type:         z.literal('routine'),
  }),
});
export type ResolveResponse = z.infer<typeof resolveResponse>;

export const executePaymentResponse = z.object({
  txSignature:      z.string().nullable(),
  amount:           z.string(),
  currency:         z.string(),
  payerWalletId:    z.string(),
  payeeWalletId:    z.string(),
  idempotencyKey:   z.string(),
  paymentRequestId: z.string(),
});
export type ExecutePaymentResponse = z.infer<typeof executePaymentResponse>;

export const onRampResponse = z.object({
  externalId: z.string(),
  status:     z.enum(['completed', 'pending']),
  amount:     z.string(),
  currency:   z.string(),
  balance: z.object({
    currency:  z.enum(['USDC', 'EURC']),
    available: z.string(),
    pending:   z.string(),
  }),
});
export type OnRampResponse = z.infer<typeof onRampResponse>;
