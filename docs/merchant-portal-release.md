# Merchant portal release gate

For the active GCP deployment, see [Cloud Run API deployment](./cloud-run-api-deployment.md).

The portal runs locally on port 3001 and is deployed at `https://mcbuse-portal-332810840225.europe-west1.run.app`. Portal revision `mcbuse-portal-00001-4cx` serves 100% of traffic. The MCBuse API Cloud Run service has `MERCHANT_PORTAL_ENABLED=true`; fresh full API deployments still fail safe with the repository default set to false until the protected smoke gate is repeated.

## Local acceptance before hosted work

Build the API, ensure the disposable local PostgreSQL database is migrated, and run:

```text
pnpm --filter api merchant:week2-recovery-smoke
```

The command refuses non-local API and database hosts. It creates ephemeral merchant and payer fixtures, runs three EUR payments through the public API, retries each payment with the same idempotency key, rejects reuse of that key by another payer or for another QR nonce, persists one submitted payment across an API restart on port 4011, and verifies exactly three canonical records, ledger entries, attempts, receipts, and balance movements. It also proves that a stale unsigned attempt fails safely and releases its reserved balance. It then removes every temporary user, merchant, request, transaction, ledger entry, token, wallet, and balance. No real credentials are required or stored.

## 1. Back up the hosted database

Use the Supabase project backup controls or a credential-safe logical dump. Record the backup path or identifier, size, checksum, and successful archive verification before continuing. Do not place credentials or database dumps in the repository.

## 2. Deploy the additive API migration behind the flag

Use a dedicated, billing-enabled GCP project. Bootstrap Cloud Run, create the
required secret versions directly in Secret Manager, then deploy from the
repository root:

```text
export MCBUSE_GCP_PROJECT_ID="your-dedicated-project-id"
export MCBUSE_BACKUP_DIR="/absolute/path/to/verified-backup"
pnpm deploy:api:cloud-run:bootstrap
pnpm deploy:api:cloud-run
```

The Cloud Run migration job applies `0008_merchant_portal.sql` before deploying the service. With the flag false, merchant endpoints return not found. The Cloud Run deployment is the active API target.

The repository retains `deploy:api:cloud-run:import-secrets` only as a legacy
one-time cutover helper for operators who still have a Fly deployment. It is not
part of normal MCBuse deployment or secret rotation.

## 3. Provision an existing account

Run this only from a trusted environment that already has the database configuration:

```text
pnpm --filter api merchant:provision -- --email merchant@example.com --business-name "Business name"
```

The command is idempotent and links the user’s existing routine wallet. It never creates credentials or prints wallet keys.

## 4. Enable the API

```text
gcloud run services update mcbuse-api \
  --project="$MCBUSE_GCP_PROJECT_ID" \
  --region="${MCBUSE_GCP_REGION:-europe-west1}" \
  --update-env-vars=MERCHANT_PORTAL_ENABLED=true
```

Start the local portal with `pnpm dev:portal` and sign in at `http://localhost:3001`, or use the deployed portal at `https://mcbuse-portal-332810840225.europe-west1.run.app`.
The portal validates merchant membership before setting cookies, validates the
access token before rendering protected routes, rotates refresh tokens in a
same-origin route handler, and clears rejected sessions without exposing either
token to browser JavaScript.

The deployed portal uses a dedicated least-privilege Cloud Run runtime identity and receives no database, JWT, Stripe, encryption, or wallet secret. Its production configuration points server-side requests to the Cloud Run API, fixes redirects and mutation validation to the canonical portal origin, and requires secure session cookies.

## 5. Real devnet transfer gate

Keep `TRANSFER_PROVIDER=mock` until the non-production mobile payer has devnet SOL for fees, devnet USDC, and the encrypted custodial key configuration has been confirmed. Then set `TRANSFER_PROVIDER=solana`, verify API health, and complete three scan-and-pay repetitions. Each repetition must produce one finalized canonical merchant transaction and one portal update with no reload.

First verify the hosted infrastructure without printing any secret value:

```text
MCBUSE_GCP_PROJECT_ID=mcbuse-hackathon-2026-fno \
  pnpm --filter api merchant:hosted-infra-readiness -- \
  --api-base-url https://mcbuse-api-332810840225.europe-west1.run.app/api/v1
```

