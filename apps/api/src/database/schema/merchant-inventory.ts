import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { merchants } from './merchants';
import { paymentRequests } from './payment-requests';

export const merchantProducts = pgTable(
  'merchant_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    name: varchar('name', { length: 160 }).notNull(),
    category: varchar('category', { length: 100 }),
    sku: varchar('sku', { length: 64 }),
    description: text('description'),
    unitPriceMinor: bigint('unit_price_minor', { mode: 'bigint' }).notNull(),
    onHandQuantity: integer('on_hand_quantity').notNull().default(0),
    reservedQuantity: integer('reserved_quantity').notNull().default(0),
    lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
    imageObjectKey: text('image_object_key'),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('merchant_products_merchant_sku_unique').on(
      table.merchantId,
      table.sku,
    ),
    index('merchant_products_merchant_status_idx').on(
      table.merchantId,
      table.status,
    ),
  ],
);

export const merchantInvoiceItems = pgTable(
  'merchant_invoice_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentRequestId: uuid('payment_request_id')
      .notNull()
      .references(() => paymentRequests.id),
    productId: uuid('product_id').references(() => merchantProducts.id),
    type: varchar('type', { length: 20 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    sku: varchar('sku', { length: 64 }),
    /**
     * The product's category at the moment of sale. NULL on rows written
     * before this was captured; analytics falls back to the product's current
     * category for those and labels the fallback.
     */
    category: varchar('category', { length: 100 }),
    quantity: integer('quantity').notNull(),
    unitPriceMinor: bigint('unit_price_minor', { mode: 'bigint' }).notNull(),
    lineTotalMinor: bigint('line_total_minor', { mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('merchant_invoice_items_request_idx').on(table.paymentRequestId),
    index('merchant_invoice_items_product_idx').on(table.productId),
  ],
);
