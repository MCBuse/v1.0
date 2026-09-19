ALTER TABLE "merchant_narration_cache"
ADD COLUMN "status" varchar(16) DEFAULT 'success' NOT NULL;

CREATE INDEX "merchant_narration_cache_usage_idx"
ON "merchant_narration_cache" ("status", "created_at", "merchant_id");
