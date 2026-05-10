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

export const offrampProviderSchema = z.enum(['stripe', 'moonpay']);
export type OfframpProvider = z.infer<typeof offrampProviderSchema>;

export const moonpayOfframpParamsSchema = z.object({
  apiKey: z.string().min(1),
  baseCurrencyCode: z.string().min(1),
  baseCurrencyAmount: z.string().min(1),
  lockAmount: z.string().optional(),
  quoteCurrencyCode: z.string().min(1),
  refundWalletAddress: z.string().min(1),
  externalTransactionId: z.string().min(1),
  externalCustomerId: z.string().min(1),
});
export type MoonpayOfframpParams = z.infer<typeof moonpayOfframpParamsSchema>;

export const moonpayOfframpSessionResponseSchema = z.object({
  transactionId:     z.string().uuid(),
  internalReference: z.string().uuid(),
  provider:          z.literal('moonpay'),
  environment:       z.enum(['sandbox', 'production']),
  params:            moonpayOfframpParamsSchema,
});
export type MoonpayOfframpSessionResponse = z.infer<typeof moonpayOfframpSessionResponseSchema>;

export const stripeOfframpSessionResponseSchema = z.object({
  transactionId:     z.string().uuid(),
  internalReference: z.string().uuid(),
  provider:          z.literal('stripe'),
  stripePayoutId:    z.string().min(1),
  stripeTransferId:  z.string().min(1),
  depositTxHash:     z.string().min(1),
  fiatAmount:        z.string(),
  fiatCurrency:      z.string(),
  status:            z.string(),
});
export type StripeOfframpSessionResponse = z.infer<typeof stripeOfframpSessionResponseSchema>;

export const createOfframpSessionResponseSchema = z.union([
  moonpayOfframpSessionResponseSchema,
  stripeOfframpSessionResponseSchema,
]);
export type CreateOfframpSessionResponse = z.infer<typeof createOfframpSessionResponseSchema>;

export type CreateOfframpSessionInput = {
  provider?: OfframpProvider;
  cryptoAmount: string;
  cryptoCurrency?: 'USDC';
  fiatCurrency?: 'USD' | 'EUR';
};

export const stripeAccountStatusSchema = z.object({
  accountId:        z.string().nullable(),
  payoutsEnabled:   z.boolean(),
  detailsSubmitted: z.boolean(),
  requirementsDue:  z.array(z.string()),
});
export type StripeAccountStatus = z.infer<typeof stripeAccountStatusSchema>;

export const stripeOnboardingLinkSchema = z.object({
  url:       z.string().min(1),
  expiresAt: z.number(),
});
export type StripeOnboardingLink = z.infer<typeof stripeOnboardingLinkSchema>;

export const signOfframpUrlResponseSchema = z.object({
  signature: z.string().min(1),
});
export type SignOfframpUrlResponse = z.infer<typeof signOfframpUrlResponseSchema>;

export const initiateMoonpayDepositResponseSchema = z.object({
  depositId: z.string().min(1),
});
export type InitiateMoonpayDepositResponse = z.infer<typeof initiateMoonpayDepositResponseSchema>;

export type InitiateMoonpayDepositInput = {
  transactionId: string;
  cryptoCurrencyCode: string;
  cryptoCurrencyAmount: string;
  cryptoCurrencyAmountSmallestDenomination: string;
  depositWalletAddress: string;
  depositWalletAddressTag?: string | null;
  fiatCurrencyCode?: string;
  fiatCurrencyAmount?: string | null;
};

export const offrampTransactionStatusSchema = z.object({
  id:                      z.string().uuid(),
  provider:                z.string(),
  status:                  z.enum([
    'pending',
    'waiting_for_deposit',
    'deposit_submitted',
    'processing',
    'completed',
    'failed',
    'cancelled',
    'requote_required',
    'refund_pending',
  ]),
  cryptoAmount:            z.string(),
  cryptoCurrency:          z.string(),
  fiatAmount:              z.string().nullable(),
  fiatCurrency:            z.string(),
  network:                 z.string(),
  refundWalletAddress:     z.string(),
  depositWalletAddress:    z.string().nullable(),
  depositWalletAddressTag: z.string().nullable(),
  depositTxHash:           z.string().nullable(),
  refundTxHash:            z.string().nullable(),
  trackerUrl:              z.string().nullable(),
  stripeTransferId:        z.string().nullable().optional(),
  stripePayoutId:          z.string().nullable().optional(),
  createdAt:               z.coerce.string(),
  updatedAt:               z.coerce.string(),
});
export type OfframpTransactionStatus = z.infer<typeof offrampTransactionStatusSchema>;

export const offrampTransactionListSchema = z.object({
  data:  z.array(offrampTransactionStatusSchema),
  limit: z.number(),
});
export type OfframpTransactionList = z.infer<typeof offrampTransactionListSchema>;
