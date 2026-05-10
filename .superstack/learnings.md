# Project Learnings

> Managed by `/learn`. Append-only - latest entry wins on conflicts.

## Patterns

### stripe-provider-dispatch
- **Insight:** Ramp provider selection is dispatch-based with Stripe and MoonPay as peers, using `ONRAMP_PROVIDER` and `OFFRAMP_PROVIDER` env vars while preserving MoonPay as a selectable legacy path.
- **Confidence:** 8/10
- **Source:** manual
- **Files:** apps/api/src/onramp/onramp.module.ts, apps/api/src/offramp/offramp.module.ts, apps/api/src/onramp/dto/create-onramp-session.dto.ts, apps/api/src/offramp/dto/create-offramp-session.dto.ts
- **Date:** 2026-05-10

## Pitfalls

### stripe-api-version-payment-method-types
- **Insight:** Stripe integration targets API version `2026-04-22.dahlia` and should not pass `payment_method_types` to Checkout session creation.
- **Confidence:** 9/10
- **Source:** manual
- **Files:** apps/api/src/stripe/stripe.client.ts, apps/api/src/onramp/widget/stripe-onramp.provider.ts
- **Date:** 2026-05-10

### drizzle-migration-journal-order
- **Insight:** Drizzle skips migrations whose `_journal.json` `when` timestamp is older than the latest applied migration, even if the filename is later; keep new migration timestamps monotonic.
- **Confidence:** 9/10
- **Source:** diagnose
- **Files:** apps/api/drizzle/meta/_journal.json, apps/api/drizzle/0007_stripe_provider_fields.sql
- **Date:** 2026-05-10

### stripe-connect-express-account-type
- **Insight:** Stripe Connect hosted onboarding for the app should create Express connected accounts with `type: 'express'`; `controller.stripe_dashboard.type: 'none'` plus application-collected requirements creates Custom-account behavior and can break Express onboarding links.
- **Confidence:** 9/10
- **Source:** diagnose
- **Files:** apps/api/src/offramp/stripe-offramp.provider.ts
- **Date:** 2026-05-10

## Preferences

### stripe-default-ramp-provider
- **Insight:** Stripe is the preferred default provider for both on-ramp and off-ramp, with MoonPay exposed as a secondary option and still switchable through environment configuration.
- **Confidence:** 9/10
- **Source:** manual
- **Files:** apps/api/.env.example, apps/mobile/features/onramp/session-models.ts, apps/mobile/features/offramp/models.ts
- **Date:** 2026-05-10

## Architecture

### stripe-shared-client-module
- **Insight:** Stripe is wrapped in `StripeModule` and `StripeClient` as an injectable singleton initialized from `STRIPE_SECRET_KEY` with API version `2026-04-22.dahlia`.
- **Confidence:** 8/10
- **Source:** manual
- **Files:** apps/api/src/stripe/stripe.module.ts, apps/api/src/stripe/stripe.client.ts, apps/api/package.json
- **Date:** 2026-05-10

### stripe-onramp-fallback-flow
- **Insight:** Stripe on-ramp first attempts Stripe Crypto Onramp when `STRIPE_CRYPTO_ONRAMP_ENABLED=true`, then falls back to Stripe Checkout plus `WidgetOnrampSettlementService` treasury USDC settlement when Crypto Onramp is unavailable or disabled.
- **Confidence:** 8/10
- **Source:** manual
- **Files:** apps/api/src/onramp/widget/stripe-onramp.provider.ts, apps/api/src/onramp/onramp-sessions.service.ts, apps/api/src/onramp/onramp-webhooks.controller.ts
- **Date:** 2026-05-10

### stripe-onramp-webhooks
- **Insight:** Stripe on-ramp webhooks verify with `STRIPE_WEBHOOK_SECRET`, parse Crypto Onramp and Checkout or PaymentIntent events into normalized statuses, and apply updates through a provider-filtered `applyStripeWebhook` path.
- **Confidence:** 8/10
- **Source:** manual
- **Files:** apps/api/src/onramp/widget/stripe-onramp.provider.ts, apps/api/src/onramp/onramp-webhooks.controller.ts, apps/api/src/onramp/onramp-sessions.service.ts
- **Date:** 2026-05-10

### stripe-offramp-connect-flow
- **Insight:** Stripe off-ramp uses Connect Express accounts with transfers capability, one-time onboarding links, account status gating, existing Holding USDC reservation logic, and transfer plus payout webhooks to complete or release reserved funds.
- **Confidence:** 8/10
- **Source:** manual
- **Files:** apps/api/src/offramp/stripe-offramp.provider.ts, apps/api/src/offramp/offramp.controller.ts, apps/api/src/offramp/offramp-sessions.service.ts
- **Date:** 2026-05-10

### stripe-database-fields
- **Insight:** Stripe persistence adds `users.stripeAccountId` and `offrampTransactions.stripePayoutId` plus `stripeTransferId`, while existing external transaction fields can continue to hold provider session or account identifiers.
- **Confidence:** 8/10
- **Source:** manual
- **Files:** apps/api/src/database/schema/users.ts, apps/api/src/database/schema/offramp-transactions.ts
- **Date:** 2026-05-10

### stripe-mobile-ramp-flows
- **Insight:** Mobile Stripe ramp flows open Stripe Checkout or Connect onboarding links with `expo-web-browser`, poll existing transaction status for top-up completion, and show onboarding before cashout when the connected account is not payout-ready.
- **Confidence:** 8/10
- **Source:** manual
- **Files:** apps/mobile/app/(flows)/top-up/checkout.tsx, apps/mobile/app/(flows)/cashout/checkout.tsx, apps/mobile/features/onramp/session-repository.ts, apps/mobile/features/offramp/repository.ts
- **Date:** 2026-05-10

## Tools
