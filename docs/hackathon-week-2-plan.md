# MCBuse Hackathon — Week 2 Delivery Plan

**Outcome:** a finalized customer payment becomes an accurate, actionable merchant record and updates the portal without a reload.

**Scope:** H13–H14 plus any unfinished Week 1 work that blocks the real payment-to-canonical-record path.

## Current evidence

- The authenticated portal, receive-payment flow, transactions view, polling, summaries, charts, consent, and readiness UI exist.
- Migration `0008_merchant_portal.sql` is registered locally and was revalidated successfully by Cloud Run Job execution `mcbuse-api-migrate-978k5`.
- The hosted API health endpoint returned `status: ok` with database `ok` on 2026-09-12.
- Portal unit, responsive Playwright, API, type, lint, and root production-build checks pass.
- A cleanup-safe local public-interface rehearsal on 2026-09-12 proved three consecutive request creations, idempotent payment execution, exactly three canonical records, receipt visibility, summary refresh, capture quality, balance movement, and absence of blockchain fields. It used the mock transfer adapter and is not proof of a real devnet transfer.
- The configured database had no finalized merchant attempt or canonical merchant transaction before the rehearsal, and the rehearsal left no temporary user, request, transaction, ledger, token, or balance change behind.
- The overview browser test uses intercepted API responses; it proves presentation, not the real payment pipeline.
- A live browser check against the local API proved that sign-in redirects to `/overview`, the dashboard loads, the receive form enters its QR waiting state, and sign-out redirects to `/sign-in`.
- The API now runs on the dedicated GCP project `mcbuse-hackathon-2026-fno`; crash-safe revision `mcbuse-api-00010-wmf` in `europe-west1` receives 100% of traffic.
- The merchant portal now runs on the same dedicated project at `https://mcbuse-portal-332810840225.europe-west1.run.app`; revision `mcbuse-portal-00001-4cx` receives 100% of traffic through a separate least-privilege runtime identity.
- Cloud Run health returns HTTP 200 with database `ok`, and the merchant boundary rejects unauthenticated requests with HTTP 401.
- A credential-safe PostgreSQL 17 logical backup was created outside the repository, checksummed, catalog-validated, and restored into a disposable local PostgreSQL 17 instance. The restore recovered 10 public tables and 24 payment-request rows.
- The dedicated project uses Secret Manager, a migration job, request-based CPU, zero minimum instances, and a maximum of two instances. No Booksie project or resource was used or changed.
- The ignored portal and mobile development environments now target `https://mcbuse-api-332810840225.europe-west1.run.app/api/v1`.
- An existing active account is provisioned idempotently as the pilot merchant owner, and merchant routes are enabled. No account identifier or credential is stored in the repository. `TRANSFER_PROVIDER` remains `mock` until the devnet funding and signing-key gate is proven.
- A credential-safe deployed readiness check proved that the Secret Manager encryption key decrypts the provisioned routine-wallet key and that its derived public key matches the stored address. The checked account has sufficient internal routine balance and the merchant receiving balance exists, but it is the merchant rather than a separate payer and lacks on-chain devnet funding, so the real-transfer gate remains correctly closed.

## Work packets

### W2.1 — Close the real-payment blocker

- Run the local portal against the intended API environment.
- Create a EUR request and complete it in the real mobile app.
- Verify processing, submitted, finalized, ledger, request, and canonical-transaction state transitions.
- Restart the API after submission and prove reconciliation completes exactly once.
- Repeat the payment three times with unique idempotency keys.

**Acceptance:** three payments create exactly three canonical merchant transactions and update the portal automatically. A duplicate execution and an API restart create no duplicate balance movement, ledger entry, receipt, or total.

### W2.2 — Capture quality and actionable exceptions

- Calculate capture quality as `captured / (captured + malformed + missed)`.
- Exclude duplicate observations and payment-execution failures from the capture-quality denominator.
- Return the last successful capture time and safe, reason-coded merchant problems.
- Show clear actions for failed, delayed, malformed, and missed events without exposing blockchain or customer data.
- Add tests for empty evidence, malformed, missed, duplicate, and unrelated operational exceptions.

