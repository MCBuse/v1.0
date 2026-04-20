import { z } from 'zod';

import { balanceSchema } from '../wallets/models';

export const offrampInput = z.object({
  amount:         z.string(),
  currency:       z.enum(['USDC', 'EURC']),
  bankAccountRef: z.string().optional(),
});
export type OfframpInput = z.infer<typeof offrampInput>;

export const offrampResponse = z.object({
  externalId:          z.string(),
  status:              z.enum(['completed', 'pending', 'failed']),
  amount:              z.string(),
  currency:            z.string(),
  estimatedSettlement: z.string().nullable(),
  balance:             balanceSchema,
});
export type OfframpResponse = z.infer<typeof offrampResponse>;
