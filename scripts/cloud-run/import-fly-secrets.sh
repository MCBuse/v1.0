#!/usr/bin/env bash
set -euo pipefail

project_id="${MCBUSE_GCP_PROJECT_ID:?Set MCBUSE_GCP_PROJECT_ID to the dedicated GCP project.}"
fly_app="${MCBUSE_FLY_APP:-mcbuse-api}"
service_account_name="${MCBUSE_RUN_SERVICE_ACCOUNT:-mcbuse-api}"
service_account_email="${service_account_name}@${project_id}.iam.gserviceaccount.com"
rotate_secrets="${MCBUSE_ROTATE_SECRETS:-false}"

secret_names=(
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

curl -fsS "https://${fly_app}.fly.dev/api/v1/health" >/dev/null

for secret_name in "${secret_names[@]}"; do
  if ! gcloud secrets describe "$secret_name" --project="$project_id" >/dev/null 2>&1; then
    gcloud secrets create "$secret_name" \
      --project="$project_id" \
      --replication-policy=automatic >/dev/null
  fi

  existing_version="$(gcloud secrets versions list "$secret_name" \
    --project="$project_id" \
    --filter='state=ENABLED' \
    --limit=1 \
    --format='value(name)')"

  if [[ -n "$existing_version" && "$rotate_secrets" != "true" ]]; then
    echo "Keeping existing version for $secret_name"
  else
    remote_command="node -e 'process.stdout.write(process.env[process.argv[1]] || \"\")' ${secret_name}"
    secret_value="$(fly ssh console -a "$fly_app" -C "$remote_command" 2>/dev/null)"
    secret_value="${secret_value##*$'\n'}"

    if [[ -z "$secret_value" ]]; then
      echo "Fly secret $secret_name is empty or unavailable; no GCP version was created." >&2
      exit 1
    fi

    printf '%s' "$secret_value" | gcloud secrets versions add "$secret_name" \
      --project="$project_id" \
      --data-file=- >/dev/null
    unset secret_value
    echo "Imported $secret_name"
  fi

  gcloud secrets add-iam-policy-binding "$secret_name" \
    --project="$project_id" \
    --member="serviceAccount:${service_account_email}" \
    --role=roles/secretmanager.secretAccessor >/dev/null
done

echo "Secret Manager values and runtime access are ready"
