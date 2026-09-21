ALTER TABLE chain_attempts ADD COLUMN intent_key text UNIQUE;
--> statement-breakpoint
ALTER TABLE chain_attempts ADD COLUMN input_fingerprint text;
