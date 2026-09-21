#!/usr/bin/env bash
# Run only after release approval. Does not migrate the database or deploy the API/portal.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
project_id="${MCBUSE_GCP_PROJECT_ID:?Set MCBUSE_GCP_PROJECT_ID}"
region="${MCBUSE_GCP_REGION:-europe-west1}"
service="${MCBUSE_CREDIT_SERVICE:-mcbuse-credit-scoring}"
scoring_account="${MCBUSE_CREDIT_SERVICE_ACCOUNT:?Set the dedicated scoring service account email}"
api_account="${MCBUSE_API_SERVICE_ACCOUNT:?Set the existing API service account email}"
secret_version="${MCBUSE_CREDIT_SECRET_VERSION:?Set an existing CREDIT_SCORING_TOKEN secret version}"
repository="${MCBUSE_ARTIFACT_REPOSITORY:-mcbuse}"
image="${region}-docker.pkg.dev/${project_id}/${repository}/${service}:$(date -u +%Y%m%d%H%M%S)"
gcloud secrets versions describe "$secret_version" --secret=CREDIT_SCORING_TOKEN --project="$project_id" >/dev/null
gcloud builds submit "$repo_root" --project="$project_id" --config="$repo_root/deploy/cloud-run/cloudbuild.credit-scoring.yaml" --substitutions="_IMAGE=$image"
gcloud run deploy "$service" --project="$project_id" --region="$region" --image="$image" --service-account="$scoring_account" --no-allow-unauthenticated --min-instances=0 --max-instances=2 --memory=256Mi --cpu=1 --concurrency=20 --timeout=15 --set-secrets="CREDIT_SCORING_TOKEN=CREDIT_SCORING_TOKEN:$secret_version"
gcloud run services add-iam-policy-binding "$service" --project="$project_id" --region="$region" --member="serviceAccount:$api_account" --role=roles/run.invoker >/dev/null
service_url="$(gcloud run services describe "$service" --project="$project_id" --region="$region" --format='value(status.url)')"
printf 'Scoring service deployed. Configure API CREDIT_SCORING_URL and CREDIT_SCORING_AUDIENCE to %s and bind the same token secret version. Verify private invocation before releasing the API.\n' "$service_url"
