# Month 1 Architecture Decisions and Technical Risk Register v1

**Ticket:** MCB-7 — W02: Finalize the keep/kill/rebuild matrix and technical risk register  
**Date:** 2026-08-05  
**Decision owner:** Frederick Obeng-Nyarko  
**Input:** [`month1-demo-audit.md`](./month1-demo-audit.md)

## Decision summary

The merchant data-capture MVP will be an additive product surface. It will not
reinterpret the existing stablecoin wallet, mobile, or on-ramp domains as merchant
capture. The approved build boundary is a new `apps/portal` PWA plus a new API
`data-capture` module cluster, using Stripe as the first provider.

## Keep / kill / rebuild matrix

| Area | Decision | Action for MVP | Rationale |
| --- | --- | --- | --- |
| pnpm/Turborepo monorepo | **Keep** | Add `apps/portal`; retain root build/typecheck conventions. | The repository already supports multiple applications. |
| NestJS application shell | **Keep** | Register a `DataCaptureModule`; retain config, validation, Swagger, Pino, Helmet, throttling, and raw body. | It supplies the correct integration and security primitives. |
| PostgreSQL + Drizzle | **Keep** | Add isolated data-capture schema files and generated migrations. | Existing migration and typed-query workflow is suitable. |
| Stripe client | **Keep** | Use `StripeClient` for Payment Links, webhook verification, event retrieval, balance transactions, and payouts. | SDK access is centralized and testable. |
| Signed webhook pattern | **Keep and adapt** | Verify Stripe signature before persisting a raw provider event; process asynchronously/idempotently. | Existing provider controller validates raw signatures but discards unsupported events. |
| Auth credentials and refresh sessions | **Keep and extend** | Retain credential/session flows; add roles and merchant ownership/membership. | Existing JWT payload has no role and signup creates wallets automatically. |
| Audit log table | **Keep and extend** | Add an audit service/coverage for merchant/admin mutations. | The table is a useful base but does not currently guarantee writes. |
| Integer monetary representation | **Keep as a rule** | Store merchant amounts in provider minor units; return strings where required. | This avoids precision loss already recognized by the wallet ledger. |
| Public `apps/web` site | **Keep unchanged** | Continue as marketing only. | The site has no authenticated product shell. |
| Expo mobile app | **Park** | Do not delete or extend it for pilot capture. | The pilot capture path is web + static QR, and mobile is wallet-specific. |
| Wallets, balances, and ledger | **Keep as a separate subsystem** | Do not use them as the canonical merchant transaction store. | They lack merchant scope, raw-provider provenance, and payout links. |
| On-ramp session settlement | **Do not reuse as the merchant domain** | Reuse only Stripe SDK/config/signature techniques. | It converts fiat top-ups into USDC wallet credits and has different lifecycle semantics. |
| Off-ramp/Stripe Connect logic | **Reference only** | Use event-shape knowledge where useful; do not attach merchant matching to it. | Merchant settlement needs a Stripe platform-payment model. |
| Existing generic Stripe webhook route | **Replace for merchant capture** | Add a dedicated data-capture webhook adapter/route. | Existing route handles on/off-ramp event families only. |
| Merchant/admin portal | **Rebuild** | Implement a new `apps/portal` PWA. | No existing web dashboard or role-gated shell exists. |
| Merchant, consent, provider event, canonical transaction, payout, exception, KPI models | **Rebuild** | Create new tables under `data-capture`. | None exist in the current wallet schemas. |
| CI and portal deployment | **Rebuild** | Add after the product path is stable; define pilot delivery path in M8. | The repository has no CI workflow; Cloud Run deploys the API and portal independently. |

## Architecture decisions

### ADR-01 — Product-surface separation

`apps/web` remains the public site. `apps/portal` will be a separate Next.js PWA with
authenticated merchant routes and `/admin` routes. The Expo application is explicitly
out of the pilot path.

### ADR-02 — Data-capture module boundary

Create `apps/api/src/data-capture/` as the owner of merchant onboarding, consent,
provider adapters, raw-event persistence, normalization, payout matching, exceptions,
KPI calculation, and merchant/admin read APIs. It may use `StripeModule`, database,
config, auth, logging, and audit primitives. It must not depend on wallet balances,
Solana settlement, or on-ramp-session completion.

### ADR-03 — Stripe ingestion contract

For Stripe, the ingress sequence is:

1. receive raw body at the dedicated capture webhook;
2. verify `Stripe-Signature` using the configured endpoint secret;
3. persist the provider event with `(provider, provider_event_id)` uniqueness;
4. normalize supported event types into canonical records;
5. mark duplicate, malformed, unsupported, or failed-normalization outcomes explicitly;
6. retain a dead-letter/replayable record for failures.

