import { z } from 'zod';

export const onrampProviderSchema = z.enum(['stripe', 'moonpay']);
export type OnrampProvider = z.infer<typeof onrampProviderSchema>;

export const createOnrampSessionResponseSchema = z.object({
  provider: onrampProviderSchema.default('moonpay'),
  widgetUrl: z.string().min(1),
  transactionId: z.string().uuid(),
  internalReference: z.string().uuid(),
});

export type CreateOnrampSessionResponse = z.infer<typeof createOnrampSessionResponseSchema>;

export const onrampTransactionStatusSchema = z.object({
  id: z.string().uuid(),
  provider: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled', 'expired', 'refunded', 'refund_pending', 'refund_action_required']),
  fiatAmount: z.string().nullable(),
  fiatCurrency: z.string(),
  cryptoAmount: z.string().nullable(),
  cryptoCurrency: z.string(),
  network: z.string(),
  walletAddress: z.string(),
  txHash: z.string().nullable(),
  createdAt: z.coerce.string(),
  updatedAt: z.coerce.string(),
});

export type OnrampTransactionStatus = z.infer<typeof onrampTransactionStatusSchema>;

export const onrampTransactionListSchema = z.object({
  data: z.array(onrampTransactionStatusSchema),
  limit: z.number(),
});

export type OnrampTransactionList = z.infer<typeof onrampTransactionListSchema>;

export type CreateOnrampSessionInput = {
  provider?: OnrampProvider;
  method?: 'card' | 'bank';
  fiatAmount: string;
  fiatCurrency: 'USD' | 'EUR';
};
