ALTER TABLE "merchant_narration_cache"
ADD COLUMN "calculation_version" varchar(64) DEFAULT 'merchant-intelligence-v1' NOT NULL;

ALTER TABLE "merchant_narration_cache"
ALTER COLUMN "calculation_version" DROP DEFAULT;

DROP INDEX "merchant_narration_cache_key_unique";

CREATE UNIQUE INDEX "merchant_narration_cache_key_unique"
ON "merchant_narration_cache" ("merchant_id", "input_fingerprint", "calculation_version", "model", "prompt_version");
