import { z } from 'zod';

const moneyValue = z.object({
  minor: z.string(),
  currency: z.literal('EUR'),
  estimated: z.boolean(),
  rateTimestamp: z.string().nullable(),
});

export const merchantProfile = z.object({
  id: z.string(),
  businessName: z.string(),
  timezone: z.string(),
  displayCurrency: z.literal('EUR'),
  role: z.literal('owner'),
});
export type MerchantProfile = z.infer<typeof merchantProfile>;

export const merchantProduct = z.object({
  id: z.string(),
  name: z.string(),
  sku: z.string().nullable(),
  description: z.string().nullable(),
  unitPrice: moneyValue,
  onHandQuantity: z.number().int(),
  reservedQuantity: z.number().int(),
  availableQuantity: z.number().int(),
  lowStockThreshold: z.number().int(),
  lowStock: z.boolean(),
  imageUrl: z.string().nullable(),
  status: z.enum(['active', 'archived']),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MerchantProduct = z.infer<typeof merchantProduct>;

export const merchantProductPage = z.object({
  items: merchantProduct.array(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalItems: z.number().int(),
  totalPages: z.number().int(),
});

export const merchantInvoiceLine = z.object({
  id: z.string(),
  type: z.enum(['product', 'custom']),
  productId: z.string().nullable(),
  name: z.string(),
  sku: z.string().nullable(),
  quantity: z.number().int(),
  unitPrice: moneyValue,
  lineTotal: moneyValue,
});
export type MerchantInvoiceLine = z.infer<typeof merchantInvoiceLine>;

export const merchantInvoice = z.object({
  id: z.string(),
  invoiceNumber: z.string(),
  description: z.string().nullable(),
  lines: merchantInvoiceLine.array(),
  amount: moneyValue,
  status: z.enum(['pending', 'processing', 'completed', 'expired', 'cancelled', 'failed']),
  expiresAt: z.string(),
  qrPayload: z.string(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type MerchantInvoice = z.infer<typeof merchantInvoice>;

export const merchantInvoicePage = z.object({
  items: merchantInvoice.array(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalItems: z.number().int(),
  totalPages: z.number().int(),
});

const productLineInput = z.object({ type: z.literal('product'), productId: z.string(), quantity: z.number().int().min(1).max(999) });
const customLineInput = z.object({ type: z.literal('custom'), name: z.string().min(1).max(160), quantity: z.number().int().min(1).max(999), unitPriceMinor: z.string().regex(/^[1-9]\d{0,8}$/) });
export const createMerchantInvoiceInput = z.object({
  lines: z.union([productLineInput, customLineInput]).array().min(1).max(50),
  description: z.string().max(140).optional(),
  expiresInSeconds: z.union([z.literal(900), z.literal(3600), z.literal(86400)]).optional(),
});
export type CreateMerchantInvoiceInput = z.infer<typeof createMerchantInvoiceInput>;
