-- One-time codes that verify a user's email (POST /auth/email/verify-otp).
-- Deliberately separate from password_reset_codes so a verification code can
-- never be redeemed to reset a password.
CREATE TABLE IF NOT EXISTS "email_verification_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id"),
	"code_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_verification_codes_user_id_idx" ON "email_verification_codes" ("user_id");
--> statement-breakpoint
-- Private to the server role, like every other application table (see 0031).
DO $$ DECLARE client_role text; BEGIN
 ALTER TABLE public.email_verification_codes ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON TABLE public.email_verification_codes FROM PUBLIC;
 FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
 EXECUTE format('REVOKE ALL ON TABLE public.email_verification_codes FROM %I',client_role);
 END IF;
 END LOOP;
END $$;
