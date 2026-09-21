#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
project_id="${MCBUSE_GCP_PROJECT_ID:?Set MCBUSE_GCP_PROJECT_ID.}"
region="${MCBUSE_GCP_REGION:-europe-west1}"
repository="${MCBUSE_ARTIFACT_REPOSITORY:-mcbuse}"
service="${MCBUSE_RUN_SERVICE:-mcbuse-api}"
service_account_name="${MCBUSE_RUN_SERVICE_ACCOUNT:-mcbuse-api}"
service_account_email="${service_account_name}@${project_id}.iam.gserviceaccount.com"
scheduler_service_account_name="${MCBUSE_ANALYTICS_SCHEDULER_ACCOUNT:-mcbuse-analytics-scheduler}"
scheduler_service_account_email="${scheduler_service_account_name}@${project_id}.iam.gserviceaccount.com"
job="${service}-analytics"
scheduler="${service}-analytics-every-10-minutes"
# Keep the existing Scheduler ID so deployments update it rather than duplicate it.
analytics_schedule="${MCBUSE_ANALYTICS_SCHEDULE:-0 */6 * * *}"
worker_args="dist/src/analytics-intelligence/worker.js"
if [[ "${MCBUSE_ANALYTICS_MODE:-sweep}" == "queue" ]]; then
  job="${service}-analytics-queue"
  scheduler="${service}-analytics-queue-every-minute"
  analytics_schedule="* * * * *"
  worker_args="dist/src/analytics-intelligence/worker.js,--queue"
fi
analytics_scheduler_enabled="${MCBUSE_ANALYTICS_SCHEDULER_ENABLED:-true}"
environment_file="$repo_root/deploy/cloud-run/api.env.yaml"
analytics_allowlist="${MCBUSE_INTELLIGENCE_ALLOWLIST:-}"
ai_narration_enabled="${MCBUSE_AI_NARRATION_ENABLED:-false}"
if [[ -z "$analytics_allowlist" ]]; then
  echo "Set MCBUSE_INTELLIGENCE_ALLOWLIST to at least one pilot merchant ID or public ID." >&2
  exit 1
fi
if [[ ! "$analytics_allowlist" =~ ^[A-Za-z0-9,_-]*$ ]]; then
  echo "MCBUSE_INTELLIGENCE_ALLOWLIST may contain only IDs separated by commas." >&2
  exit 1
fi
if [[ "$ai_narration_enabled" != "true" && "$ai_narration_enabled" != "false" ]]; then
  echo "MCBUSE_AI_NARRATION_ENABLED must be true or false." >&2
  exit 1
fi
if [[ "$analytics_scheduler_enabled" != "true" && "$analytics_scheduler_enabled" != "false" ]]; then
  echo "MCBUSE_ANALYTICS_SCHEDULER_ENABLED must be true or false." >&2
  exit 1
fi
runtime_environment_file="$(mktemp)"
trap 'rm -f "$runtime_environment_file"' EXIT
sed -e '/^DATABASE_POOL_MAX:/d' -e '/^MERCHANT_INTELLIGENCE_ENABLED:/d' -e '/^MERCHANT_INTELLIGENCE_ALLOWLIST:/d' -e '/^MERCHANT_AI_NARRATION_ENABLED:/d' "$environment_file" >"$runtime_environment_file"
printf '\nDATABASE_POOL_MAX: "2"\nMERCHANT_INTELLIGENCE_ENABLED: "true"\nMERCHANT_INTELLIGENCE_ALLOWLIST: "%s"\nMERCHANT_AI_NARRATION_ENABLED: "%s"\n' "$analytics_allowlist" "$ai_narration_enabled" >>"$runtime_environment_file"

required_secrets=(DATABASE_URL)
secret_binding="DATABASE_URL=DATABASE_URL:latest"
if [[ "$ai_narration_enabled" == "true" ]]; then
  required_secrets+=(GROQ_API_KEY)
  secret_binding+=",GROQ_API_KEY=GROQ_API_KEY:latest"