The W04 spike must confirm the exact sandbox event set and correlation fields before
this contract is implemented. The current working assumption is that merchant identity
is recoverable through Stripe Payment Link/Checkout metadata and that matching follows
`payout → balance transaction → charge/payment intent → merchant`.

### ADR-04 — Canonical merchant data is not the wallet ledger

Merchant activity is represented by new canonical transaction/payout records. The
existing ledger remains authoritative for custodial wallet movement only. Both systems
use integer minor units, UTC timestamps, stable external IDs, and explicit status
transitions.

### ADR-05 — Merchant identity and consent

Merchant IDs are generated by the API and are immutable. Consent records store the
merchant, actor, consent-version identifier, timestamp, and evidence reference. KYB is
a partner-owned status field only; no production KYB implementation is in scope.

### ADR-06 — Authorization model

Add server-enforced `merchant` and `admin` roles. Merchant queries are scoped through
merchant ownership/membership; admin queries may span merchants. Role checks must be
server-side, with portal route gates only as a user-experience layer. Existing automatic
wallet-pair creation is not a valid admin/merchant provisioning mechanism.

### ADR-07 — Scope protection

NFC capture, production KYB, credit scoring, partner-provider adapters, and refund
operations are excluded. Refund/reversal events may be recorded only to prevent totals
or matching from becoming incorrect.

## Technical risk register

| ID | Risk | Likelihood | Impact | Trigger / evidence | Mitigation and owner | Target |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | Stripe test mode cannot produce representative payout timing or all required balance-transaction links. | High | Critical | W04 cannot observe the full payment-to-payout trail. | Capture event inventory; retain sanitized fixtures and build a deterministic payout test harness. Owner: Frederick. | W04 |
| R2 | Merchant identity cannot be reliably recovered from a static Payment Link event. | Medium | Critical | Payment/charge/payout trail loses merchant correlation. | Validate metadata/client-reference propagation in W04; choose a single immutable merchant reference; reject ambiguous events. Owner: Frederick. | W04/W14 |
| R3 | Existing generic webhook route silently ignores merchant-relevant Stripe events. | High | High | Verified event type is logged then discarded. | Dedicated adapter persists every supported verified event before normalization and records unsupported/dead-letter outcomes. Owner: data-capture module. | W15 |
| R4 | Legacy `stripe` provider configuration maps core on/off-ramp services to mocks. | High | High | A developer assumes real Stripe behavior from configuration name. | Isolate merchant-capture provider configuration; document legacy behavior; add explicit integration tests. Owner: Frederick. | W04/W15 |
| R5 | No merchant/admin roles or membership model exists; signup automatically creates wallets. | High | High | Portal access would be based only on user identity. | Define RBAC in W11 and add server authorization/membership in W13/W22. Owner: Frederick. | W11–W22 |
| R6 | Merchant data and raw provider payloads may retain more personal data than required. | Medium | High | Raw JSON is exposed or retained indefinitely. | Minimize/partition raw payload visibility, create retention policy, restrict admin views, and audit sensitive reads. Owner: Frederick. | W11/W22 |
| R7 | No CI workflow and the default Jest command is Watchman-dependent. | High | Medium | Local test command fails before test execution; regressions lack automated checks. | Use `jest --watchman=false` in automation and add build/typecheck/test checks before pilot. Owner: Frederick. | W24/M8 |
| R8 | Cloud Run production defaults are not pilot-ready (`DATABASE_SSL=no-verify`, mock OTP, zero minimum instances). | Medium | High | Service can be unavailable or unsafe for pilot use. | Define environment separation, verified DB TLS, operational auth decision, uptime/alerting, and backup/restore evidence. Owner: Frederick. | W22/W29–W31 |
| R9 | At four hours/week, integration surprises consume the delivery buffer. | High | High | W04/W15/W18 exceed their timeboxes. | Protect W4-of-month buffer; create follow-up tickets rather than silently expanding scope; keep P0 path limited to capture/matching/RBAC. Owner: Frederick. | Continuous |
| R10 | Adding merchant features to wallet tables creates irreversible coupling and unsafe migrations. | Medium | High | New columns/joins use wallet entities for merchant sales. | Enforce ADR-02/04; add standalone schemas and test migrations against a clean database. Owner: Frederick. | W05–W06 |
| R11 | Missing CI/CD and no production data recovery test. | Medium | High | A deployment fails or data cannot be restored during pilot. | Add CI, backups, restore rehearsal, monitoring, and runbook. Owner: Frederick. | W24/W29–W32 |

## Acceptance record

The decisions above are ready for W03 stakeholder validation. Any change that would
merge the wallet and merchant domains, add mobile/NFC to the pilot, or substitute a
partner provider for Stripe must be explicitly re-approved and reflected in this
record, the scope document, and affected Linear tickets.
