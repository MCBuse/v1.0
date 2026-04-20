import { z } from 'zod';

export const transferInput = z.object({
  fromWalletType: z.enum(['savings', 'routine']),
  toWalletType:   z.enum(['savings', 'routine']),
  amount:         z.string(),
  currency:       z.enum(['USDC', 'EURC']),
});
export type TransferInput = z.infer<typeof transferInput>;

export const transferResponse = z.object({
  from:           z.string(),
  to:             z.string(),
  currency:       z.string(),
  amount:         z.string(),
  idempotencyKey: z.string(),
});
export type TransferResponse = z.infer<typeof transferResponse>;
