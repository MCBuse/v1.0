import { bigint, boolean, customType, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar, integer } from 'drizzle-orm/pg-core';
import { merchants, merchantTransactions } from './merchants';
import { merchantProducts } from './merchant-inventory';
import { users } from './users';

const binary = customType<{ data: Buffer; driverData: Buffer }>({ dataType() { return 'bytea'; } });

export const merchantCashSales = pgTable('merchant_cash_sales', {
  id: uuid('id').primaryKey().defaultRandom(), merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
  receiptNumber: varchar('receipt_number', { length: 32 }).notNull(), amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(), description: text('description'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(), recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  status: varchar('status', { length: 20 }).notNull().default('recorded'), stockAccountedFor: boolean('stock_accounted_for').notNull().default(false),
  voidReason: text('void_reason'), voidedAt: timestamp('voided_at', { withTimezone: true }), actorUserId: uuid('actor_user_id').notNull().references(() => users.id), idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(), inputFingerprint: varchar('input_fingerprint', { length: 64 }),
}, (table) => [uniqueIndex('merchant_cash_sales_receipt_unique').on(table.receiptNumber), uniqueIndex('merchant_cash_sales_idempotency_unique').on(table.merchantId, table.idempotencyKey), index('merchant_cash_sales_merchant_time_idx').on(table.merchantId, table.occurredAt)]);

export const merchantCashSaleItems = pgTable('merchant_cash_sale_items', {
  id: uuid('id').primaryKey().defaultRandom(), cashSaleId: uuid('cash_sale_id').notNull().references(() => merchantCashSales.id), productId: uuid('product_id').references(() => merchantProducts.id),
  type: varchar('type', { length: 20 }).notNull(), name: varchar('name', { length: 160 }).notNull(), sku: varchar('sku', { length: 64 }),
  /** The product's category at the moment of sale; NULL on pre-capture rows. */
  category: varchar('category', { length: 100 }),
  quantity: integer('quantity').notNull(), unitPriceMinor: bigint('unit_price_minor', { mode: 'bigint' }).notNull(), lineTotalMinor: bigint('line_total_minor', { mode: 'bigint' }).notNull(),
}, (table) => [index('merchant_cash_sale_items_sale_idx').on(table.cashSaleId), index('merchant_cash_sale_items_product_idx').on(table.productId)]);

/** Append-only quantity changes captured after the merchant workspace upgrade. */
export const merchantStockMovements = pgTable('merchant_stock_movements', {
  id: uuid('id').primaryKey().defaultRandom(), merchantId: uuid('merchant_id').notNull().references(() => merchants.id), productId: uuid('product_id').notNull().references(() => merchantProducts.id),
  kind: varchar('kind', { length: 32 }).notNull(), onHandChange: integer('on_hand_change').notNull().default(0), reservedChange: integer('reserved_change').notNull().default(0),
  referenceType: varchar('reference_type', { length: 48 }), referenceId: uuid('reference_id'), occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(), metadata: jsonb('metadata'),
}, (table) => [index('merchant_stock_movements_product_time_idx').on(table.productId, table.occurredAt), index('merchant_stock_movements_merchant_time_idx').on(table.merchantId, table.occurredAt)]);

export const merchantCashSaleAttachments = pgTable('merchant_cash_sale_attachments', {
  id: uuid('id').primaryKey().defaultRandom(), merchantId: uuid('merchant_id').notNull().references(() => merchants.id), cashSaleId: uuid('cash_sale_id').notNull().references(() => merchantCashSales.id),
  objectKey: text('object_key').notNull(), originalName: varchar('original_name', { length: 255 }).notNull(), contentType: varchar('content_type', { length: 100 }).notNull(), byteSize: integer('byte_size').notNull(), actorUserId: uuid('actor_user_id').notNull().references(() => users.id), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('merchant_cash_sale_attachments_sale_unique').on(table.cashSaleId), index('merchant_cash_sale_attachments_merchant_idx').on(table.merchantId)]);

export const merchantImportBatches = pgTable('merchant_import_batches', {
  id: uuid('id').primaryKey().defaultRandom(), merchantId: uuid('merchant_id').notNull().references(() => merchants.id), kind: varchar('kind', { length: 20 }).notNull(), sourceName: varchar('source_name', { length: 160 }).notNull(), contentHash: varchar('content_hash', { length: 64 }).notNull(), mapping: jsonb('mapping').notNull(), rowsJson: jsonb('rows_json').notNull(), status: varchar('status', { length: 20 }).notNull().default('previewed'), committedAt: timestamp('committed_at', { withTimezone: true }), actorUserId: uuid('actor_user_id').notNull().references(() => users.id), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('merchant_import_batches_hash_unique').on(table.merchantId, table.kind, table.contentHash)]);

export const merchantProductSourceMappings = pgTable('merchant_product_source_mappings', {
  id: uuid('id').primaryKey().defaultRandom(), merchantId: uuid('merchant_id').notNull().references(() => merchants.id), productId: uuid('product_id').notNull().references(() => merchantProducts.id), sourceName: varchar('source_name', { length: 160 }).notNull(), externalId: varchar('external_id', { length: 160 }).notNull(), lastSnapshotAt: timestamp('last_snapshot_at', { withTimezone: true }), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('merchant_product_source_mappings_unique').on(table.merchantId, table.sourceName, table.externalId)]);

export const merchantPayouts = pgTable('merchant_payouts', {
  id: uuid('id').primaryKey().defaultRandom(), merchantId: uuid('merchant_id').notNull().references(() => merchants.id), sourceName: varchar('source_name', { length: 160 }).notNull(), externalReference: varchar('external_reference', { length: 160 }).notNull(), currency: varchar('currency', { length: 10 }).notNull(), expectedAmountMinor: bigint('expected_amount_minor', { mode: 'bigint' }), actualAmountMinor: bigint('actual_amount_minor', { mode: 'bigint' }), expectedAt: timestamp('expected_at', { withTimezone: true }), receivedAt: timestamp('received_at', { withTimezone: true }), providerStatus: varchar('provider_status', { length: 20 }).notNull().default('expected'), importBatchId: uuid('import_batch_id').notNull().references(() => merchantImportBatches.id), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('merchant_payouts_source_reference_unique').on(table.merchantId, table.sourceName, table.externalReference)]);

export const merchantPayoutAllocations = pgTable('merchant_payout_allocations', { id: uuid('id').primaryKey().defaultRandom(), payoutId: uuid('payout_id').notNull().references(() => merchantPayouts.id), merchantTransactionId: uuid('merchant_transaction_id').references(() => merchantTransactions.id), paymentReference: varchar('payment_reference', { length: 160 }).notNull(), amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow() }, (table) => [uniqueIndex('merchant_payout_allocations_unique').on(table.payoutId, table.paymentReference)]);

export const merchantFinancePackages = pgTable('merchant_finance_packages', { id: uuid('id').primaryKey().defaultRandom(), merchantId: uuid('merchant_id').notNull().references(() => merchants.id), modelVersion: varchar('model_version', { length: 64 }).notNull(), periodFrom: timestamp('period_from', { withTimezone: true }).notNull(), periodTo: timestamp('period_to', { withTimezone: true }).notNull(), snapshot: jsonb('snapshot').notNull(), actorUserId: uuid('actor_user_id').notNull().references(() => users.id), idempotencyKey: varchar('idempotency_key', { length: 128 }), inputFingerprint: varchar('input_fingerprint', { length: 64 }), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow() }, (table) => [index('merchant_finance_packages_merchant_idx').on(table.merchantId, table.createdAt), uniqueIndex('merchant_finance_packages_idempotency_unique').on(table.merchantId, table.idempotencyKey)]);
export const merchantFinancePackageArtifacts = pgTable('merchant_finance_package_artifacts', { id: uuid('id').primaryKey().defaultRandom(), packageId: uuid('package_id').notNull().references(() => merchantFinancePackages.id), kind: varchar('kind', { length: 12 }).notNull(), content: binary('content').notNull(), byteSize: integer('byte_size').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow() }, (table) => [uniqueIndex('merchant_finance_package_artifacts_unique').on(table.packageId, table.kind)]);
export const merchantFinanceEmailAttempts = pgTable('merchant_finance_email_attempts', { id: uuid('id').primaryKey().defaultRandom(), merchantId: uuid('merchant_id').notNull().references(() => merchants.id), packageId: uuid('package_id').notNull().references(() => merchantFinancePackages.id), recipientEmail: varchar('recipient_email', { length: 320 }).notNull(), institutionName: varchar('institution_name', { length: 160 }), idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(), inputFingerprint: varchar('input_fingerprint', { length: 64 }), status: varchar('status', { length: 32 }).notNull().default('sending'), errorCode: varchar('error_code', { length: 80 }), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow() }, (table) => [uniqueIndex('merchant_finance_email_attempts_idempotency_unique').on(table.merchantId, table.idempotencyKey)]);
