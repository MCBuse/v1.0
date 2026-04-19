import { z } from 'zod';

export const transactionSchema = z.object({
  id:                  z.string(),
  debitWalletId:       z.string(),
  creditWalletId:      z.string(),
  amount:              z.string(),
  currency:            z.string(),
  type:                z.enum(['p2p', 'on_ramp', 'off_ramp', 'internal', 'swap']),
  status:              z.enum(['pending', 'completed', 'failed']),
  solanaTxSignature:   z.string().nullable(),
  paymentRequestId:    z.string().nullable(),
  idempotencyKey:      z.string().nullable(),
  metadata:            z.record(z.unknown()).nullable().optional(),
  createdAt:           z.string(),
});
export type Transaction = z.infer<typeof transactionSchema>;

export const transactionListResponseSchema = z.object({
  data:   z.array(transactionSchema),
  limit:  z.number(),
  offset: z.number(),
});
export type TransactionListResponse = z.infer<typeof transactionListResponseSchema>;

export type TransactionListParams = {
  walletType?: 'savings' | 'routine';
  currency?:   'USDC' | 'EURC';
  type?:       Transaction['type'];
  limit?:      number;
  offset?:     number;
};
