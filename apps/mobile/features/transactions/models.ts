import { z } from 'zod';

export const ledgerEntry = z.object({
  id:                z.string().uuid(),
  debitWalletId:     z.string().uuid(),
  creditWalletId:    z.string().uuid(),
  amount:            z.string(),
  currency:          z.string(),
  type:              z.enum(['on_ramp', 'off_ramp', 'p2p', 'swap', 'internal']),
  status:            z.enum(['pending', 'completed', 'failed']),
  solanaTxSignature: z.string().nullable().optional(),
  paymentRequestId:  z.string().nullable().optional(),
  idempotencyKey:    z.string().nullable().optional(),
  metadata:          z.unknown().nullable().optional(),
  createdAt:         z.string(),
});
export type LedgerEntry = z.infer<typeof ledgerEntry>;

export const transactionListResponse = z.object({
  data:   z.array(ledgerEntry),
  limit:  z.number(),
  offset: z.number(),
});
export type TransactionListResponse = z.infer<typeof transactionListResponse>;

export type TransactionQuery = {
  walletType?: 'savings' | 'routine';
  currency?:   'USDC' | 'EURC';
  type?:       LedgerEntry['type'];
  limit?:      number;
  offset?:     number;
};
