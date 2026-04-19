import { z } from 'zod';

export const balanceSchema = z.object({
  currency: z.enum(['USDC', 'EURC']),
  available: z.string(),
  pending:   z.string(),
});
export type Balance = z.infer<typeof balanceSchema>;

export const walletSchema = z.object({
  id:          z.string(),
  type:        z.enum(['savings', 'routine']),
  solanaPubkey: z.string(),
  isActive:    z.boolean(),
  createdAt:   z.string(),
  balances:    z.array(balanceSchema),
});
export type Wallet = z.infer<typeof walletSchema>;

export const walletsResponseSchema = z.object({
  savings: walletSchema,
  routine: walletSchema,
});
export type WalletsResponse = z.infer<typeof walletsResponseSchema>;