fi
for secret_name in "${required_secrets[@]}"; do
  if [[ -z "$(gcloud secrets versions list "$secret_name" --project="$project_id" --filter='state=ENABLED' --limit=1 --format='value(name)')" ]]; then
    echo "Secret $secret_name has no enabled version in project $project_id." >&2
    exit 1
  fi
done

if [[ "$ai_narration_enabled" == "true" ]]; then
  gcloud secrets add-iam-policy-binding GROQ_API_KEY \
    --project="$project_id" \
    --member="serviceAccount:${service_account_email}" \
    --role=roles/secretmanager.secretAccessor >/dev/null
fi

gcloud services enable cloudscheduler.googleapis.com --project="$project_id" >/dev/null

image="$(gcloud run services describe "$service" --project="$project_id" --region="$region" --format='value(spec.template.spec.containers[0].image)')"
if [[ -z "$image" ]]; then
  echo "Could not resolve the deployed API image." >&2
  exit 1
fi

gcloud run jobs deploy "$job" \
  --project="$project_id" \
  --region="$region" \
  --image="$image" \
  --service-account="$service_account_email" \
  --env-vars-file="$runtime_environment_file" \
  --set-secrets="$secret_binding" \
  --command=node \
  --args="$worker_args" \
  --tasks=1 \
  --parallelism=1 \
  --max-retries=1 \
  --task-timeout=5m \
  --memory=512Mi \
  --cpu=1

if ! gcloud iam service-accounts describe "$scheduler_service_account_email" --project="$project_id" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$scheduler_service_account_name" --project="$project_id" --display-name="MCBuse analytics scheduler"
fi

gcloud run jobs add-iam-policy-binding "$job" \
  --project="$project_id" \
  --region="$region" \
  --member="serviceAccount:${scheduler_service_account_email}" \
  --role=roles/run.invoker >/dev/null

scheduler_uri="https://run.googleapis.com/v2/projects/${project_id}/locations/${region}/jobs/${job}:run"
scheduler_state="$(gcloud scheduler jobs describe "$scheduler" --project="$project_id" --location="$region" --format='value(state)' 2>/dev/null || true)"
if [[ "$analytics_scheduler_enabled" == "true" ]]; then
  if [[ -n "$scheduler_state" ]]; then
    gcloud scheduler jobs update http "$scheduler" --project="$project_id" --location="$region" --schedule="$analytics_schedule" --uri="$scheduler_uri" --http-method=POST --oauth-service-account-email="$scheduler_service_account_email" --oauth-token-scope=https://www.googleapis.com/auth/cloud-platform
    if [[ "$scheduler_state" == "PAUSED" ]]; then
      gcloud scheduler jobs resume "$scheduler" --project="$project_id" --location="$region"
    fi
  else
    gcloud scheduler jobs create http "$scheduler" --project="$project_id" --location="$region" --schedule="$analytics_schedule" --uri="$scheduler_uri" --http-method=POST --oauth-service-account-email="$scheduler_service_account_email" --oauth-token-scope=https://www.googleapis.com/auth/cloud-platform
  fi
elif [[ -n "$scheduler_state" && "$scheduler_state" != "PAUSED" ]]; then
  gcloud scheduler jobs pause "$scheduler" --project="$project_id" --location="$region"
fi

# A deployment changes the enablement/allowlist. Seed the leased queue once now;
# normal minute executions consume only changes, and the six-hour sweep remains.
gcloud run jobs execute "$job" --project="$project_id" --region="$region" --args=dist/src/analytics-intelligence/worker.js --wait

echo "analytics_job=$job"
echo "scheduler_job=$scheduler"
echo "analytics_scheduler_enabled=$analytics_scheduler_enabled"
echo "analytics_schedule=$analytics_schedule (used only when scheduling is enabled)"
echo "narration remains controlled by MERCHANT_AI_NARRATION_ENABLED"
