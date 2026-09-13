CREATE TABLE "merchant_products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "merchant_id" uuid NOT NULL REFERENCES "merchants"("id"),
  "name" varchar(160) NOT NULL,
  "sku" varchar(64),
  "description" text,
  "unit_price_minor" bigint NOT NULL,
  "on_hand_quantity" integer DEFAULT 0 NOT NULL,
  "reserved_quantity" integer DEFAULT 0 NOT NULL,
  "low_stock_threshold" integer DEFAULT 5 NOT NULL,
  "image_object_key" text,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "merchant_products_price_check" CHECK ("unit_price_minor" > 0),
  CONSTRAINT "merchant_products_quantity_check" CHECK ("on_hand_quantity" >= 0 AND "reserved_quantity" >= 0 AND "on_hand_quantity" >= "reserved_quantity"),
  CONSTRAINT "merchant_products_threshold_check" CHECK ("low_stock_threshold" >= 0),
  CONSTRAINT "merchant_products_status_check" CHECK ("status" IN ('active', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_products_merchant_sku_unique" ON "merchant_products" ("merchant_id", "sku");
--> statement-breakpoint
CREATE INDEX "merchant_products_merchant_status_idx" ON "merchant_products" ("merchant_id", "status");
--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "invoice_number" varchar(32);
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_requests_invoice_number_unique" ON "payment_requests" ("invoice_number") WHERE "invoice_number" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE "merchant_invoice_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "payment_request_id" uuid NOT NULL REFERENCES "payment_requests"("id"),
  "product_id" uuid REFERENCES "merchant_products"("id"),
  "type" varchar(20) NOT NULL,
  "name" varchar(160) NOT NULL,
  "sku" varchar(64),
  "quantity" integer NOT NULL,
  "unit_price_minor" bigint NOT NULL,
  "line_total_minor" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "merchant_invoice_items_type_check" CHECK ("type" IN ('product', 'custom')),
  CONSTRAINT "merchant_invoice_items_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "merchant_invoice_items_price_check" CHECK ("unit_price_minor" > 0 AND "line_total_minor" > 0)
);
--> statement-breakpoint
CREATE INDEX "merchant_invoice_items_request_idx" ON "merchant_invoice_items" ("payment_request_id");
--> statement-breakpoint
CREATE INDEX "merchant_invoice_items_product_idx" ON "merchant_invoice_items" ("product_id");
