#!/usr/bin/env bash
set -euo pipefail

project_id="${MCBUSE_GCP_PROJECT_ID:?Set MCBUSE_GCP_PROJECT_ID to a dedicated GCP project.}"
region="${MCBUSE_GCP_REGION:-europe-west1}"
repository="${MCBUSE_ARTIFACT_REPOSITORY:-mcbuse}"
service_account_name="${MCBUSE_RUN_SERVICE_ACCOUNT:-mcbuse-api}"
service_account_email="${service_account_name}@${project_id}.iam.gserviceaccount.com"

gcloud projects describe "$project_id" >/dev/null

billing_enabled="$(gcloud billing projects describe "$project_id" --format='value(billingEnabled)')"
if [[ "$billing_enabled" != "True" && "$billing_enabled" != "true" ]]; then
  echo "GCP project $project_id is not billing-enabled. Cloud Run requires billing even when usage remains within the free tier." >&2
  exit 1
fi

gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  --project="$project_id"

if ! gcloud artifacts repositories describe "$repository" --location="$region" --project="$project_id" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$repository" \
    --project="$project_id" \
    --location="$region" \
    --repository-format=docker \
    --description="MCBuse deployable containers"
fi

if ! gcloud iam service-accounts describe "$service_account_email" --project="$project_id" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$service_account_name" \
    --project="$project_id" \
    --display-name="MCBuse API runtime"
fi

echo "Cloud Run foundation ready"
echo "project=$project_id"
echo "region=$region"
echo "repository=$repository"
echo "service_account=$service_account_email"
