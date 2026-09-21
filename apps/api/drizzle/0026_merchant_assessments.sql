-- Immutable saved assessments, plus the link from a finance package to the
-- exact assessment it reports. Additive only.

CREATE TABLE IF NOT EXISTS "merchant_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"model_id" varchar(64) NOT NULL,
	"model_version" varchar(32) NOT NULL,
	"evidence_from" timestamp with time zone NOT NULL,
	"evidence_to" timestamp with time zone NOT NULL,
	"stage" varchar(40) NOT NULL,
	"result" jsonb NOT NULL,
	"profile_snapshot" jsonb NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "merchant_assessments"
ADD CONSTRAINT "merchant_assessments_merchant_id_merchants_id_fk"
FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "merchant_assessments"
ADD CONSTRAINT "merchant_assessments_actor_user_id_users_id_fk"
FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX "merchant_assessments_merchant_idx"
ON "merchant_assessments" ("merchant_id", "created_at");

CREATE TABLE IF NOT EXISTS "merchant_finance_package_assessments" (
	"package_id" uuid PRIMARY KEY NOT NULL,
	"assessment_id" uuid NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "merchant_finance_package_assessments"
ADD CONSTRAINT "mfpa_package_id_merchant_finance_packages_id_fk"
FOREIGN KEY ("package_id") REFERENCES "public"."merchant_finance_packages"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "merchant_finance_package_assessments"
ADD CONSTRAINT "mfpa_assessment_id_merchant_assessments_id_fk"
FOREIGN KEY ("assessment_id") REFERENCES "public"."merchant_assessments"("id") ON DELETE no action ON UPDATE no action;
