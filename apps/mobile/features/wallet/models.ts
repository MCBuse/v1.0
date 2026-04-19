import { z } from 'zod';

export const walletBalance = z.object({
  currency: z.enum(['USDC', 'EURC']),
  available: z.string(),
  pending: z.string(),
});
export type WalletBalance = z.infer<typeof walletBalance>;

export const walletDetail = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: z.enum(['savings', 'routine']),
  solanaPubkey: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  balances: z.array(walletBalance),
});
export type WalletDetail = z.infer<typeof walletDetail>;

// GET /wallets returns { savings?: WalletDetail, routine?: WalletDetail }
export const walletMapResponse = z.object({
  savings: walletDetail.optional(),
  routine: walletDetail.optional(),
});
export type WalletMapResponse = z.infer<typeof walletMapResponse>;
