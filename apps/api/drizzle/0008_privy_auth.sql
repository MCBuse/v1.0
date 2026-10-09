-- Privy embedded wallet integration.
-- Users authenticate via Privy; embedded Solana wallets replace custodial keypairs.

ALTER TABLE "users" ALTER COLUMN "first_name" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "last_name"  DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "privy_user_id" varchar(100);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_privy_user_id_unique" UNIQUE("privy_user_id");
--> statement-breakpoint

-- Custodial keypair becomes optional; Privy-managed wallets store NULL.
-- The column is dropped entirely in the post-cutover migration.
ALTER TABLE "wallets" ALTER COLUMN "encrypted_keypair" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "privy_wallet_id" varchar(100);
