#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
default_project_id="mcbuse-hackathon-2026-fno"
project_id="${MCBUSE_GCP_PROJECT_ID:-$default_project_id}"
region="${MCBUSE_GCP_REGION:-europe-west1}"
repository="${MCBUSE_ARTIFACT_REPOSITORY:-mcbuse}"
service="${MCBUSE_PORTAL_SERVICE:-mcbuse-portal}"
api_service="${MCBUSE_RUN_SERVICE:-mcbuse-api}"
service_account_name="${MCBUSE_PORTAL_SERVICE_ACCOUNT:-mcbuse-portal}"
service_account_email="${service_account_name}@${project_id}.iam.gserviceaccount.com"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "Google Cloud CLI is required. Install it, then run: gcloud auth login" >&2
  exit 1
fi

active_account="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null || true)"
if [[ -z "$active_account" ]]; then
  echo "No active Google Cloud account. Run: gcloud auth login" >&2
  exit 1
fi

echo "Deploying the merchant portal to GCP project: $project_id"
if [[ -z "${MCBUSE_GCP_PROJECT_ID:-}" ]]; then
  echo "Using the repository default. Override with MCBUSE_GCP_PROJECT_ID if needed."
fi

project_number="$(
  gcloud projects describe "$project_id" \
    --format='value(projectNumber)'
)"
if [[ ! "$project_number" =~ ^[0-9]+$ ]]; then
  echo "Could not resolve the numeric project number for $project_id." >&2
  exit 1
fi

portal_origin="https://${service}-${project_number}.${region}.run.app"
api_url="${MCBUSE_API_URL:-https://${api_service}-${project_number}.${region}.run.app/api/v1}"
auth_background_url="${NEXT_PUBLIC_AUTH_BACKGROUND_URL:-}"

if ! gcloud iam service-accounts describe "$service_account_email" \
  --project="$project_id" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$service_account_name" \
    --project="$project_id" \
    --display-name="MCBuse merchant portal runtime"
fi

revision="$(date -u +%Y%m%dT%H%M%SZ)-$(git -C "$repo_root" rev-parse --short=8 HEAD)"
image="${region}-docker.pkg.dev/${project_id}/${repository}/portal:${revision}"

gcloud builds submit "$repo_root" \
  --project="$project_id" \
  --config="$repo_root/deploy/cloud-run/cloudbuild.portal.yaml" \
  --substitutions="_IMAGE=${image}"

gcloud run deploy "$service" \
  --project="$project_id" \
  --region="$region" \
  --image="$image" \
  --service-account="$service_account_email" \
  --set-env-vars="NODE_ENV=production,HOSTNAME=0.0.0.0,MCBUSE_API_URL=${api_url},PORTAL_ORIGIN=${portal_origin},SESSION_COOKIE_SECURE=true,NEXT_PUBLIC_AUTH_BACKGROUND_URL=${auth_background_url}" \
  --allow-unauthenticated \
  --ingress=all \
  --port=8080 \
  --cpu=1 \
  --memory=512Mi \
  --concurrency=40 \
  --min-instances=0 \
  --max-instances=2 \
  --timeout=60s \
  --cpu-throttling \
  --labels=app=mcbuse,component=portal,environment=hackathon

curl -fsS "${portal_origin}/sign-in" >/dev/null
redirect_headers="$(curl -fsS -D - -o /dev/null "${portal_origin}/overview")"
if ! grep -Eiq '^location: .*/sign-in([?#].*)?\r?$' <<<"$redirect_headers"; then
  echo "Portal route protection did not redirect /overview to /sign-in." >&2
  exit 1
fi

echo "MCBuse merchant portal deployed"
echo "portal_origin=$portal_origin"
echo "api_url=$api_url"
