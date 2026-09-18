CREATE TABLE "merchant_stock_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "merchant_id" uuid NOT NULL REFERENCES "merchants"("id"),
  "product_id" uuid NOT NULL REFERENCES "merchant_products"("id"),
  "kind" varchar(32) NOT NULL,
  "on_hand_change" integer DEFAULT 0 NOT NULL,
  "reserved_change" integer DEFAULT 0 NOT NULL,
  "reference_type" varchar(48),
  "reference_id" uuid,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "metadata" jsonb
);
--> statement-breakpoint
-- This is deliberately an opening balance at upgrade time, not a claim about historical movements.
INSERT INTO "merchant_stock_movements" ("merchant_id", "product_id", "kind", "on_hand_change", "reserved_change", "reference_type", "reference_id", "metadata")
SELECT "merchant_id", "id", 'opening_balance', "on_hand_quantity", "reserved_quantity", 'migration', NULL, '{"source":"workspace_upgrade"}'::jsonb
FROM "merchant_products";
--> statement-breakpoint
CREATE INDEX "merchant_stock_movements_product_time_idx" ON "merchant_stock_movements" ("product_id", "occurred_at");
--> statement-breakpoint
CREATE INDEX "merchant_stock_movements_merchant_time_idx" ON "merchant_stock_movements" ("merchant_id", "occurred_at");
