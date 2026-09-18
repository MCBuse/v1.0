CREATE TABLE "merchant_finance_package_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "package_id" uuid NOT NULL REFERENCES "merchant_finance_packages"("id"),
  "kind" varchar(12) NOT NULL,
  "content" bytea NOT NULL,
  "byte_size" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "merchant_finance_package_artifacts_kind_check" CHECK ("kind" IN ('pdf', 'zip')),
  CONSTRAINT "merchant_finance_package_artifacts_size_check" CHECK ("byte_size" > 0 AND "byte_size" <= 10485760)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_finance_package_artifacts_unique" ON "merchant_finance_package_artifacts" ("package_id", "kind");
