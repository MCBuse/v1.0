import { z } from 'zod';

export const merchantEventType = z.enum([
  'request_presented',
  'request_status_changed',
  'request_cleared',
]);
export type MerchantEventType = z.infer<typeof merchantEventType>;

export const merchantEvent = z.object({
  sequence: z.string(),
  merchantId: z.string(),
  type: merchantEventType,
  paymentRequestId: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type MerchantEvent = z.infer<typeof merchantEvent>;

export const presentedRequest = z.object({
  paymentRequestId: z.string(),
  nonce: z.string(),
  status: z.string(),
  displayAmountMinor: z.string().nullable(),
  displayCurrency: z.string(),
  settlementAmount: z.string().nullable(),
  settlementCurrency: z.string().nullable(),
  description: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  expiresAt: z.string().nullable(),
  presentedAt: z.string(),
  presentedByUserId: z.string(),
  lines: z
    .object({
      name: z.string(),
      quantity: z.number().int(),
      unitPriceMinor: z.string(),
      lineTotalMinor: z.string(),
    })
    .array(),
});
export type PresentedRequest = z.infer<typeof presentedRequest>;

export const presentedRequestResponse = z.object({
  request: presentedRequest.nullable(),
  latestSequence: z.string().nullable(),
});

export const merchantEventsPage = z.object({
  events: merchantEvent.array(),
  latestSequence: z.string().nullable(),
});

/**
 * What the device tells the person about its own connection.
 *
 * `polling` is a named state rather than a silent degradation: a counter
 * device that is seconds behind should say so.
 */
export type LiveConnectionStatus =
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'polling'
  | 'offline';
