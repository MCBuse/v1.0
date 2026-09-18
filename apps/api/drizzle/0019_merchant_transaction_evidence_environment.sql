ALTER TABLE "merchant_transactions"
  ADD COLUMN "evidence_environment" varchar(20) DEFAULT 'unknown' NOT NULL;
--> statement-breakpoint
ALTER TABLE "merchant_transactions"
  ADD CONSTRAINT "merchant_transactions_evidence_environment_check"
  CHECK ("evidence_environment" IN ('live', 'test', 'synthetic', 'unknown'));
