-- Cap guesses per reset code (see auth.service.ts resetPassword).
ALTER TABLE "password_reset_codes" ADD COLUMN IF NOT EXISTS "attempts" integer DEFAULT 0 NOT NULL;
