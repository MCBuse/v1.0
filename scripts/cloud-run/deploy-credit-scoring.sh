#!/usr/bin/env bash
# Deploy the private credit-scoring service to Cloud Run.
# Run only after release approval. Does not migrate the database or deploy the API/portal.
#
# Usage: pnpm deploy:credit-scoring
#
# Settings come from .env.local at the repo root (see .env.example). Anything
# not set there is read from the live Cloud Run services, so no flags are needed:
#   MCBUSE_GCP_PROJECT_ID          GCP project (default: mcbuse-hackathon-2026-fno)
#   MCBUSE_GCP_REGION              region (default: europe-west1)
#   MCBUSE_CREDIT_SERVICE_ACCOUNT  scoring runtime identity (default: the one the service runs as now)
#   MCBUSE_API_SERVICE_ACCOUNT     API identity allowed to call it (default: the one the API runs as now)
#   MCBUSE_CREDIT_SECRET_VERSION   CREDIT_SCORING_TOKEN version (default: the version the API uses)
# A variable exported in your shell takes precedence over .env.local.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
local_env_file="${MCBUSE_ENV_FILE:-$repo_root/.env.local}"

# Load .env.local without overriding variables already exported in the shell.
if [[ -f "$local_env_file" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    key="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    value="${value%\"}"; value="${value#\"}"; value="${value%\'}"; value="${value#\'}"
    [[ -z "${!key+x}" ]] && export "$key=$value"
  done <"$local_env_file"
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "Google Cloud CLI is required. Install it, then run: gcloud auth login" >&2
  exit 1
fi
if [[ -z "$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null || true)" ]]; then
  echo "No active Google Cloud account. Run: gcloud auth login" >&2
  exit 1
fi

project_id="${MCBUSE_GCP_PROJECT_ID:-mcbuse-hackathon-2026-fno}"
region="${MCBUSE_GCP_REGION:-europe-west1}"
service="${MCBUSE_CREDIT_SERVICE:-mcbuse-credit-scoring}"
api_service="${MCBUSE_RUN_SERVICE:-mcbuse-api}"
repository="${MCBUSE_ARTIFACT_REPOSITORY:-mcbuse}"

describe() {
  gcloud run services describe "$1" --project="$project_id" --region="$region" \
    --format="$2" 2>/dev/null || true
}

scoring_account="${MCBUSE_CREDIT_SERVICE_ACCOUNT:-$(describe "$service" 'value(spec.template.spec.serviceAccountName)')}"
api_account="${MCBUSE_API_SERVICE_ACCOUNT:-$(describe "$api_service" 'value(spec.template.spec.serviceAccountName)')}"
api_account="${api_account:-${api_service}@${project_id}.iam.gserviceaccount.com}"

# Use the same token version the API sends, so the two services always match.
secret_version="${MCBUSE_CREDIT_SECRET_VERSION:-$(
  describe "$api_service" json | python3 -c '
import json, sys
try:
    containers = json.load(sys.stdin)["spec"]["template"]["spec"]["containers"]
except Exception:
    sys.exit(0)
for entry in containers[0].get("env", []):
    ref = entry.get("valueFrom", {}).get("secretKeyRef")
    if entry.get("name") == "CREDIT_SCORING_TOKEN" and ref:
        print(ref["key"])
'
)}"

if [[ -z "$scoring_account" ]]; then
  echo "Could not find the scoring service account. Set MCBUSE_CREDIT_SERVICE_ACCOUNT in .env.local." >&2
  exit 1
fi
if [[ -z "$secret_version" ]]; then
  echo "The API has no CREDIT_SCORING_TOKEN secret binding. Set MCBUSE_CREDIT_SECRET_VERSION in .env.local." >&2
  exit 1
fi

echo "Deploying $service to $project_id ($region)"
echo "  runtime account: $scoring_account"
echo "  invoker (API):   $api_account"
echo "  token version:   CREDIT_SCORING_TOKEN:$secret_version"

gcloud secrets versions describe "$secret_version" --secret=CREDIT_SCORING_TOKEN --project="$project_id" >/dev/null

revision="$(date -u +%Y%m%dT%H%M%SZ)-$(git -C "$repo_root" rev-parse --short=8 HEAD 2>/dev/null || echo local)"
image="${region}-docker.pkg.dev/${project_id}/${repository}/${service}:${revision}"

gcloud builds submit "$repo_root" \
  --project="$project_id" \
  --config="$repo_root/deploy/cloud-run/cloudbuild.credit-scoring.yaml" \
  --substitutions="_IMAGE=$image"

gcloud run deploy "$service" \
  --project="$project_id" \
  --region="$region" \
  --image="$image" \
  --service-account="$scoring_account" \
  --no-allow-unauthenticated \
  --min-instances=0 \
  --max-instances=2 \
  --memory=256Mi \
  --cpu=1 \
  --concurrency=20 \
  --timeout=15 \
  --set-secrets="CREDIT_SCORING_TOKEN=CREDIT_SCORING_TOKEN:$secret_version"

gcloud run services add-iam-policy-binding "$service" \
  --project="$project_id" \
  --region="$region" \
  --member="serviceAccount:$api_account" \
  --role=roles/run.invoker >/dev/null

service_url="$(describe "$service" 'value(status.url)')"

# The service must stay private: anonymous callers are refused by Cloud Run.
anonymous_status="$(curl -sS -o /dev/null -w '%{http_code}' "${service_url}/health" || true)"
if [[ "$anonymous_status" != "403" && "$anonymous_status" != "401" ]]; then
  echo "Warning: anonymous request to ${service_url} returned HTTP ${anonymous_status}; expected 403." >&2
fi

# The API must point at one of this service's URLs (Cloud Run serves two).
service_urls="$(describe "$service" 'value(status.url,metadata.annotations."run.googleapis.com/urls")')"
api_scoring_url="$(
  describe "$api_service" json | python3 -c '
import json, sys
try:
    containers = json.load(sys.stdin)["spec"]["template"]["spec"]["containers"]
except Exception:
    sys.exit(0)
for entry in containers[0].get("env", []):
    if entry.get("name") == "CREDIT_SCORING_URL":
        print(entry.get("value", "").rstrip("/"))
'
)"
if [[ -z "$api_scoring_url" || "$service_urls" != *"$api_scoring_url"* ]]; then
  echo "Warning: the API's CREDIT_SCORING_URL (${api_scoring_url:-unset}) is not a URL of ${service}. Fix it before releasing." >&2
fi

echo "Credit scoring service deployed: $service_url"
