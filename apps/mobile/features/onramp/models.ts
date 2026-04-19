import { z } from 'zod';

import { balanceSchema } from '../wallets/models';

export const onrampResponseSchema = z.object({
  externalId: z.string(),
  status:     z.enum(['completed', 'pending']),
  amount:     z.string(),
  currency:   z.string(),
  balance:    balanceSchema,
});
export type OnrampResponse = z.infer<typeof onrampResponseSchema>;

export type OnrampInput = {
  amount:   string;
  currency: 'USDC' | 'EURC';
};
