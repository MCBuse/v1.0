CREATE TABLE "merchant_cash_sales" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "merchant_id" uuid NOT NULL REFERENCES "merchants"("id"),
  "receipt_number" varchar(32) NOT NULL,
  "amount_minor" bigint NOT NULL,
  "description" text,
  "occurred_at" timestamp with time zone NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "status" varchar(20) DEFAULT 'recorded' NOT NULL,
  "stock_accounted_for" boolean DEFAULT false NOT NULL,
  "void_reason" text,
  "voided_at" timestamp with time zone,
  "actor_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "idempotency_key" varchar(128) NOT NULL,
  CONSTRAINT "merchant_cash_sales_amount_check" CHECK ("amount_minor" > 0),
  CONSTRAINT "merchant_cash_sales_status_check" CHECK ("status" IN ('recorded', 'voided'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_cash_sales_receipt_unique" ON "merchant_cash_sales" ("receipt_number");
--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_cash_sales_idempotency_unique" ON "merchant_cash_sales" ("merchant_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX "merchant_cash_sales_merchant_time_idx" ON "merchant_cash_sales" ("merchant_id", "occurred_at");
--> statement-breakpoint
CREATE TABLE "merchant_cash_sale_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cash_sale_id" uuid NOT NULL REFERENCES "merchant_cash_sales"("id"),
  "product_id" uuid REFERENCES "merchant_products"("id"),
  "type" varchar(20) NOT NULL,
  "name" varchar(160) NOT NULL,
  "sku" varchar(64),
  "quantity" integer NOT NULL,
  "unit_price_minor" bigint NOT NULL,
  "line_total_minor" bigint NOT NULL,
  CONSTRAINT "merchant_cash_sale_items_type_check" CHECK ("type" IN ('product', 'custom')),
  CONSTRAINT "merchant_cash_sale_items_quantity_check" CHECK ("quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX "merchant_cash_sale_items_sale_idx" ON "merchant_cash_sale_items" ("cash_sale_id");
--> statement-breakpoint
CREATE INDEX "merchant_cash_sale_items_product_idx" ON "merchant_cash_sale_items" ("product_id");
--> statement-breakpoint
CREATE TABLE "merchant_import_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "merchant_id" uuid NOT NULL REFERENCES "merchants"("id"),
  "kind" varchar(20) NOT NULL,
  "source_name" varchar(160) NOT NULL,
  "content_hash" varchar(64) NOT NULL,
  "mapping" jsonb NOT NULL,
  "rows_json" jsonb NOT NULL,
  "status" varchar(20) DEFAULT 'previewed' NOT NULL,
  "committed_at" timestamp with time zone,
  "actor_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "merchant_import_batches_kind_check" CHECK ("kind" IN ('inventory', 'settlement')),
  CONSTRAINT "merchant_import_batches_status_check" CHECK ("status" IN ('previewed', 'committed', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_import_batches_hash_unique" ON "merchant_import_batches" ("merchant_id", "kind", "content_hash");
--> statement-breakpoint
CREATE TABLE "merchant_product_source_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "merchant_id" uuid NOT NULL REFERENCES "merchants"("id"),
  "product_id" uuid NOT NULL REFERENCES "merchant_products"("id"),
  "source_name" varchar(160) NOT NULL,
  "external_id" varchar(160) NOT NULL,
  "last_snapshot_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_product_source_mappings_unique" ON "merchant_product_source_mappings" ("merchant_id", "source_name", "external_id");
--> statement-breakpoint
CREATE TABLE "merchant_payouts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "merchant_id" uuid NOT NULL REFERENCES "merchants"("id"),
  "source_name" varchar(160) NOT NULL,
  "external_reference" varchar(160) NOT NULL,
  "currency" varchar(10) NOT NULL,
  "expected_amount_minor" bigint,
  "actual_amount_minor" bigint,
  "expected_at" timestamp with time zone,
  "received_at" timestamp with time zone,
  "provider_status" varchar(20) DEFAULT 'expected' NOT NULL,
  "import_batch_id" uuid NOT NULL REFERENCES "merchant_import_batches"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_payouts_source_reference_unique" ON "merchant_payouts" ("merchant_id", "source_name", "external_reference");
--> statement-breakpoint
CREATE TABLE "merchant_payout_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "payout_id" uuid NOT NULL REFERENCES "merchant_payouts"("id"),
  "merchant_transaction_id" uuid REFERENCES "merchant_transactions"("id"),
  "payment_reference" varchar(160) NOT NULL,
  "amount_minor" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_payout_allocations_unique" ON "merchant_payout_allocations" ("payout_id", "payment_reference");
