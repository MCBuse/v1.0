CREATE TABLE "onramp_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"provider" varchar(32) NOT NULL,
	"external_transaction_id" varchar(128),
	"internal_reference" varchar(128) NOT NULL,
	"fiat_amount" numeric(20, 8) NOT NULL,
	"fiat_currency" varchar(10) NOT NULL,
	"crypto_amount" numeric(30, 18),
	"crypto_currency" varchar(20) DEFAULT 'USDC' NOT NULL,
	"network" varchar(32) DEFAULT 'solana' NOT NULL,
	"wallet_address" text NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"tx_hash" text,
	"raw_webhook_payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onramp_transactions" ADD CONSTRAINT "onramp_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onramp_transactions" ADD CONSTRAINT "onramp_transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "onramp_transactions_internal_reference_uidx" ON "onramp_transactions" USING btree ("internal_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "onramp_transactions_provider_external_uidx" ON "onramp_transactions" USING btree ("provider","external_transaction_id") WHERE "onramp_transactions"."external_transaction_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "onramp_transactions_tx_hash_uidx" ON "onramp_transactions" USING btree ("tx_hash") WHERE "onramp_transactions"."tx_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "onramp_transactions_wallet_status_idx" ON "onramp_transactions" USING btree ("wallet_address","status");
