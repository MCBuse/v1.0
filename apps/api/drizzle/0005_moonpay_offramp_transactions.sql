CREATE TABLE "offramp_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"ledger_entry_id" uuid,
	"provider" varchar(32) NOT NULL,
	"external_transaction_id" varchar(128),
	"internal_reference" varchar(128) NOT NULL,
	"crypto_amount" bigint NOT NULL,
	"crypto_currency" varchar(20) DEFAULT 'USDC' NOT NULL,
	"fiat_amount" numeric(20, 8),
	"fiat_currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"network" varchar(32) DEFAULT 'solana' NOT NULL,
	"refund_wallet_address" text NOT NULL,
	"deposit_wallet_address" text,
	"deposit_wallet_address_tag" text,
	"deposit_tx_hash" text,
	"refund_tx_hash" text,
	"tracker_url" text,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"raw_webhook_payload" jsonb,
	"deposit_initiated_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "offramp_transactions" ADD CONSTRAINT "offramp_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offramp_transactions" ADD CONSTRAINT "offramp_transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offramp_transactions" ADD CONSTRAINT "offramp_transactions_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "offramp_transactions_internal_reference_uidx" ON "offramp_transactions" USING btree ("internal_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "offramp_transactions_provider_external_uidx" ON "offramp_transactions" USING btree ("provider","external_transaction_id") WHERE "offramp_transactions"."external_transaction_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "offramp_transactions_deposit_tx_hash_uidx" ON "offramp_transactions" USING btree ("deposit_tx_hash") WHERE "offramp_transactions"."deposit_tx_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "offramp_transactions_user_status_idx" ON "offramp_transactions" USING btree ("user_id","status");
