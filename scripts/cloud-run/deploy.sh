#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
project_id="${MCBUSE_GCP_PROJECT_ID:?Set MCBUSE_GCP_PROJECT_ID to the dedicated GCP project.}"
backup_dir="${MCBUSE_BACKUP_DIR:?Set MCBUSE_BACKUP_DIR to the verified pre-migration backup directory.}"
region="${MCBUSE_GCP_REGION:-europe-west1}"
repository="${MCBUSE_ARTIFACT_REPOSITORY:-mcbuse}"
service="${MCBUSE_RUN_SERVICE:-mcbuse-api}"
service_account_name="${MCBUSE_RUN_SERVICE_ACCOUNT:-mcbuse-api}"
service_account_email="${service_account_name}@${project_id}.iam.gserviceaccount.com"
environment_file="$repo_root/deploy/cloud-run/api.env.yaml"

if [[ ! -f "$backup_dir/database.dump" || ! -f "$backup_dir/SHA256SUMS" ]]; then
  echo "The backup directory must contain database.dump and SHA256SUMS." >&2
  exit 1
fi

shasum -a 256 -c "$backup_dir/SHA256SUMS"

required_secrets=(
  DATABASE_URL
  JWT_ACCESS_SECRET
  JWT_REFRESH_SECRET
  SOLANA_KEYPAIR_ENCRYPTION_KEY
  MOONPAY_PUBLIC_KEY
  MOONPAY_SECRET_KEY
  MOONPAY_WEBHOOK_SECRET
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
)

for secret_name in "${required_secrets[@]}"; do
  if [[ -z "$(gcloud secrets versions list "$secret_name" --project="$project_id" --filter='state=ENABLED' --limit=1 --format='value(name)')" ]]; then
    echo "Secret $secret_name has no enabled version in project $project_id." >&2
    exit 1
  fi
done

revision="$(date -u +%Y%m%dT%H%M%SZ)-$(git -C "$repo_root" rev-parse --short=8 HEAD)"
image="${region}-docker.pkg.dev/${project_id}/${repository}/api:${revision}"

gcloud builds submit "$repo_root" \
  --project="$project_id" \
  --config="$repo_root/deploy/cloud-run/cloudbuild.api.yaml" \
  --substitutions="_IMAGE=${image}"

gcloud run jobs deploy "${service}-migrate" \
  --project="$project_id" \
  --region="$region" \
  --image="$image" \
  --service-account="$service_account_email" \
  --env-vars-file="$environment_file" \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest \
  --command=node \
  --args=dist/src/database/migrate.js \
  --tasks=1 \
  --max-retries=0 \
  --task-timeout=10m \
  --memory=512Mi \
  --cpu=1

gcloud run jobs execute "${service}-migrate" \
  --project="$project_id" \
  --region="$region" \
  --wait

gcloud run deploy "$service" \
  --project="$project_id" \
  --region="$region" \
  --image="$image" \
  --service-account="$service_account_email" \
  --env-vars-file="$environment_file" \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest,JWT_ACCESS_SECRET=JWT_ACCESS_SECRET:latest,JWT_REFRESH_SECRET=JWT_REFRESH_SECRET:latest,SOLANA_KEYPAIR_ENCRYPTION_KEY=SOLANA_KEYPAIR_ENCRYPTION_KEY:latest,MOONPAY_PUBLIC_KEY=MOONPAY_PUBLIC_KEY:latest,MOONPAY_SECRET_KEY=MOONPAY_SECRET_KEY:latest,MOONPAY_WEBHOOK_SECRET=MOONPAY_WEBHOOK_SECRET:latest,STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest \
  --allow-unauthenticated \
  --ingress=all \
  --port=8080 \
  --cpu=1 \
  --memory=512Mi \
  --concurrency=20 \
  --min-instances=0 \
  --max-instances=2 \
  --timeout=60s \
  --cpu-throttling \
  --labels=app=mcbuse,component=api,environment=hackathon

service_url="$(gcloud run services describe "$service" --project="$project_id" --region="$region" --format='value(status.url)')"
curl -fsS "${service_url}/api/v1/health"
echo
echo "Cloud Run API deployed with merchant routes disabled and mock transfers enabled"
echo "service_url=$service_url"
