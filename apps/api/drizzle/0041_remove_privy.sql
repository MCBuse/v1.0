-- Remove Privy sign-in. Privy users and their key-less wallets are deleted
-- (they can re-register with email/phone), then the Privy columns are dropped
-- and every wallet must hold a custodial key again.
--
-- Ledger, merchant, payment, financial-operation and on/offramp rows are
-- intentionally NOT deleted. If any reference a Privy user or key-less wallet,
-- their FKs abort this migration (drizzle runs pending migrations in one
-- transaction) instead of silently rewriting a counterparty's money history.
-- Resolve such rows by hand first.
DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE privy_user_id IS NOT NULL);
--> statement-breakpoint
DELETE FROM password_reset_codes WHERE user_id IN (SELECT id FROM users WHERE privy_user_id IS NOT NULL);
--> statement-breakpoint
DELETE FROM email_verification_codes WHERE user_id IN (SELECT id FROM users WHERE privy_user_id IS NOT NULL);
--> statement-breakpoint
DELETE FROM balances WHERE wallet_id IN (SELECT id FROM wallets WHERE encrypted_keypair IS NULL);
--> statement-breakpoint
DELETE FROM wallets WHERE encrypted_keypair IS NULL;
--> statement-breakpoint
DELETE FROM users WHERE privy_user_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE users DROP COLUMN privy_user_id;
--> statement-breakpoint
ALTER TABLE wallets DROP COLUMN privy_wallet_id;
--> statement-breakpoint
ALTER TABLE wallets ALTER COLUMN encrypted_keypair SET NOT NULL;
