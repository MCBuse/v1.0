-- Durable financial operations, their append-only event log, wallet
-- encryption-key versioning and provider webhook de-duplication.
-- Additive only: no existing table is altered destructively and no data is
-- rewritten. Existing wallets are labelled as the "v1" key version, which is
-- the key they were already sealed with.

CREATE TABLE IF NOT EXISTS "financial_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'created' NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"input_fingerprint" varchar(64) NOT NULL,
	"source_wallet_id" uuid,
	"destination_wallet_id" uuid,
	"amount_base_units" bigint NOT NULL,
	"currency" varchar(10) NOT NULL,
	"display_amount_minor" bigint,
	"display_currency" varchar(10),
	"quote_rate_scaled" bigint,
	"quoted_at" timestamp with time zone,
	"provider" varchar(32),
	"provider_ref" varchar(255),
	"provider_status" varchar(64),
	"provider_destination_id" varchar(255),
	"provider_account_id" varchar(255),
	"chain_signature" varchar(128),
	"chain_status" varchar(32),
	"reversal_of_operation_id" uuid,
	"ledger_entry_id" uuid,
	"failure_code" varchar(80),
	"failure_detail" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"reserved_at" timestamp with time zone,
	"collection_settled_at" timestamp with time zone,
	"chain_submitted_at" timestamp with time zone,
	"chain_confirmed_at" timestamp with time zone,
	"payout_submitted_at" timestamp with time zone,
	"finalized_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "financial_operations"
ADD CONSTRAINT "financial_operations_user_id_users_id_fk"
FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "financial_operations"
ADD CONSTRAINT "financial_operations_source_wallet_id_wallets_id_fk"
FOREIGN KEY ("source_wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "financial_operations"
ADD CONSTRAINT "financial_operations_destination_wallet_id_wallets_id_fk"
FOREIGN KEY ("destination_wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "financial_operations"
ADD CONSTRAINT "financial_operations_ledger_entry_id_ledger_entries_id_fk"
FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE no action ON UPDATE no action;

CREATE UNIQUE INDEX "financial_operations_idempotency_unique"
ON "financial_operations" ("user_id", "idempotency_key");

CREATE INDEX "financial_operations_status_idx"
ON "financial_operations" ("status", "next_attempt_at");

CREATE INDEX "financial_operations_user_idx"
ON "financial_operations" ("user_id", "created_at");

CREATE INDEX "financial_operations_provider_ref_idx"
ON "financial_operations" ("provider_ref");

CREATE INDEX "financial_operations_chain_signature_idx"
ON "financial_operations" ("chain_signature");

CREATE TABLE IF NOT EXISTS "financial_operation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"from_status" varchar(32),
	"to_status" varchar(32),
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "financial_operation_events"
ADD CONSTRAINT "financial_operation_events_operation_id_financial_operations_id_fk"
FOREIGN KEY ("operation_id") REFERENCES "public"."financial_operations"("id") ON DELETE no action ON UPDATE no action;

CREATE UNIQUE INDEX "financial_operation_events_sequence_unique"
ON "financial_operation_events" ("operation_id", "sequence");

CREATE INDEX "financial_operation_events_operation_idx"
ON "financial_operation_events" ("operation_id");

CREATE TABLE IF NOT EXISTS "wallet_encryption_key_versions" (
	"version" varchar(32) PRIMARY KEY NOT NULL,
	"key_checksum" varchar(64) NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"introduced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	"notes" text
);

CREATE TABLE IF NOT EXISTS "provider_webhook_events" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"provider" varchar(32) NOT NULL,
	"event_type" varchar(128) NOT NULL,
	"provider_created_at" timestamp with time zone,
	"payload_hash" varchar(64) NOT NULL,
	"status" varchar(24) DEFAULT 'received' NOT NULL,
	"processed_at" timestamp with time zone,
	"error_detail" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "provider_webhook_events_type_idx"
ON "provider_webhook_events" ("provider", "event_type", "received_at");

-- Existing wallets keep their current key material; the column only records
-- which version that material belongs to.
ALTER TABLE "wallets"
ADD COLUMN IF NOT EXISTS "encryption_key_version" varchar(32) DEFAULT 'v1' NOT NULL;
