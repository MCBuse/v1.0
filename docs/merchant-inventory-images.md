# Merchant product image storage

The inventory API stores one normalized WebP image per product in Google Cloud
Storage. Product images are public catalogue media; customer, wallet, invoice,
and payment data never enter this bucket.

Before a release, provision the bucket once:

```sh
MCBUSE_GCP_PROJECT_ID=your-project \
  bash scripts/cloud-run/provision-product-images.sh
```

The script creates `${PROJECT_ID}-merchant-products` by default, grants the
API runtime service account object-write access, and grants public read access
for product thumbnails in the portal and authenticated mobile app. Set
`MCBUSE_PRODUCT_IMAGE_BUCKET` to use a different globally unique bucket name.

The API requires `PRODUCT_IMAGE_BUCKET` at runtime. The Cloud Run deployment
script now validates the bucket and passes this variable to the API service.
