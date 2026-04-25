ALTER TABLE "onramp_transactions" ADD COLUMN IF NOT EXISTS "network" varchar(32) DEFAULT 'solana' NOT NULL;
