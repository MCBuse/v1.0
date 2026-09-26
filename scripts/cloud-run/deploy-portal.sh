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

environment_file="$repo_root/deploy/cloud-run/portal.env.yaml"
runtime_environment_file="$(mktemp)"
trap 'rm -f "$runtime_environment_file"' EXIT

# Read a top-level "KEY: value" entry from the committed portal env file.
env_file_value() {
  sed -nE "s/^$1:[[:space:]]*\"?([^\"#]*[^\"#[:space:]])\"?[[:space:]]*(#.*)?$/\1/p" "$environment_file" | tail -n 1
}

generated_portal_origin="https://${service}-${project_number}.${region}.run.app"
# Shell overrides win (for one-off releases); otherwise use the committed file.
portal_origin="${MCBUSE_PORTAL_ORIGIN:-$(env_file_value PORTAL_ORIGIN)}"
portal_origin="${portal_origin%/}"
api_url="${MCBUSE_API_URL:-$(env_file_value MCBUSE_API_URL)}"
auth_background_url="${NEXT_PUBLIC_AUTH_BACKGROUND_URL:-}"
if [[ -z "$portal_origin" || -z "$api_url" ]]; then
  echo "PORTAL_ORIGIN and MCBUSE_API_URL must be set in $environment_file." >&2
  exit 1
fi

# Every address the portal is served from must be a trusted origin, otherwise
# browsers on that address get "Request origin is not allowed". Cloud Run serves
# each service on two URLs at once (the project-number URL and the legacy hashed
# *.a.run.app URL), so trust both, plus the canonical custom domain and any
# extra origins supplied for a one-off release.
trusted_origins=("$portal_origin" "$generated_portal_origin")
existing_urls="$(
  gcloud run services describe "$service" \
    --project="$project_id" --region="$region" \
    --format='value(status.url,metadata.annotations."run.googleapis.com/urls")' \
    2>/dev/null || true
)"
while IFS= read -r url; do
  [[ -n "$url" ]] && trusted_origins+=("${url%/}")
done < <(grep -oE 'https://[A-Za-z0-9.-]+' <<<"$existing_urls" || true)
IFS=',' read -r -a extra_origins <<<"${MCBUSE_PORTAL_EXTRA_ORIGINS:-}"
for url in ${extra_origins[@]+"${extra_origins[@]}"}; do
  url="$(xargs <<<"$url")"
  [[ -n "$url" ]] && trusted_origins+=("${url%/}")
done
portal_origins="$(printf '%s\n' "${trusted_origins[@]}" | awk 'NF && !seen[$0]++' | paste -sd, -)"

# Resolved values are appended below, so drop their committed copies to avoid
# duplicate YAML keys.
grep -vE '^(PORTAL_ORIGIN|PORTAL_ORIGINS|MCBUSE_API_URL|NEXT_PUBLIC_AUTH_BACKGROUND_URL):' \
  "$environment_file" >"$runtime_environment_file"
{
  printf '\nPORTAL_ORIGIN: "%s"\n' "$portal_origin"
  printf 'PORTAL_ORIGINS: "%s"\n' "$portal_origins"
  printf 'MCBUSE_API_URL: "%s"\n' "$api_url"
  printf 'NEXT_PUBLIC_AUTH_BACKGROUND_URL: "%s"\n' "$auth_background_url"
} >>"$runtime_environment_file"

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
  --env-vars-file="$runtime_environment_file" \
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

curl -fsS "${generated_portal_origin}/sign-in" >/dev/null
redirect_headers="$(curl -fsS -D - -o /dev/null "${generated_portal_origin}/overview")"
if ! grep -Eiq '^location: .*/sign-in([?#].*)?\r?$' <<<"$redirect_headers"; then
  echo "Portal route protection did not redirect /overview to /sign-in." >&2
  exit 1
fi

# Sign-in must accept every trusted origin. An empty body passes the origin
# check and then fails validation with 400; a rejected origin returns 403.
IFS=',' read -r -a deployed_origins <<<"$portal_origins"
for origin in "${deployed_origins[@]}"; do
  status="$(
    curl -sS -o /dev/null -w '%{http_code}' -X POST \
      -H "Origin: ${origin}" -H 'Content-Type: application/json' \
      --data '{}' "${generated_portal_origin}/api/auth/login"
  )"
  if [[ "$status" != "400" ]]; then
    echo "Sign-in rejected origin ${origin} (HTTP ${status}). Check PORTAL_ORIGINS." >&2
    exit 1
  fi
done

if ! curl -fsS -o /dev/null "${portal_origin}/sign-in"; then
  echo "Warning: ${portal_origin} is not serving the portal yet (check the domain mapping)." >&2
fi

echo "MCBuse merchant portal deployed"
echo "portal_origin=$portal_origin"
echo "generated_portal_origin=$generated_portal_origin"
echo "portal_origins=$portal_origins"
echo "api_url=$api_url"
