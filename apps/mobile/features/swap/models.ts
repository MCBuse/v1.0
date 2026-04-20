import { z } from 'zod';

export const swapPreviewInput = z.object({
  fromCurrency: z.enum(['USDC', 'EURC']),
  toCurrency:   z.enum(['USDC', 'EURC']),
  fromAmount:   z.string(),
});
export type SwapPreviewInput = z.infer<typeof swapPreviewInput>;

export const swapPreviewResponse = z.object({
  fromCurrency: z.string(),
  toCurrency:   z.string(),
  fromAmount:   z.string(),
  toAmount:     z.string(),
  rate:         z.string(),
  fee:          z.string(),
  feeCurrency:  z.string(),
});
export type SwapPreviewResponse = z.infer<typeof swapPreviewResponse>;

export const swapExecuteInput = z.object({
  fromCurrency: z.enum(['USDC', 'EURC']),
  toCurrency:   z.enum(['USDC', 'EURC']),
  fromAmount:   z.string(),
});
export type SwapExecuteInput = z.infer<typeof swapExecuteInput>;

const balanceEntry = z.object({ currency: z.string(), available: z.string(), pending: z.string() });

export const swapExecuteResponse = swapPreviewResponse.extend({
  externalId: z.string(),
  status:     z.string(),
  balances:   z.record(z.string(), balanceEntry),
});
export type SwapExecuteResponse = z.infer<typeof swapExecuteResponse>;