**Acceptance:** the merchant can see whether capture is healthy, which payment needs attention, and what to do next; the quality result is reproducible from stored evidence.

### W2.3 — Calendar-correct merchant analytics

- Aggregate finalized records using the merchant's `Europe/Berlin` calendar.
- Return all 30 daily buckets, including zero-value days.
- Keep historical EUR values locked to the payment-time quote.
- Keep available value clearly estimated at the latest rate timestamp.
- Verify received today, 30-day total, count, average sale, daily trend, and hourly rhythm around timezone and daylight-saving boundaries.

**Acceptance:** every displayed amount traces to finalized canonical records, and failed, processing, expired, or duplicate attempts never affect sales.

### W2.4 — Integration and portal verification

- Add API coverage for merchant isolation, finalized-only records, duplicate execution, restart recovery, aggregation boundaries, safe responses, and exceptions.
- Add portal coverage for pending-to-completed polling, automatic summary refresh, actionable problems, filters, empty/error/degraded states, and responsive behavior.
- Keep merchant responses fiat-first: no wallet address, token symbol, network badge, signature, or Explorer link.

**Acceptance:** tests exercise the real public interfaces; mocked presentation tests remain supplementary rather than the only evidence.

### W2.5 — First usability session

- Ask one target merchant or representative to sign in, request a payment, find the receipt, and explain the dashboard.
- Record completion time, unclear language, trust concerns, and the three highest-priority changes.
- Fix any issue that prevents the merchant from understanding whether money was received or needs attention.

**Acceptance:** one dated usability note and defect disposition exist. The merchant can explain today's receipts, the available-value estimate, and the difference between pending, received, and attention states.

## Suggested sequence

1. **Day 1:** W2.1 real-payment and reconciliation gate.
2. **Day 2:** W2.2 capture-quality contract and exception UI.
3. **Day 3:** W2.3 timezone-correct summaries and charts.
4. **Day 4:** W2.4 integration, recovery, responsive, and degraded-state tests.
5. **Day 5:** W2.5 usability session, defect fixes, and three-run rehearsal.

## Ownership

- **Frederick:** engineering, tests, environment checks, devnet rehearsal, and evidence capture.
- **Berk:** usability participant, session notes, and merchant-facing language.
- **Asim:** metric definitions, claim boundaries, and acceptance review.

## Explicit non-goals

- Evidence issuance and public lender verification (Week 3).
- Admin tooling, public schema, and release hardening (Week 4).
- Stablecoin marketplace, lending decisions, withdrawals, payouts, fiat settlement, or new marketing-site work.

## Week 2 gate

Week 2 is complete only when merchant value is visible immediately after a real finalized payment, the totals are explainable from canonical records, problems are actionable, and the flow survives duplication and restart tests.

## Execution log — 2026-09-12

Completed:

