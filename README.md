# MCBuse

Stablecoin-native payment app built on Solana. Custodial dual-wallet model (Routine + Holding), fiat on/off-ramps via Stripe and MoonPay, QR and NFC P2P payments, mobile-first.

## Download & Test here
- [iOS](https://testflight.apple.com/join/bEe7rw2b)
- [Android](https://drive.google.com/drive/folders/157D7JMd9fJ3R5699YLho2795krfbabBH)

## Architecture

Turborepo monorepo with pnpm workspaces.

| Path | Stack | Purpose |
| --- | --- | --- |
| `apps/api` | NestJS, Drizzle ORM, PostgreSQL, Solana web3.js | Backend API — auth, wallets, ledger, payments, on/off-ramp |
| `apps/web` | Next.js | Marketing site / web companion |
| `apps/mobile` | Expo (React Native, new arch enabled) | Mobile app — primary consumer surface |
| `packages/ui` | React | Shared UI primitives (web) |
| `packages/shared` | TypeScript | Cross-app types/utils |
| `packages/eslint-config`, `packages/typescript-config` | Tooling | Shared lint/TS config |

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9 (`npm install -g pnpm`)
- **PostgreSQL** ≥ 14 (local install or Docker)
- **EAS CLI** for mobile builds: `npm install -g eas-cli`
- **Google Cloud CLI** for API deploys (optional): `brew install --cask google-cloud-sdk`
- **Stripe CLI** for local webhook forwarding (optional): `brew install stripe/stripe-cli/stripe`
- Xcode (iOS) and/or Android Studio (Android) for simulators/devices

## Quick start

```bash
git clone <repo-url> mcbuse && cd mcbuse
pnpm install
```

### 1. Configure the API

```bash
cp apps/api/.env.example apps/api/.env
```

Fill in at minimum in `apps/api/.env`:

- `DATABASE_URL` (or the split `DATABASE_HOST` / `DATABASE_USER` / etc.) — point at a local Postgres
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` — any random 32+ char strings for dev
- `STRIPE_SECRET_KEY` — your `sk_test_...` from https://dashboard.stripe.com/test/apikeys
- `STRIPE_WEBHOOK_SECRET` — printed by `stripe listen` (see below)
- `SOLANA_KEYPAIR_ENCRYPTION_KEY` — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

MoonPay, Twilio, and Circle keys are optional — leave the defaults if you only need the Stripe flow.

### 2. Set up the database

```bash
createdb mcbuse_dev

cd apps/api
pnpm db:migrate
cd ../..
```

### 3. Configure the mobile app

Create `apps/mobile/.env`:

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.X.X:4000/api/v1
EXPO_PUBLIC_ONRAMP_REDIRECT_URL=mcbuse://onramp/complete
```

Replace `192.168.X.X` with your machine's LAN IP (find it via `ipconfig getifaddr en0` on macOS). Localhost won't work from a physical device or Android emulator.

### 4. Run everything

From the repo root:

```bash
pnpm dev
```

This starts the API on `:4000`, the web app on `:3000`, and the Expo dev server. Open the Expo URL in Expo Go, or press `i` / `a` to launch a simulator.

To run a single app:

```bash
pnpm --filter api dev
pnpm --filter mobile start
pnpm --filter web dev
```

### 5. Forward Stripe webhooks (for on-ramp + off-ramp)

In a separate terminal:

```bash
stripe listen --forward-to localhost:4000/api/v1/webhooks/stripe
```

Copy the `whsec_...` it prints into `STRIPE_WEBHOOK_SECRET` in `apps/api/.env`, then restart the API.

## Stripe test cards

Use these in the Stripe-hosted checkout opened by the in-app WebView. Any future expiry and any 3-digit CVC will work.

| Number | Behaviour |
| --- | --- |
| `4242 4242 4242 4242` | Visa — succeeds, no 3DS |
| `4000 0025 0000 3155` | Visa — requires 3DS authentication |
| `5555 5555 5555 4444` | Mastercard — succeeds |
| `4000 0000 0000 9995` | Declined (insufficient funds) |
| `4000 0000 0000 0002` | Declined (generic) |
| `4000 0000 0000 0069` | Declined (expired card) |

Full list: https://docs.stripe.com/testing#cards

For the Stripe Crypto Onramp specifically, the test flow accepts the same cards plus the demo postcode `42424` and any name.

## Mobile app usage

The signed-in home screen has two cards and two action rows.

- **Routine Account** — what you spend from. Drives Send / Receive / Invoice / Scan / Top Up.
- **Holding Account** — where you keep money. Drives Move / Swap / Cash Out.

### Top up (fiat → USDC)

1. Tap **Top Up** on the home screen.
2. Pick USD or EUR, enter an amount (min 20, max 10,000).
3. Tap **Continue with card**. The Stripe widget loads inside a WebView.
4. Use one of the test cards above. Use any name, ZIP `42424`, and any future expiry.
5. After payment, Stripe redirects to `mcbuse://onramp/complete`. The app navigates to the status screen and polls until the webhook lands.
6. Funds appear in the Holding Account as USDC (displayed as USD).

### Move between accounts

Tap **Move** under the Holding Account to shift funds to the Routine Account (or vice versa). Instant, no fees.

### Send

1. Tap **Send**.
2. Enter the recipient's username or scan their QR.
3. Confirm amount and tap to send. Settlement is sub-second on Solana devnet.

### Receive

Tap **Receive** to show a QR code with your address and (optional) requested amount. The payer scans it from the **Scan** action.

### NFC tap-to-pay

With the app open on both phones, place them back-to-back. The sender approves the amount on their device and the recipient sees the credit immediately. Requires Android with NFC enabled (iOS NFC support is more constrained — use QR on iOS).

### Cash out (USDC → fiat)

1. From the Holding Account, tap **Cash Out**.
2. Pick provider (Stripe or MoonPay), currency, and amount.
3. Complete KYC + bank linking in the provider widget.
4. The off-ramp status screen reflects webhook updates.

### Swap

Tap **Swap** to convert between USDC and EURC inside the Holding Account.

## Useful commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run all apps |
| `pnpm build` | Build all apps |
| `pnpm lint` | Lint everything |
| `pnpm check-types` | Type-check everything |
| `pnpm --filter api test` | API unit tests |
| `pnpm --filter api test:e2e` | API end-to-end tests |
| `pnpm --filter api db:generate` | Generate a Drizzle migration from schema changes |
| `pnpm --filter api db:migrate` | Apply pending migrations |
| `pnpm --filter mobile ios` | Launch iOS simulator |
| `pnpm --filter mobile android` | Launch Android emulator |

## Deployment

### API → Google Cloud Run

```bash
export MCBUSE_GCP_PROJECT_ID="mcbuse-hackathon-2026-fno"
export MCBUSE_GCP_REGION="europe-west1"
export MCBUSE_BACKUP_DIR="/absolute/path/to/verified-pre-migration-backup"
pnpm deploy:api:cloud-run
```

The deploy command verifies the database backup, builds the API, runs migrations,
deploys the service, and checks its health. One-time project and secret setup is
documented in [docs/cloud-run-api-deployment.md](docs/cloud-run-api-deployment.md).

After deploying, register the production webhook endpoint in the Stripe Dashboard
at `https://mcbuse-api-332810840225.europe-west1.run.app/api/v1/webhooks/stripe`
and store the generated signing secret in Google Secret Manager.

### Mobile → EAS

Build profiles live in `apps/mobile/eas.json`. Each profile injects the right `EXPO_PUBLIC_API_BASE_URL` at build time.

```bash
cd apps/mobile

# Internal test APK pointed at prod API
eas build --profile preview --platform android

# TestFlight
eas build --profile production --platform ios
eas submit --platform ios --latest

# Play Store
eas build --profile production --platform android
eas submit --platform android --latest
```

## Troubleshooting

- **"Email verification required" when topping up** — currently disabled for new signups in dev. If you still hit it, your account predates the change. Flip the flag: `UPDATE users SET is_email_verified = true WHERE email = 'you@example.com';`
- **Top-up stuck on "Waiting for payment"** — Stripe webhook isn't reaching the API. Confirm `stripe listen` is running locally, or that the production webhook endpoint and signing secret are registered. Inspect the `mcbuse-api` Cloud Run logs in the dedicated MCBuse Google Cloud project.
- **Mobile build can't reach API** — `EXPO_PUBLIC_API_BASE_URL` must be your LAN IP for physical devices, or `10.0.2.2` for Android emulator, or `localhost` only for iOS simulator. The app also auto-detects the Metro host in dev.
- **Drizzle migrations out of sync** — `pnpm --filter api db:generate` then commit the new SQL file alongside the schema change.

## Tech notes

- Authentication: JWT (access + refresh), optional phone OTP (Twilio or mock).
- Wallets: custodial — keypairs encrypted with `SOLANA_KEYPAIR_ENCRYPTION_KEY` at rest.
- Ledger: double-entry, stored in Postgres. Solana settlement happens behind the API.
- On/off-ramp: provider-agnostic adapter pattern in `apps/api/src/onramp/` and `apps/api/src/offramp/`. Switch defaults via `ONRAMP_PROVIDER` / `OFFRAMP_PROVIDER`.
- Mobile state: React Query for server state, Zustand for app state, repository pattern per feature.
