ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" varchar(30);
--> statement-breakpoint
UPDATE "users"
SET "username" = ranked.generated_username
FROM (
  SELECT
    "id",
    'user_' || row_number() OVER (ORDER BY "created_at", "id") AS generated_username
  FROM "users"
  WHERE "username" IS NULL
) AS ranked
WHERE "users"."id" = ranked."id";
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE ("username");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "primary_currency" varchar(10) DEFAULT 'USDC' NOT NULL;
