ALTER TABLE "merchant_finance_packages"
  ADD COLUMN "idempotency_key" varchar(128),
  ADD COLUMN "input_fingerprint" varchar(64);
--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_finance_packages_idempotency_unique"
  ON "merchant_finance_packages" ("merchant_id", "idempotency_key");
