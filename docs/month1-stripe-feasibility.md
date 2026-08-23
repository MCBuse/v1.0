# Month 1 — Stripe Capture-Path Feasibility

**Ticket:** MCB-8 — W04  
**Validated:** 2026-08-05  
**Outcome:** feasible for the MVP. Merchant-domain persistence and reconciliation remain scheduled implementation work in W15 and W18.

## What was proven

| Concern | Evidence | Result |
| --- | --- | --- |
| Stripe account reachability | Configured account capabilities checked without printing credentials | Connected; charges and payouts enabled |
| Payment Link creation | Isolated test-mode product, price, and Payment Link created with `merchant_reference=w04-feasibility-probe` | Active test Payment Link created successfully |
| Balance and payout query APIs | Read-only `balanceTransactions.list` and `payouts.list` calls | Both API surfaces are reachable; one balance transaction and no existing payouts returned at validation time |
| Generic webhook route | Nest startup mapping includes `/api/v1/webhooks/:provider` after the controller fix | Registered |
| Signed raw webhook verification | Deterministic Stripe-compatible `payment_intent.succeeded` fixture signed with HMAC-SHA256 and posted to the generic endpoint | HTTP 200 with `{ "received": true }` |
| Test payout lifecycle | Tagged USD 1.00 manual payout from the Stripe test balance | Created pending, then became `paid`; its payout balance transaction is available |
| Regression coverage | `pnpm --filter api exec jest --runInBand --watchman=false` | 12 suites / 43 tests passed |

The isolated Payment Link and payout are test-mode only, contain no customer data, and are tagged for feasibility review. No real funds were moved.

## Sanitized payment-to-payout evidence trail

All timestamps are UTC. IDs are deliberately shortened so this document can be safely committed.

| Step | Timestamp | Evidence |
| --- | --- | --- |
| Payment/charge event available | 2026-08-05T12:01:45Z | Successful USD 20.00 charge `ch_3U13W07…` → balance transaction `txn_3U13W0…` |
| Payout created | 2026-08-05T12:08:11Z | Tagged USD 1.00 payout `po_1U13cF7…`, initially pending, with balance transaction `txn_1U13cF…` |
| Payout settled in the test account | 2026-08-05T12:08:11Z | Same payout reported `paid`; its balance transaction reports type `payout`, amount `-100` minor units, and source `po_1U13cF7…` |

The manual payout draws from the account's aggregate available card balance, so Stripe does not assign this particular USD 1.00 payout to one individual charge in the returned records. That is expected for the feasibility test and confirms why W18 must build the canonical merchant attribution chain rather than infer a one-to-one relationship from payout timing.

## Defect fixed during validation

`OnrampWebhooksController` stacked three `@Post()` decorators on one method. At runtime Nest registered only the first path, leaving the intended generic endpoint unavailable. The controller now exposes separate on-ramp, off-ramp, and generic route methods that delegate to the one verified processing path. Unit coverage exercises the generic and off-ramp aliases.

## Sandbox limitations and deterministic fallback

The installed Stripe CLI successfully generated `charge.*` and `payment_intent.*` test events, but its proxy discarded them before forwarding because their event API version did not match the CLI's default forwarding version. This is a tooling/version configuration limitation, not an API signature or routing failure. The deterministic signed fixture therefore serves as the repeatable local proof of signature verification and route handling.

Stripe documents both local forwarding and webhook API-version behavior:

- [Use the Stripe CLI](https://docs.stripe.com/stripe-cli/use-cli)
- [Receive Stripe events in a webhook endpoint](https://docs.stripe.com/webhooks?lang=node)
- [Handle webhook versioning](https://docs.stripe.com/webhooks/versioning)

Stripe test payouts simulate the lifecycle without moving money. The deliberate manual-payout scenario above completed successfully. Stripe's payout reference confirms the test-mode behavior and the integer-minor-unit payout contract:

- [Receive payouts](https://docs.stripe.com/payouts)
- [Create a payout](https://docs.stripe.com/api/payouts/create)

## MVP implications

1. **W14:** Create reusable Payment Links with a stable merchant reference and static QR output. The feasibility probe validates Stripe support but does not add this product workflow yet.
2. **W15:** Persist a verified raw provider event before normalization in the new merchant data-capture store. The legacy controller currently routes to wallet/on-ramp processing and must not be used as the merchant canonical record.
3. **W18:** Implement the canonical payout chain: payout → balance transaction → charge/payment intent → merchant reference. Store amounts as integer minor units and treat Stripe event delivery as unordered and retryable.
4. **Staging check:** configure a version-compatible Stripe CLI listener or registered test endpoint, then run an intentional Payment Link payment and payout. Retain only redacted evidence; never put webhook secrets or customer payloads in repository logs.

## Non-goals retained

- No merchant data schema, merchant onboarding, QR/PDF generation, or dashboard work was added ahead of its scheduled ticket.
- No production payments, payouts, refunds, or customer data were created.
- No raw webhook payload was committed or logged from the Stripe account.
