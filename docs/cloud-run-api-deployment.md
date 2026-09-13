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
- Ready revision: `mcbuse-api-00010-wmf`
- Image digest: `sha256:796a15daf53cdd64be9c79aa49c926bc463f092aa72dadab7eb38dbe51210185`
- API base URL: `https://mcbuse-api-332810840225.europe-west1.run.app/api/v1`
- Runtime identity: `mcbuse-api@mcbuse-hackathon-2026-fno.iam.gserviceaccount.com`
- Merchant routes: enabled after merchant provisioning
- Transfer provider: `mock` pending the real devnet gate

### Merchant portal

- Service: `mcbuse-portal`
- Ready revision: `mcbuse-portal-00001-4cx`
- Image: `europe-west1-docker.pkg.dev/mcbuse-hackathon-2026-fno/mcbuse/portal:20260912T151506Z-bcb53e94`
- Image digest: `sha256:6a9f96866430fd20f8807c54dda9bcbd1301d724dc25716fe8de1117b4f75ece`
- Public URL: `https://mcbuse-portal-332810840225.europe-west1.run.app`
- Runtime identity: `mcbuse-portal@mcbuse-hackathon-2026-fno.iam.gserviceaccount.com`
- Traffic: 100% to the ready revision
- Sensitive runtime secrets: none; authentication credentials and tokens are exchanged server-side with the API and session tokens remain in HTTP-only secure cookies

Deploy the portal independently with:

```bash
MCBUSE_GCP_PROJECT_ID=mcbuse-hackathon-2026-fno pnpm deploy:portal:cloud-run
```

The portal deployment supplies only the API URL, canonical portal origin, secure-cookie setting, and optional public authentication background URL. Do not copy API database, JWT, Stripe, encryption, or wallet secrets into the portal service.

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
Manager. The retained `deploy:api:cloud-run:import-secrets` command is only a
legacy one-time cutover helper for an operator migrating an existing Fly service;
it preserves existing GCP versions by default and is not used for normal deploys.

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
3. In Stripe test mode, [update the existing MCBuse webhook](https://docs.stripe.com/api/webhook_endpoints/update) to the Cloud Run `/api/v1/onramp/webhooks/stripe` URL. Preserve its signing secret, confirm `checkout.session.completed` is enabled, and disable stale Fly or tunnel endpoints so completion is delivered exactly once to the active API.
4. Run `merchant:hosted-infra-readiness` with the dedicated project and Cloud Run API base URL; require every check to pass.
5. Point the local portal server-side API URL and the development mobile app at Cloud Run.
6. Provision or confirm the merchant membership.
7. Enable `MERCHANT_PORTAL_ENABLED=true` only after the protected merchant smoke test passes.
8. Keep `TRANSFER_PROVIDER=mock` until the devnet payer has SOL and official devnet USDC and the signing key is verified.
9. Execute the three-payment finalized acceptance flow.
10. Retire any remaining legacy Fly configuration only after the acceptance evidence is complete; do not use it for new deployments.

Do not place database dumps, service-account keys, or exported secret values in Git.
