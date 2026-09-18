CREATE TABLE "merchant_finance_packages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "merchant_id" uuid NOT NULL REFERENCES "merchants"("id"),
  "model_version" varchar(64) NOT NULL,
  "period_from" timestamp with time zone NOT NULL,
  "period_to" timestamp with time zone NOT NULL,
  "snapshot" jsonb NOT NULL,
  "actor_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "merchant_finance_packages_merchant_idx" ON "merchant_finance_packages" ("merchant_id", "created_at");
--> statement-breakpoint
CREATE TABLE "merchant_finance_email_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "merchant_id" uuid NOT NULL REFERENCES "merchants"("id"),
  "package_id" uuid NOT NULL REFERENCES "merchant_finance_packages"("id"),
  "recipient_email" varchar(320) NOT NULL,
  "institution_name" varchar(160),
  "idempotency_key" varchar(128) NOT NULL,
  "status" varchar(32) DEFAULT 'sending' NOT NULL,
  "error_code" varchar(80),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_finance_email_attempts_idempotency_unique" ON "merchant_finance_email_attempts" ("merchant_id", "idempotency_key");
