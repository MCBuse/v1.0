CREATE TYPE "public"."issuer_lifecycle_status" AS ENUM('active', 'suspended', 'closed');--> statement-breakpoint
CREATE TYPE "public"."issuer_membership_role" AS ENUM('issuer_admin', 'issuer_member', 'reviewer');--> statement-breakpoint
CREATE TYPE "public"."issuer_membership_status" AS ENUM('invited', 'active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."issuer_verification_status" AS ENUM('pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."registry_publication_status" AS ENUM('published', 'delisted');--> statement-breakpoint
CREATE TYPE "public"."stablecoin_submission_status" AS ENUM('draft', 'in_review', 'approved', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."submission_review_action" AS ENUM('submitted', 'approved', 'rejected', 'published', 'delisted');--> statement-breakpoint
CREATE TABLE "issuer_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "issuer_membership_role" NOT NULL,
	"status" "issuer_membership_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issuer_organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"verification_status" "issuer_verification_status" DEFAULT 'pending' NOT NULL,
	"lifecycle_status" "issuer_lifecycle_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "issuer_organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "stablecoin_registry_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"ticker" varchar(20) NOT NULL,
	"network" varchar(100) NOT NULL,
	"contract_address" text NOT NULL,
	"normalized_contract_address" text NOT NULL,
	"reserve_disclosure" text NOT NULL,
	"attestation_url" text NOT NULL,
	"publication_status" "registry_publication_status" DEFAULT 'published' NOT NULL,
	"published_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stablecoin_registry_entries_submission_id_unique" UNIQUE("submission_id")
);
--> statement-breakpoint
CREATE TABLE "stablecoin_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"submitted_by" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"ticker" varchar(20) NOT NULL,
	"network" varchar(100) NOT NULL,
	"contract_address" text NOT NULL,
	"normalized_contract_address" text NOT NULL,
	"reserve_disclosure" text NOT NULL,
	"attestation_url" text NOT NULL,
	"status" "stablecoin_submission_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"submitted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_review_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"action" "submission_review_action" NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issuer_memberships" ADD CONSTRAINT "issuer_memberships_organization_id_issuer_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."issuer_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuer_memberships" ADD CONSTRAINT "issuer_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stablecoin_registry_entries" ADD CONSTRAINT "stablecoin_registry_entries_submission_id_stablecoin_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."stablecoin_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stablecoin_registry_entries" ADD CONSTRAINT "stablecoin_registry_entries_organization_id_issuer_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."issuer_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stablecoin_submissions" ADD CONSTRAINT "stablecoin_submissions_organization_id_issuer_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."issuer_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stablecoin_submissions" ADD CONSTRAINT "stablecoin_submissions_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_review_events" ADD CONSTRAINT "submission_review_events_submission_id_stablecoin_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."stablecoin_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_review_events" ADD CONSTRAINT "submission_review_events_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "issuer_memberships_org_user_uq" ON "issuer_memberships" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "issuer_memberships_user_status_idx" ON "issuer_memberships" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "issuer_memberships_org_role_status_idx" ON "issuer_memberships" USING btree ("organization_id","role","status");--> statement-breakpoint
CREATE INDEX "issuer_organizations_status_idx" ON "issuer_organizations" USING btree ("lifecycle_status");--> statement-breakpoint
CREATE UNIQUE INDEX "stablecoin_registry_network_contract_uq" ON "stablecoin_registry_entries" USING btree ("network","normalized_contract_address");--> statement-breakpoint
CREATE INDEX "stablecoin_registry_publication_idx" ON "stablecoin_registry_entries" USING btree ("publication_status","published_at");--> statement-breakpoint
CREATE INDEX "stablecoin_submissions_org_status_created_idx" ON "stablecoin_submissions" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "stablecoin_submissions_identity_idx" ON "stablecoin_submissions" USING btree ("network","normalized_contract_address");--> statement-breakpoint
CREATE INDEX "submission_review_events_submission_created_idx" ON "submission_review_events" USING btree ("submission_id","created_at");--> statement-breakpoint
CREATE INDEX "submission_review_events_reviewer_created_idx" ON "submission_review_events" USING btree ("reviewer_id","created_at");--> statement-breakpoint