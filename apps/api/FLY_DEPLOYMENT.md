# Deploy API to Fly.io

This deploys the NestJS API from the monorepo root using `Dockerfile.api` and `fly.toml`.

## 1. Create or rename the Fly app

`fly.toml` currently uses `mcbuse-api`. Fly app names are global, so rename it if needed:

```sh
fly apps create mcbuse-api
```

If the name is taken, create another app and update `app` in `fly.toml`.

## 2. Attach Postgres

Use Fly Managed Postgres for production, or attach an existing Fly Postgres app. Attaching sets a `DATABASE_URL` secret on the API app.

```sh
fly postgres attach <postgres-app-name> --app mcbuse-api
```

For an external database, set `DATABASE_URL` yourself:

```sh
fly secrets set DATABASE_URL='postgres://user:password@host:5432/database' --app mcbuse-api
```

Set `DATABASE_SSL=true` only if your database provider requires TLS. Fly internal Postgres typically uses `DATABASE_SSL=false`.

## 3. Set required secrets

Generate long random JWT secrets and the Solana encryption key locally:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set production secrets:

```sh
fly secrets set \
  JWT_ACCESS_SECRET='<48-byte-hex-or-long-random-string>' \
  JWT_REFRESH_SECRET='<different-48-byte-hex-or-long-random-string>' \
  SOLANA_KEYPAIR_ENCRYPTION_KEY='<32-byte-hex>' \
  MOONPAY_PUBLIC_KEY='<moonpay-public-key>' \
  MOONPAY_SECRET_KEY='<moonpay-secret-key>' \
  MOONPAY_WEBHOOK_SECRET='<moonpay-webhook-secret>' \
  APP_REDIRECT_URL='mcbuse://onramp/complete' \
  CIRCLE_API_KEY='<circle-api-key-if-used>' \
  --app mcbuse-api
```

If you use Twilio OTP in production, also set:

```sh
fly secrets set \
  OTP_PROVIDER='twilio' \
  TWILIO_ACCOUNT_SID='<sid>' \
  TWILIO_AUTH_TOKEN='<token>' \
  TWILIO_VERIFY_SERVICE_SID='<verify-service-sid>' \
  --app mcbuse-api
```

## 4. Deploy

From the monorepo root:

```sh
pnpm deploy:api:fly
```

The Fly release command runs Drizzle migrations before traffic moves to the new API image:

```toml
[deploy]
  release_command = "node dist/src/database/migrate.js"
```

If migrations fail, Fly stops the deploy.

## 5. Verify

```sh
fly status --app mcbuse-api
fly logs --app mcbuse-api
curl https://mcbuse-api.fly.dev/api/v1/health
```

## Production notes

- Keep `MOONPAY_SECRET_KEY`, `MOONPAY_WEBHOOK_SECRET`, `CIRCLE_API_KEY`, JWT secrets, and database credentials in Fly secrets only.
- Change `SOLANA_NETWORK`, `SOLANA_RPC_URL`, `MOONPAY_BASE_URL`, and provider settings in `fly.toml` or Fly secrets when moving from sandbox/devnet to production.
- Keep the Fly app and database in the same or nearby region to reduce latency.
