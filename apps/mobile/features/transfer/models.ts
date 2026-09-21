import { z } from 'zod';

export const transferInput = z.object({
  fromWalletType: z.enum(['savings', 'routine']),
  toWalletType:   z.enum(['savings', 'routine']),
  amount:         z.string(),
  currency:       z.enum(['USDC', 'EURC']),
  /**
   * Stable for every retry of one intent. The server replays the original
   * transfer rather than moving the money a second time.
   */
  idempotencyKey: z.string().min(1),
});
export type TransferInput = z.infer<typeof transferInput>;

export const transferResponse = z.object({
  operationId: z.string(),
  status: z.string(),
  from:           z.string(),
  to:             z.string(),
  currency:       z.string(),
  amount:         z.string(),
  idempotencyKey: z.string(),
  /** True when the server answered from the original transfer, not a new one. */
  replayed:       z.boolean().optional(),
});
export type TransferResponse = z.infer<typeof transferResponse>;