This check fails closed unless the latest revision has all traffic, merchant routes are enabled, transfers remain mocked, Solana and the USDC mint use devnet, Stripe uses a test key with a configured signing secret, exactly one relevant enabled checkout-completion webhook targets the supplied Cloud Run URL, and API/database health is `ok`.

Check the deployed key compatibility and on-chain funding without printing the wallet key or address:

```text
MCBUSE_GCP_PROJECT_ID=mcbuse-hackathon-2026-fno \
  pnpm --filter api merchant:devnet-readiness -- \
  --payer-email payer@example.com \
  --merchant-email merchant@example.com
```

The command fails closed unless the payer and merchant are separate active accounts, the stored payer key decrypts with the deployed Secret Manager key, the derived public key matches the stored wallet, the merchant can receive an internal USDC credit, and the payer has at least 0.01 devnet SOL plus 5 USDC in both its devnet routine wallet and internal routine-wallet balance. It prints balances and booleans only—never account email, wallet address, or key material.

Prepare the payer without editing the database:

1. Sign in to the mobile app with a separate non-production payer account.
2. From **Home**, tap **Receive**, then tap the **Routine address** row. The full address is copied to the clipboard; do not copy it into logs, tickets, or this repository.
3. Paste that address into the official [Solana devnet faucet](https://faucet.solana.com/) and request devnet SOL. Devnet assets have no real-world value. Confirm that the account has at least `0.01 SOL` before proceeding.
4. Paste the same address into the official [Circle faucet](https://faucet.circle.com/), select **Solana Devnet** and **USDC**, and request funds. Confirm that the account has at least `5 USDC` on-chain. Circle's [Solana devnet guide](https://developers.circle.com/stablecoins/quickstart-transfer-10-usdc-on-solana) documents this faucet flow and the test USDC contract.
5. In the mobile app, tap **Top Up** and complete the test on-ramp so the value appears in **Holding Account**. Under **Holding Account**, tap **Move**, keep the direction **Holding Account → Routine Account**, select USD, and move at least `$5`.
6. Run `merchant:devnet-readiness` again. Do not change `TRANSFER_PROVIDER` until every check returns ready.

The faucet funds the on-chain wallet, while **Top Up** and **Move** establish the API's internal routine balance. Both are required; the internal transfer is ledger-only and does not replace on-chain funding.

For the current GCP deployment, the Stripe key was verified as test mode without printing it, the stored signing secret is present, and exactly one enabled checkout-completion webhook targets the Cloud Run on-ramp endpoint. The former Fly webhook was migrated in place so its signing secret stayed valid, and the stale ngrok endpoint was disabled. Recheck these conditions after any API-host or Stripe-account change; never use a live-mode card charge to prepare a hackathon payer.

The API reserves the payer's internal routine balance atomically with the merchant request claim, preventing a concurrent spend from invalidating database settlement after USDC has moved. Before broadcasting, it signs the transaction and durably stores its deterministic signature. A persistence failure prevents broadcast and releases the reservation; a failure after broadcast keeps the reservation and leaves the signature available to the reconciliation worker, which finalizes the ledger, request, balances, and merchant transaction exactly once. Delayed confirmation is shown as an actionable pending problem rather than being falsely marked failed.

Use a unique, non-sensitive description prefix for the three final mobile payments. After all three appear as received in the portal, verify the hosted canonical records without printing account identifiers, wallet addresses, idempotency keys, or transaction signatures:

```text
MCBUSE_GCP_PROJECT_ID=mcbuse-hackathon-2026-fno \
  pnpm --filter api merchant:hosted-acceptance -- \
  --merchant-email merchant@example.com \
  --description-prefix "Week 2 live 2026-09-12"
```

The verifier is read-only. It requires exactly three matching requests and proves finalized request/attempt/ledger/transaction state, one canonical chain per request, three distinct client keys, a separate payer, non-mock matching Solana signatures, and locked EUR quote consistency. It reports only aggregate checks, EUR total, and finalization timestamps. Portal auto-refresh and merchant comprehension remain browser/session observations and must be recorded separately.
