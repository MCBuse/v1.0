import { z } from "zod";

// ── Line items ────────────────────────────────────────────────────────────────

export const lineItem = z.object({
  name: z.string().min(1).max(60),
  quantity: z.number().int().min(1).max(999),
  unitAmount: z.string().regex(/^\d+$/), // base units (6 decimals)
});
export type LineItem = z.infer<typeof lineItem>;

// ── Requests ──────────────────────────────────────────────────────────────────

export const createPaymentRequestInput = z.object({
  type: z.enum(["static", "dynamic"]),
  amount: z.string().optional(),
  currency: z.enum(["USDC", "EURC"]).optional(),
  description: z.string().max(100).optional(),
  lineItems: lineItem.array().min(1).max(50).optional(),
  expiresInSeconds: z.number().optional(),
});
export type CreatePaymentRequestInput = z.infer<
  typeof createPaymentRequestInput
>;

export const executePaymentInput = z.object({
  nonce: z.string(),
  idempotencyKey: z.string().uuid(),
  amount: z.string().optional(),
  currency: z.enum(["USDC", "EURC"]).optional(),
});
export type ExecutePaymentInput = z.infer<typeof executePaymentInput>;

export const cancelPaymentRequestResponse = z.object({
  id: z.string(),
  status: z.literal("cancelled"),
});
export type CancelPaymentRequestResponse = z.infer<
  typeof cancelPaymentRequestResponse
>;

export const executeUsernamePaymentInput = z.object({
  username: z.string(),
  amount: z.string(),
  currency: z.enum(["USDC", "EURC"]),
});
export type ExecuteUsernamePaymentInput = z.infer<
  typeof executeUsernamePaymentInput
>;

export const onRampInput = z.object({
  amount: z.string(),
  currency: z.enum(["USDC", "EURC"]),
});
export type OnRampInput = z.infer<typeof onRampInput>;

// ── Responses ─────────────────────────────────────────────────────────────────

export const paymentRequest = z.object({
  id: z.string(),
  type: z.enum(["static", "dynamic"]),
  amount: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  lineItems: lineItem.array().nullable().optional(),
  nonce: z.string(),
  status: z.string(),
  expiresAt: z.string().nullable().optional(),
  createdAt: z.string(),
  qrString: z.string().optional(),
});
export type PaymentRequest = z.infer<typeof paymentRequest>;

export const resolveResponse = paymentRequest.extend({
  creatorWallet: z.object({
    id: z.string(),
    solanaPubkey: z.string(),
    type: z.literal("routine"),
  }),
  recipient: z.object({
    username: z.string(),
    displayName: z.string(),
    businessName: z.string().nullable().optional(),
  }),
});
export type ResolveResponse = z.infer<typeof resolveResponse>;

export const executePaymentResponse = z.object({
  txSignature: z.string().nullable(),
  amount: z.string(),
  currency: z.string(),
  payerWalletId: z.string(),
  payeeWalletId: z.string(),
  idempotencyKey: z.string(),
  paymentRequestId: z.string().optional(),
  recipient: z
    .object({
      username: z.string(),
      displayName: z.string(),
    })
    .optional(),
});
export type ExecutePaymentResponse = z.infer<typeof executePaymentResponse>;

export const onRampResponse = z.object({
  externalId: z.string(),
  status: z.enum(["completed", "pending"]),
  amount: z.string(),
  currency: z.string(),
  balance: z.object({
    currency: z.enum(["USDC", "EURC"]),
    available: z.string(),
    pending: z.string(),
  }),
});
export type OnRampResponse = z.infer<typeof onRampResponse>;
