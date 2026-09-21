-- A lease on an in-flight operation.
--
-- Without it, two API instances sweeping at the same moment both read an
-- operation at `reserved`, both pass the status check, and both broadcast the
-- transfer. The database rejected the second status change, but the second
-- transaction was already on chain: the money had moved twice.
--
-- The lease is deliberately separate from `next_attempt_at`. That column says
-- when work is due; this one says who is doing it right now.
ALTER TABLE "financial_operations"
ADD COLUMN IF NOT EXISTS "claimed_until" timestamp with time zone;

ALTER TABLE "financial_operations"
ADD COLUMN IF NOT EXISTS "claimed_by" varchar(64);

DROP INDEX IF EXISTS "financial_operations_status_idx";

CREATE INDEX "financial_operations_status_idx"
ON "financial_operations" ("status", "next_attempt_at", "claimed_until");
