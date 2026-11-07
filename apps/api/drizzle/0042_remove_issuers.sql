-- Remove the issuer / stablecoin-registry feature (issuer sign-up, submissions,
-- reviewer queue, registry). Tables go in FK order, then their enum types.
-- No CASCADE: if anything outside this feature still references these tables,
-- the migration aborts instead of silently dropping it.
--
-- Users created by the issuer sign-up flow are NOT deleted; they remain plain
-- user rows (without wallets).
DROP TABLE "submission_review_events";--> statement-breakpoint
DROP TABLE "stablecoin_registry_entries";--> statement-breakpoint
DROP TABLE "stablecoin_submissions";--> statement-breakpoint
DROP TABLE "issuer_memberships";--> statement-breakpoint
DROP TABLE "issuer_organizations";--> statement-breakpoint
DROP TYPE "public"."submission_review_action";--> statement-breakpoint
DROP TYPE "public"."registry_publication_status";--> statement-breakpoint
DROP TYPE "public"."stablecoin_submission_status";--> statement-breakpoint
DROP TYPE "public"."issuer_membership_status";--> statement-breakpoint
DROP TYPE "public"."issuer_membership_role";--> statement-breakpoint
DROP TYPE "public"."issuer_lifecycle_status";--> statement-breakpoint
DROP TYPE "public"."issuer_verification_status";
