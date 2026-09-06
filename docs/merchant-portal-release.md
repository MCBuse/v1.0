# Merchant portal release gate

The portal runs locally on port 3001. The merchant API is deliberately disabled in production unless `MERCHANT_PORTAL_ENABLED=true` is set.

## 1. Back up the hosted database

Use the Supabase project backup controls or an encrypted `pg_dump` connection with certificate verification enabled. Record the backup identifier, size, and successful restore/verification result before continuing. Do not use an unencrypted database connection and do not place credentials in shell history.

## 2. Deploy the additive API migration behind the flag

Confirm the active Fly account can see `mcbuse-api`, then deploy from the repository root:

```text
fly status --app mcbuse-api
pnpm deploy:api:fly
curl -fsS https://mcbuse-api.fly.dev/api/v1/health
```

The Fly release command applies migration `0008_merchant_portal.sql`. With the flag absent or false, merchant endpoints return not found.

## 3. Provision an existing account

Run this only from a trusted environment that already has the database configuration:

```text
pnpm --filter api merchant:provision -- --email merchant@example.com --business-name "Business name"
```

The command is idempotent and links the user’s existing routine wallet. It never creates credentials or prints wallet keys.

## 4. Enable the API

```text
fly secrets set MERCHANT_PORTAL_ENABLED=true --app mcbuse-api
```

Start the local portal with `pnpm dev:portal` and sign in at `http://localhost:3001`.

## 5. Real devnet transfer gate

Keep `TRANSFER_PROVIDER=mock` until the non-production mobile payer has devnet SOL for fees, devnet USDC, and the encrypted custodial key configuration has been confirmed. Then set `TRANSFER_PROVIDER=solana`, verify API health, and complete three scan-and-pay repetitions. Each repetition must produce one finalized canonical merchant transaction and one portal update with no reload.

If a submitted transfer is interrupted, the API’s reconciliation worker checks the stored signature and finalizes the ledger, request, balances, and merchant transaction exactly once.
