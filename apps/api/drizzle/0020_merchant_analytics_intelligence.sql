ALTER TABLE "merchant_products" ADD COLUMN "category" varchar(100);

CREATE TABLE "merchant_analytics_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "merchant_id" uuid NOT NULL REFERENCES "merchants"("id"),
  "calculation_version" varchar(64) NOT NULL,
  "input_fingerprint" varchar(64) NOT NULL,
  "period_from" timestamp with time zone NOT NULL,
  "period_to" timestamp with time zone NOT NULL,
  "source_coverage" jsonb NOT NULL,
  "snapshot" jsonb NOT NULL,
  "generated_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "merchant_analytics_snapshot_fingerprint_unique" ON "merchant_analytics_snapshots" ("merchant_id", "calculation_version", "input_fingerprint");
CREATE INDEX "merchant_analytics_snapshot_latest_idx" ON "merchant_analytics_snapshots" ("merchant_id", "generated_at");

CREATE TABLE "merchant_insights" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "merchant_id" uuid NOT NULL REFERENCES "merchants"("id"),
  "snapshot_id" uuid NOT NULL REFERENCES "merchant_analytics_snapshots"("id"),
  "code" varchar(100) NOT NULL,
  "kind" varchar(32) NOT NULL,
  "priority" integer NOT NULL,
  "title" varchar(240) NOT NULL,
  "summary" text NOT NULL,
  "recommendation" text,
  "evidence" jsonb NOT NULL,
  "limitations" jsonb NOT NULL,
  "narration_source" varchar(24) DEFAULT 'deterministic' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone
);
CREATE UNIQUE INDEX "merchant_insights_snapshot_code_unique" ON "merchant_insights" ("snapshot_id", "code");
CREATE INDEX "merchant_insights_active_idx" ON "merchant_insights" ("merchant_id", "active", "priority");

CREATE TABLE "merchant_analytics_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "status" varchar(20) DEFAULT 'running' NOT NULL,
  "calculation_version" varchar(64) NOT NULL,
  "processed_merchants" integer DEFAULT 0 NOT NULL,
  "failed_merchants" integer DEFAULT 0 NOT NULL,
  "error_summary" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
CREATE INDEX "merchant_analytics_runs_started_idx" ON "merchant_analytics_runs" ("started_at");

CREATE TABLE "merchant_narration_cache" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "merchant_id" uuid NOT NULL REFERENCES "merchants"("id"),
  "input_fingerprint" varchar(64) NOT NULL,
  "model" varchar(80) NOT NULL,
  "prompt_version" varchar(64) NOT NULL,
  "output" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "merchant_narration_cache_key_unique" ON "merchant_narration_cache" ("merchant_id", "input_fingerprint", "model", "prompt_version");
CREATE INDEX "merchant_narration_cache_created_idx" ON "merchant_narration_cache" ("created_at");
