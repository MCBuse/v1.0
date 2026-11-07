-- Invoices addressed to a specific user: only payer_user_id may pay them, and
-- they appear in that user's incoming list. Nullable, so existing bearer QR
-- requests (and older API images) are unaffected.
ALTER TABLE "payment_requests" ADD COLUMN "payer_user_id" uuid REFERENCES "users"("id");--> statement-breakpoint
CREATE INDEX "payment_requests_payer_status_idx" ON "payment_requests" ("payer_user_id","status");
