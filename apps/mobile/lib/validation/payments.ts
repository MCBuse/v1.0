import { z } from 'zod';

export const amountSchema = z.object({
  amount: z
    .string()
    .min(1, 'Amount required')
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, 'Enter a valid amount')
    .refine((v) => parseFloat(v) >= 1, 'Minimum amount is 1')
    .refine((v) => parseFloat(v) <= 10000, 'Maximum amount is 10,000'),
  currency: z.enum(['USDC', 'EURC']),
});

export type AmountFormValues = z.infer<typeof amountSchema>;
