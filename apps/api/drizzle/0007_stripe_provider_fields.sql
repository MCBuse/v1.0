ALTER TABLE "users" ADD COLUMN "stripe_account_id" varchar(255);--> statement-breakpoint
ALTER TABLE "offramp_transactions" ADD COLUMN "stripe_transfer_id" text;--> statement-breakpoint
ALTER TABLE "offramp_transactions" ADD COLUMN "stripe_payout_id" text;
