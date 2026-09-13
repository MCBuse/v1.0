#!/usr/bin/env bash
set -euo pipefail

project_id="${MCBUSE_GCP_PROJECT_ID:?Set MCBUSE_GCP_PROJECT_ID to the dedicated GCP project.}"
region="${MCBUSE_GCP_REGION:-europe-west1}"
bucket="${MCBUSE_PRODUCT_IMAGE_BUCKET:-${project_id}-merchant-products}"
service_account_name="${MCBUSE_RUN_SERVICE_ACCOUNT:-mcbuse-api}"
service_account_email="${service_account_name}@${project_id}.iam.gserviceaccount.com"

gcloud services enable storage.googleapis.com --project="$project_id"

if ! gcloud storage buckets describe "gs://${bucket}" --project="$project_id" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${bucket}" \
    --project="$project_id" \
    --location="$region" \
    --uniform-bucket-level-access
fi

# Product images are merchant catalogue media, not customer or payment data.
# The API is the only writer; public reads allow portal and mobile rendering.
gcloud storage buckets update "gs://${bucket}" \
  --project="$project_id" \
  --no-public-access-prevention
gcloud storage buckets add-iam-policy-binding "gs://${bucket}" \
  --project="$project_id" \
  --member="serviceAccount:${service_account_email}" \
  --role="roles/storage.objectAdmin"
gcloud storage buckets add-iam-policy-binding "gs://${bucket}" \
  --project="$project_id" \
  --member="allUsers" \
  --role="roles/storage.objectViewer"

echo "Merchant product image storage is ready"
echo "bucket=${bucket}"
