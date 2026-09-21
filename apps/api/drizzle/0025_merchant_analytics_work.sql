-- Pending analytics work, one row per merchant so repeated changes coalesce.
CREATE TABLE IF NOT EXISTS "merchant_analytics_work" (
	"merchant_id" uuid PRIMARY KEY NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"first_queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);

ALTER TABLE "merchant_analytics_work"
ADD CONSTRAINT "merchant_analytics_work_merchant_id_merchants_id_fk"
FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX "merchant_analytics_work_status_idx"
ON "merchant_analytics_work" ("status", "last_queued_at");
