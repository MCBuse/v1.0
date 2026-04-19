import { z } from 'zod';

export const paymentRequestSchema = z.object({
  id:          z.string(),
  type:        z.enum(['static', 'dynamic']),
  amount:      z.string().nullable(),
  currency:    z.string().nullable(),
  description: z.string().nullable(),
  nonce:       z.string(),
  status:      z.enum(['pending', 'completed', 'expired', 'cancelled']),
  expiresAt:   z.string().nullable(),
  qrString:    z.string(),
});
export type PaymentRequest = z.infer<typeof paymentRequestSchema>;

export const resolveResponseSchema = paymentRequestSchema.extend({
  creatorWallet: z.object({
    id:           z.string(),
    solanaPubkey: z.string(),
    type:         z.literal('routine'),
  }),
});
export type ResolveResponse = z.infer<typeof resolveResponseSchema>;

export const paymentResponseSchema = z.object({
  txSignature:      z.string().nullable(),
  amount:           z.string(),
  currency:         z.string(),
  payerWalletId:    z.string(),
  payeeWalletId:    z.string(),
  idempotencyKey:   z.string(),
  paymentRequestId: z.string(),
});
export type PaymentResponse = z.infer<typeof paymentResponseSchema>;

export type CreatePaymentRequestInput = {
  type:              'static' | 'dynamic';
  amount?:           string;
  currency?:         string;
  description?:      string;
  expiresInSeconds?: number;
};

export type ExecutePaymentInput = {
  nonce:     string;
  amount?:   string;
  currency?: string;
};
