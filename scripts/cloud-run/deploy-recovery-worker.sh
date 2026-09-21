#!/usr/bin/env bash
set -euo pipefail
# Reuse the verified API revision and its secret references; never copy secret payloads.
project_id="${MCBUSE_GCP_PROJECT_ID:?Set MCBUSE_GCP_PROJECT_ID}"
region="${MCBUSE_GCP_REGION:-europe-west1}"
service="${MCBUSE_RUN_SERVICE:-mcbuse-api}"
job="${service}-financial-recovery"
scheduler="${job}-every-minute"
scheduler_account="${MCBUSE_ANALYTICS_SCHEDULER_ACCOUNT:-mcbuse-analytics-scheduler}@${project_id}.iam.gserviceaccount.com"
manifest="$(mktemp)"
service_manifest="$(mktemp)"
trap 'rm -f "$manifest" "$service_manifest"' EXIT
gcloud run services describe "$service" --project="$project_id" --region="$region" --format=json > "$service_manifest"
python3 - "$service_manifest" "$manifest" "$job" "$project_id" <<'PY'
import json,sys
service=json.load(open(sys.argv[1]))['spec']['template']['spec']
container=service['containers'][0]
container.pop('ports',None);container.pop('startupProbe',None);container.pop('livenessProbe',None)
container['command']=['node'];container['args']=['dist/src/accounts/recovery-worker.js']
container['env']=[item for item in container.get('env',[]) if item['name'] not in ['PROCESS_ROLE','DATABASE_POOL_MAX']]+[{'name':'PROCESS_ROLE','value':'recovery-job'},{'name':'DATABASE_POOL_MAX','value':'3'}]
spec={'apiVersion':'run.googleapis.com/v1','kind':'Job','metadata':{'name':sys.argv[3],'namespace':sys.argv[4]},'spec':{'template':{'spec':{'taskCount':1,'parallelism':1,'template':{'spec':{'serviceAccountName':service['serviceAccountName'],'maxRetries':1,'timeoutSeconds':'240','containers':[container]}}}}}}
json.dump(spec,open(sys.argv[2],'w'))
PY
gcloud services enable cloudresourcemanager.googleapis.com cloudscheduler.googleapis.com --project="$project_id" >/dev/null
gcloud run jobs replace "$manifest" --project="$project_id" --region="$region"
if ! gcloud iam service-accounts describe "$scheduler_account" --project="$project_id" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${scheduler_account%%@*}" --project="$project_id" --display-name="MCBuse recovery scheduler"
fi
gcloud run jobs add-iam-policy-binding "$job" --project="$project_id" --region="$region" --member="serviceAccount:$scheduler_account" --role=roles/run.invoker >/dev/null
scheduler_uri="https://run.googleapis.com/v2/projects/${project_id}/locations/${region}/jobs/${job}:run"
if gcloud scheduler jobs describe "$scheduler" --project="$project_id" --location="$region" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "$scheduler" --project="$project_id" --location="$region" --schedule='* * * * *' --uri="$scheduler_uri" --http-method=POST --oauth-service-account-email="$scheduler_account"
else
  gcloud scheduler jobs create http "$scheduler" --project="$project_id" --location="$region" --schedule='* * * * *' --uri="$scheduler_uri" --http-method=POST --oauth-service-account-email="$scheduler_account"
fi
if [[ "$(gcloud scheduler jobs describe "$scheduler" --project="$project_id" --location="$region" --format='value(state)')" == "PAUSED" ]]; then
  gcloud scheduler jobs resume "$scheduler" --project="$project_id" --location="$region"
fi
