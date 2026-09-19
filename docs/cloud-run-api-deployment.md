# Cloud Run API deployment

Cloud Run is the active API deployment target. The dedicated project is `mcbuse-hackathon-2026-fno` in `europe-west1`; do not use or modify unrelated GCP projects, including Booksie.

Cloud Run's free tier reduces compute cost for a low-traffic hackathon API, but Google still requires a billing-enabled project. Use a dedicated MCBuse project rather than an unrelated existing project. The default configuration uses `europe-west1`, request-based CPU allocation, zero minimum instances, two maximum instances, one vCPU, 512 MiB memory, and a five-connection database pool per instance.

## Safety state

- The deployment defaults to `TRANSFER_PROVIDER=mock`.
- The deployment defaults to `MERCHANT_PORTAL_ENABLED=false`.
- Database migration runs as a one-task Cloud Run Job before the service revision is deployed.
- The deploy script refuses to run without a verified backup archive and checksum.
- Runtime secrets are read from Secret Manager and are never written to the repository or printed by the deployment command.
- `DATABASE_SSL=no-verify` is a temporary managed-Postgres compatibility setting. Replace it with verified CA configuration after the hackathon cutover.

## Current deployment

- Service: `mcbuse-api`
- Ready revision: `mcbuse-api-00038-5mr`
- Image: `europe-west1-docker.pkg.dev/mcbuse-hackathon-2026-fno/mcbuse/api:20260918T0930Z-import-idempotency`
- Image digest: `sha256:316a9671561618c08a65022b2cc2e5b0aa8a5b3a01c92fdbbe7fa15cfa997c97`
- API base URL: `https://mcbuse-api-332810840225.europe-west1.run.app/api/v1`
- API custom URL: `https://api.mcbuse.com/api/v1` (the Cloud Run URL remains supported)
- Runtime identity: `mcbuse-api@mcbuse-hackathon-2026-fno.iam.gserviceaccount.com`
- Merchant routes: enabled after merchant provisioning
- Transfer provider: `mock` pending the real devnet gate

### Merchant portal

- Service: `mcbuse-portal`
- Ready revision: `mcbuse-portal-00023-nsq`
- Image: `europe-west1-docker.pkg.dev/mcbuse-hackathon-2026-fno/mcbuse/portal:20260918T1010Z-product-update-quantity-fix`
- Image digest: `sha256:ee6ebbc4ac9dfb7ce855bac0db87f6c4a4cfc8abb44337cf5f0665f21f765b0a`
- Public URL: `https://mcbuse-portal-332810840225.europe-west1.run.app`
- Canonical custom URL: `https://merchant.mcbuse.com` (the Cloud Run URL remains an allowed portal origin)
- Runtime identity: `mcbuse-portal@mcbuse-hackathon-2026-fno.iam.gserviceaccount.com`
- Traffic: 100% to the ready revision
- Sensitive runtime secrets: none; authentication credentials and tokens are exchanged server-side with the API and session tokens remain in HTTP-only secure cookies

Deploy the portal independently with:

```bash
pnpm deploy:portal:cloud-run
```

The portal deployment defaults to the dedicated
`mcbuse-hackathon-2026-fno` project and supplies only the API URL, canonical
portal origin, secure-cookie setting, and optional public authentication
background URL. Use `MCBUSE_GCP_PROJECT_ID` only when an explicit project
override is needed. Do not copy API database, JWT, Stripe, encryption, or wallet
secrets into the portal service.

For the custom-domain release, configure the portal with
`MCBUSE_API_URL=https://api.mcbuse.com/api/v1`,
`MCBUSE_PORTAL_ORIGIN=https://merchant.mcbuse.com`, and `PORTAL_ORIGINS` containing
both that URL and the generated Cloud Run portal URL. Stripe continues to use
its existing regional Cloud Run webhook URL; it is an official alias of the
same API service and remains covered by the readiness check.

## One-time project setup

Choose a dedicated billing-enabled project, then run:

```bash
export MCBUSE_GCP_PROJECT_ID="your-dedicated-project-id"
export MCBUSE_GCP_REGION="europe-west1"
pnpm deploy:api:cloud-run:bootstrap
```

The bootstrap command enables Cloud Run, Cloud Build, Artifact Registry, Secret
Manager, and IAM, then creates the `mcbuse` Docker repository and `mcbuse-api`
runtime service account. Create required secret versions directly in Secret
Manager.

Before deploying the merchant workspace, provision its separate private evidence
bucket. This bucket is distinct from public product images and grants access only
to the API runtime identity:

```bash
export MCBUSE_GCP_PROJECT_ID="your-dedicated-project-id"
bash scripts/cloud-run/provision-merchant-evidence.sh
```

## Build, migrate, and deploy

Use the pre-migration backup created for this cutover:

```bash
export MCBUSE_GCP_PROJECT_ID="your-dedicated-project-id"
export MCBUSE_BACKUP_DIR="/absolute/path/to/verified-backup"
pnpm deploy:api:cloud-run
```

The command verifies the backup checksum, verifies every required Secret Manager version, builds `Dockerfile.api`, executes the additive Drizzle migrations, deploys the API, and checks `/api/v1/health`.

## Cutover order

1. Confirm the Cloud Run health response and database status.
2. Run existing API and mobile regression checks against the Cloud Run URL.
3. In Stripe test mode, [update the existing MCBuse webhook](https://docs.stripe.com/api/webhook_endpoints/update) to the Cloud Run `/api/v1/onramp/webhooks/stripe` URL. Preserve its signing secret, confirm `checkout.session.completed` is enabled, and disable any stale endpoint so completion is delivered exactly once to the active API.
4. Run `merchant:hosted-infra-readiness` with the dedicated project and Cloud Run API base URL; require every check to pass.
5. Point the local portal server-side API URL and the development mobile app at Cloud Run.
6. Provision or confirm the merchant membership.
7. Enable `MERCHANT_PORTAL_ENABLED=true` only after the protected merchant smoke test passes.
8. Keep `TRANSFER_PROVIDER=mock` until the devnet payer has SOL and official devnet USDC and the signing key is verified.
9. Execute the three-payment finalized acceptance flow.

Do not place database dumps, service-account keys, or exported secret values in Git.
