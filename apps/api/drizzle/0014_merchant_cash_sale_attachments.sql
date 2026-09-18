CREATE TABLE "merchant_cash_sale_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "merchant_id" uuid NOT NULL REFERENCES "merchants"("id"),
  "cash_sale_id" uuid NOT NULL REFERENCES "merchant_cash_sales"("id"),
  "object_key" text NOT NULL,
  "original_name" varchar(255) NOT NULL,
  "content_type" varchar(100) NOT NULL,
  "byte_size" integer NOT NULL,
  "actor_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "merchant_cash_sale_attachments_size_check" CHECK ("byte_size" > 0 AND "byte_size" <= 5242880)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_cash_sale_attachments_sale_unique" ON "merchant_cash_sale_attachments" ("cash_sale_id");
--> statement-breakpoint
CREATE INDEX "merchant_cash_sale_attachments_merchant_idx" ON "merchant_cash_sale_attachments" ("merchant_id");
