CREATE TABLE IF NOT EXISTS "merchants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "public_id" varchar(32) NOT NULL,
  "business_name" varchar(160) NOT NULL,
  "timezone" varchar(64) DEFAULT 'Europe/Berlin' NOT NULL,
  "display_currency" varchar(3) DEFAULT 'EUR' NOT NULL,
  "receiving_wallet_id" uuid NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "merchants_receiving_wallet_id_wallets_id_fk" FOREIGN KEY ("receiving_wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "merchants_display_currency_check" CHECK ("display_currency" = 'EUR')
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "merchants_public_id_unique" ON "merchants" USING btree ("public_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "merchants_receiving_wallet_unique" ON "merchants" USING btree ("receiving_wallet_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "merchant_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "merchant_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" varchar(20) DEFAULT 'owner' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "merchant_memberships_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "merchant_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "merchant_memberships_owner_role_check" CHECK ("role" = 'owner')
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "merchant_memberships_merchant_user_unique" ON "merchant_memberships" USING btree ("merchant_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merchant_memberships_user_idx" ON "merchant_memberships" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "merchant_consent_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "merchant_id" uuid NOT NULL,
  "actor_user_id" uuid NOT NULL,
  "purpose" varchar(80) NOT NULL,
  "version" varchar(32) NOT NULL,
  "action" varchar(12) NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "merchant_consent_records_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "merchant_consent_records_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "merchant_consent_records_action_check" CHECK ("action" IN ('granted', 'revoked'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merchant_consent_records_merchant_time_idx" ON "merchant_consent_records" USING btree ("merchant_id", "recorded_at");
--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "merchant_id" uuid;
--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "display_amount_minor" bigint;
--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "display_currency" varchar(3);
--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "quote_rate_scaled" bigint;
--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "quoted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "processing_at" timestamp with time zone;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_requests_merchant_status_idx" ON "payment_requests" USING btree ("merchant_id", "status", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "merchant_payment_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "payment_request_id" uuid NOT NULL,
  "payer_user_id" uuid NOT NULL,
  "idempotency_key" varchar(128) NOT NULL,
  "status" varchar(20) DEFAULT 'processing' NOT NULL,
  "submitted_signature" text,
  "error_code" varchar(80),
  "claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "submitted_at" timestamp with time zone,
  "finalized_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "merchant_payment_attempts_payment_request_id_payment_requests_id_fk" FOREIGN KEY ("payment_request_id") REFERENCES "public"."payment_requests"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "merchant_payment_attempts_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "merchant_payment_attempts_status_check" CHECK ("status" IN ('processing', 'submitted', 'finalized', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "merchant_payment_attempts_request_unique" ON "merchant_payment_attempts" USING btree ("payment_request_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "merchant_payment_attempts_idempotency_unique" ON "merchant_payment_attempts" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merchant_payment_attempts_status_idx" ON "merchant_payment_attempts" USING btree ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "merchant_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "receipt_number" varchar(32) NOT NULL,
  "merchant_id" uuid NOT NULL,
  "payment_request_id" uuid NOT NULL,
  "ledger_entry_id" uuid NOT NULL,
  "display_amount_minor" bigint NOT NULL,
  "display_currency" varchar(3) DEFAULT 'EUR' NOT NULL,
  "settlement_amount" bigint NOT NULL,
  "settlement_currency" varchar(10) NOT NULL,
  "quote_rate_scaled" bigint NOT NULL,
  "description" text,
  "status" varchar(20) DEFAULT 'finalized' NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "finalized_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "merchant_transactions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "merchant_transactions_payment_request_id_payment_requests_id_fk" FOREIGN KEY ("payment_request_id") REFERENCES "public"."payment_requests"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "merchant_transactions_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "merchant_transactions_currency_check" CHECK ("display_currency" = 'EUR'),
  CONSTRAINT "merchant_transactions_status_check" CHECK ("status" = 'finalized')
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "merchant_transactions_receipt_unique" ON "merchant_transactions" USING btree ("receipt_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "merchant_transactions_payment_request_unique" ON "merchant_transactions" USING btree ("payment_request_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "merchant_transactions_ledger_entry_unique" ON "merchant_transactions" USING btree ("ledger_entry_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merchant_transactions_merchant_time_idx" ON "merchant_transactions" USING btree ("merchant_id", "occurred_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "merchant_capture_exceptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "merchant_id" uuid NOT NULL,
  "payment_request_id" uuid,
  "reason_code" varchar(80) NOT NULL,
  "severity" varchar(20) NOT NULL,
  "status" varchar(20) DEFAULT 'open' NOT NULL,
  "details" text,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  CONSTRAINT "merchant_capture_exceptions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "merchant_capture_exceptions_payment_request_id_payment_requests_id_fk" FOREIGN KEY ("payment_request_id") REFERENCES "public"."payment_requests"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "merchant_capture_exceptions_severity_check" CHECK ("severity" IN ('info', 'warning', 'critical')),
  CONSTRAINT "merchant_capture_exceptions_status_check" CHECK ("status" IN ('open', 'resolved'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merchant_capture_exceptions_merchant_status_idx" ON "merchant_capture_exceptions" USING btree ("merchant_id", "status");
--> statement-breakpoint
ALTER TABLE "merchants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "merchant_memberships" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "merchant_consent_records" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "merchant_payment_attempts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "merchant_transactions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "merchant_capture_exceptions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "merchants", "merchant_memberships", "merchant_consent_records", "merchant_payment_attempts", "merchant_transactions", "merchant_capture_exceptions" FROM anon, authenticated;
