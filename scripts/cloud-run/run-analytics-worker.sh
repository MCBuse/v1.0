#!/usr/bin/env bash
set -euo pipefail

project_id="${MCBUSE_GCP_PROJECT_ID:-mcbuse-hackathon-2026-fno}"
region="${MCBUSE_GCP_REGION:-europe-west1}"
service="${MCBUSE_RUN_SERVICE:-mcbuse-api}"

echo "Running analytics once in project $project_id ($region)."
gcloud run jobs execute "${service}-analytics" \
  --project="$project_id" \
  --region="$region" \
  --wait
