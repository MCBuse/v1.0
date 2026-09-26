#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
local_env_file="${MCBUSE_ENV_FILE:-$repo_root/.env.local}"
project_id_from_shell="${MCBUSE_GCP_PROJECT_ID-}"
region_from_shell="${MCBUSE_GCP_REGION-}"
backup_dir_from_shell="${MCBUSE_BACKUP_DIR-}"
project_id_was_set="${MCBUSE_GCP_PROJECT_ID+x}"
region_was_set="${MCBUSE_GCP_REGION+x}"
backup_dir_was_set="${MCBUSE_BACKUP_DIR+x}"

# Keep personal deployment defaults out of Git while allowing an explicit
# environment variable to take precedence (for CI or one-off releases).
if [[ -f "$local_env_file" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$local_env_file"
  set +a
fi

if [[ "$project_id_was_set" == x ]]; then export MCBUSE_GCP_PROJECT_ID="$project_id_from_shell"; fi
if [[ "$region_was_set" == x ]]; then export MCBUSE_GCP_REGION="$region_from_shell"; fi
if [[ "$backup_dir_was_set" == x ]]; then export MCBUSE_BACKUP_DIR="$backup_dir_from_shell"; fi

project_id="${MCBUSE_GCP_PROJECT_ID:?Set MCBUSE_GCP_PROJECT_ID to the dedicated GCP project.}"
backup_dir="${MCBUSE_BACKUP_DIR:?Set MCBUSE_BACKUP_DIR to the verified pre-migration backup directory.}"
region="${MCBUSE_GCP_REGION:-europe-west1}"
repository="${MCBUSE_ARTIFACT_REPOSITORY:-mcbuse}"
service="${MCBUSE_RUN_SERVICE:-mcbuse-api}"
service_account_name="${MCBUSE_RUN_SERVICE_ACCOUNT:-mcbuse-api}"
service_account_email="${service_account_name}@${project_id}.iam.gserviceaccount.com"
product_image_bucket="${MCBUSE_PRODUCT_IMAGE_BUCKET:-${project_id}-merchant-products}"
merchant_evidence_bucket="${MCBUSE_MERCHANT_EVIDENCE_BUCKET:-${project_id}-merchant-evidence}"
environment_file="$repo_root/deploy/cloud-run/api.env.yaml"
runtime_environment_file="$(mktemp)"
previous_service_file="$(mktemp)"
trap 'rm -f "$runtime_environment_file" "$previous_service_file"' EXIT
cp "$environment_file" "$runtime_environment_file"
printf '\nPRODUCT_IMAGE_BUCKET: "%s"\n' "$product_image_bucket" >>"$runtime_environment_file"
printf 'MERCHANT_EVIDENCE_BUCKET: "%s"\n' "$merchant_evidence_bucket" >>"$runtime_environment_file"

if [[ ! -f "$backup_dir/database.dump" || ! -f "$backup_dir/SHA256SUMS" ]]; then
  echo "The backup directory must contain database.dump and SHA256SUMS." >&2
  exit 1
fi

(cd "$backup_dir" && shasum -a 256 -c SHA256SUMS)

if ! gcloud storage buckets describe "gs://${product_image_bucket}" --project="$project_id" >/dev/null 2>&1; then
  echo "Product image bucket gs://${product_image_bucket} is missing. Run scripts/cloud-run/provision-product-images.sh first." >&2
  exit 1
fi

if ! gcloud storage buckets describe "gs://${merchant_evidence_bucket}" --project="$project_id" >/dev/null 2>&1; then
  echo "Private evidence bucket gs://${merchant_evidence_bucket} is missing. Run scripts/cloud-run/provision-merchant-evidence.sh first." >&2
  exit 1
fi

required_secrets=(
  DATABASE_URL
  JWT_ACCESS_SECRET
  JWT_REFRESH_SECRET
  SOLANA_KEYPAIR_ENCRYPTION_KEY
  SOLANA_TREASURY_SECRET_KEY
  MOONPAY_PUBLIC_KEY
  MOONPAY_SECRET_KEY
  MOONPAY_WEBHOOK_SECRET
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  SMTP_PASSWORD
  OPS_MONITORING_TOKEN
)

for secret_name in "${required_secrets[@]}"; do
  if [[ -z "$(gcloud secrets versions list "$secret_name" --project="$project_id" --filter='state=ENABLED' --limit=1 --format='value(name)')" ]]; then
    echo "Secret $secret_name has no enabled version in project $project_id." >&2
    exit 1
  fi
done

# Preserve every configured wallet key reference and the selected signing version.
# Reading a service manifest reads references only, never Secret Manager payloads.
gcloud run services describe "$service" --project="$project_id" --region="$region" --format=json > "$previous_service_file"
secret_binding="$(python3 - "$previous_service_file" "$runtime_environment_file" <<'PY_KEYS'
import json,sys
names=['DATABASE_URL','JWT_ACCESS_SECRET','JWT_REFRESH_SECRET','SOLANA_KEYPAIR_ENCRYPTION_KEY','SOLANA_TREASURY_SECRET_KEY','MOONPAY_PUBLIC_KEY','MOONPAY_SECRET_KEY','MOONPAY_WEBHOOK_SECRET','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','SMTP_PASSWORD','OPS_MONITORING_TOKEN']
bindings={name:f'{name}:latest' for name in names}
for entry in json.load(open(sys.argv[1]))['spec']['template']['spec']['containers'][0].get('env',[]):
    name=entry['name']
    if name in {'CREDIT_SCORING_URL', 'CREDIT_SCORING_AUDIENCE'}:
        with open(sys.argv[2],'a') as target: target.write(f'\n{name}: {json.dumps(entry["value"])}\n')
        continue
    if name == 'CREDIT_SCORING_TOKEN':
        secret=entry.get('valueFrom',{}).get('secretKeyRef')
        if not secret:
            raise SystemExit('Move the credit scoring token to Secret Manager before deploying')
        bindings[name]=f"{secret['name']}:{secret['key']}"
        continue
    if not name.startswith('SOLANA_KEYPAIR_ENCRYPTION_KEY'): continue
    secret=entry.get('valueFrom',{}).get('secretKeyRef')
    if secret:
        bindings[name]=f"{secret['name']}:{secret['key']}"
    elif name=='SOLANA_KEYPAIR_ENCRYPTION_KEY_CURRENT':
        with open(sys.argv[2],'a') as target: target.write(f'\n{name}: {json.dumps(entry["value"])}\n')
    else:
        raise SystemExit('Move plaintext wallet encryption keys to Secret Manager before deploying')
print(','.join(f'{name}={value}' for name,value in bindings.items()))
PY_KEYS
)"

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
  --env-vars-file="$runtime_environment_file" \
  --set-secrets="$secret_binding" \
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
echo "Cloud Run API deployed with sandbox settlement and new money initiation disabled"
echo "service_url=$service_url"