- Added reproducible 30-day merchant-calendar aggregation with zero-filled daily and hourly buckets.
- Made evidence-history day counts use the merchant's Berlin calendar rather than elapsed 24-hour blocks, including daylight-saving boundaries.
- Kept the 30-day chart period exact while returning the merchant's actual latest finalized capture time even when it falls outside that chart window.
- Added capture quality based only on finalized captures plus malformed or missed events.
- Added last-captured time and safe, actionable merchant problem contracts and UI.
- Added focused unit coverage for both daylight-saving boundaries, the exact 30-day merchant calendar, quality exclusions, and problem redaction.
- Added `pnpm --filter api merchant:week2-smoke`, restricted to local environments, with cleanup and abandoned-run recovery.
- Made `merchant:week2-recovery-smoke` self-contained: it creates temporary merchant and payer fixtures, completes and duplicate-retries three payments, rejects cross-account and cross-request idempotency-key reuse, persists the first submitted payment across an API restart, proves exactly-once reconciliation, and cleans up.
- The public-interface rehearsal also proves merchant authorization isolation, pending-record exclusion, quote persistence, safe exception redaction, and fiat-only merchant responses.
- Added a browser test proving a pending request becomes received and refreshes the dashboard totals without a reload.
- Corrected the zero-sales dashboard so 30 zero-filled API buckets render the intended first-sale empty state instead of an empty chart.
- Added browser proofs for initial load failure, delayed refresh with retained values, offline refresh with retained values, and the real zero-sales state.
- Added `merchant:devnet-readiness`, which checks the deployed database and encryption secrets, payer/merchant separation, key compatibility, internal ledger funding, recipient balance readiness, and live devnet SOL/USDC funding without printing emails, wallet addresses, or key material.
- Persisted the deterministic signed Solana transaction signature before broadcast, refused broadcast when that persistence fails, and made post-broadcast persistence failures recoverable after restart. Stale prepared attempts become failed only when no signature was durably recorded; signatures with delayed finality remain open and actionable.
- Reserved the payer's internal balance atomically with the merchant request claim, settled the reservation only after provider finality, and released it only for a proven failure. This prevents a concurrent internal spend from leaving an already-finalized on-chain payment without its canonical record.
- Passed 19 API suites / 68 tests, 5 portal unit tests, and 37 Playwright tests; 17 duplicate layout-specific checks are intentionally skipped where they do not apply. The browser matrix now covers responsive navigation, route protection, sign-in, merchant authorization, token rotation, logout, payment polling, receive-sheet validation and focus restoration, accessible chart data, URL-backed receipt filters and pagination, safe transaction states, readiness boundaries, consent with CSRF, and failed-consent recovery at 375px, 768px, and 1280px. API, mobile, and portal type checks, mobile and portal lint, and the root production build also pass without errors.
- Deployed the tested calendar and reconciliation changes as image `sha256:ce48151d8e1a6e7aa8687b95c77713dfa5f620bedfcdf8211110513c8a009595`; migration execution `mcbuse-api-migrate-wsbbr` completed successfully before revision `mcbuse-api-00006-hl9` received traffic.
- Re-ran the local recovery smoke with three EUR 1.00 payments plus a stale unsigned failure; all 16 acceptance assertions passed, including payer/request-bound idempotency and reservation settlement/release. The smoke cleanup completed successfully.
- Deployed the balance-reservation hardening as image `sha256:a9aa950f2708ad37905ef33a3f642bafb56a920ed7cb445225542d57ed854044`; migration execution `mcbuse-api-migrate-sw5td` completed successfully before revision `mcbuse-api-00008-vr4` received traffic.
- Moved the active portal API fallback, portal setup example, EAS preview and production profiles, root deployment guide, Stripe webhook guide, and troubleshooting instructions to the dedicated MCBuse Cloud Run service.
- Replaced cookie-presence-only portal gating with server-side merchant validation, same-origin refresh-token rotation, canonical-origin redirects, rejected-session cleanup, and merchant-membership validation before login cookies are issued. The Playwright harness now exercises the real Next.js route handlers against a local upstream API instead of mocking successful login at the browser boundary.
- Added responsive receipt-table overflow handling, an accessible receipt-search label, and a visible retry-safe consent error. Added browser coverage for URL-backed filtering and pagination, safe receipt errors, readiness and lender-decision boundaries, consent CSRF and failure behavior, chart labels plus accessible data tables, and mobile receive-sheet validation with focus restoration.
- Scoped completed-payment idempotency lookups to the authenticated payer and bound successful retries to the original QR nonce, preventing another account or another payment request from receiving a prior payment result.
- Deployed the idempotency isolation hardening to the dedicated GCP project as image `sha256:796a15daf53cdd64be9c79aa49c926bc463f092aa72dadab7eb38dbe51210185`; migration execution `mcbuse-api-migrate-978k5` completed before revision `mcbuse-api-00010-wmf` received 100% of traffic. Hosted health and database checks returned `ok`, the merchant endpoint returned the expected unauthenticated `401`, the merchant feature flag is enabled, transfers remain mocked on devnet, and the new revision had no error-level logs after startup.
- Revalidated the real mobile client after the GCP cutover: mobile TypeScript passed, Expo lint reported no errors, and a production-mode iOS export bundled successfully. The emitted Hermes bundle contains the dedicated Cloud Run API URL and no Fly API URL; the scanner generates one UUID per resolved QR request and reuses it for retries.
- Revalidated the live local-portal-to-Cloud-Run boundary without handling real credentials: an anonymous `/overview` request redirected to `/sign-in`, a same-origin invalid login returned the safe `401` message, and the same mutation without an allowed origin was rejected with `403`. The deployed OpenAPI contract exposes all seven merchant routes plus mobile QR resolution and payment execution, with both nonce and idempotency key required.
- Added `merchant:hosted-acceptance`, a read-only final-evidence verifier for the three live mobile payments. Given the merchant and a unique description prefix, it fails closed unless it finds exactly three finalized request/attempt/ledger/canonical chains, one record at each layer, distinct client keys, a separate payer, matching non-mock Solana signatures, consistent locked EUR quotes, and ordered lifecycle timestamps. Its output contains only aggregate checks, the EUR total, and finalization times; a no-match rehearsal against the hosted database failed safely with zero records.
- Made the mobile **Receive** screen copy the full Routine address to the clipboard with accessible success feedback and a share-sheet fallback, removing ambiguity when funding the separate devnet payer. Mobile TypeScript and lint remain clean, and a production iOS export contains the Cloud Run URL, the new copy labels, and no Fly URL.
- Documented the exact, non-database payer preparation path: fund the copied Routine address through the official Solana and Circle devnet faucets, use **Top Up** plus **Holding Account → Move** for the separate internal balance, and keep the real transfer provider disabled until the deployed readiness check passes.
- Repaired the hosted payer-funding path: verified the configured Stripe credential is test mode, updated the existing enabled MCBuse checkout-completion webhook to the Cloud Run on-ramp endpoint without rotating its signing secret, disabled the stale ngrok endpoint, and confirmed there is exactly one active matching test webhook. This prevents a successful test checkout from remaining permanently pending in Holding Account.
- Re-ran the release evidence after the mobile and webhook changes: the monorepo type check and production build passed; all 19 API suites / 69 tests, 5 portal unit tests, and 37 responsive Playwright tests passed; the three-payment API-restart smoke passed all 16 assertions; Cloud Run health and database status remained `ok`; the active revision still had 100% traffic with merchant routes enabled and real transfers disabled. The Cloud Run Stripe route also rejected a deliberately invalid signature with `401`, proving the route is present and fails closed.
- Added `merchant:hosted-infra-readiness`, a reproducible credential-safe verifier for the live release boundary. Its first hosted run passed all nine checks: latest-revision traffic, merchant feature flag, mocked transfers, devnet network and USDC mint, Stripe test mode and signing-secret presence, exactly one relevant Cloud Run checkout webhook, and API/database health. It reports configuration booleans and safe host metadata only, never secret values or endpoint identifiers.
- Added explicit mobile-resolution coverage proving a merchant payment request presents the active business name to the payer instead of the merchant owner's personal name. The full API suite remains green at 19 suites / 69 tests, while merchant-facing transaction contracts remain limited to EUR receipt fields.
- Added an isolated production portal image and Cloud Build/Cloud Run deployment path. Image `sha256:6a9f96866430fd20f8807c54dda9bcbd1301d724dc25716fe8de1117b4f75ece` was deployed as revision `mcbuse-portal-00001-4cx` with 100% traffic. The production sign-in page returned `200`, `/overview` redirected anonymous traffic to `/sign-in`, a login mutation without the configured origin returned `403`, an allowed-origin invalid login returned a safe `401`, the API/database health remained `ok`, the page rendered in Chrome, and the new portal revision had no error-level logs. No API database, JWT, Stripe, encryption, or wallet secrets were placed in the portal runtime.

Remaining gate work:

- Select a separate existing mobile payer account and fund its routine wallet with at least 0.01 devnet SOL and 5 devnet USDC.
- Confirm the hosted API has secure key configuration before changing `TRANSFER_PROVIDER` to `solana`.
- Complete the protected portal sign-in smoke against Cloud Run using the provisioned merchant account.
- Run mobile/API hosted regressions against the Cloud Run URL.
- Complete three real mobile scan-and-pay repetitions against the hosted devnet configuration.
- Run the first merchant usability session and record the three highest-priority findings.
