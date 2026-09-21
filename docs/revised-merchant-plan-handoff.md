# Revised merchant plan — handoff

Session of 20–21 September 2026. Branch `feat/merchant-payment-infrastructure`.

Per-requirement status lives in
[docs/plans/revised-merchant-plan-checklist.md](plans/revised-merchant-plan-checklist.md).
This file records what changed, what was proven, and what is left.

## 1. What changed and why

### The finding that shaped everything

Stage 1 established that `TRANSFER_PROVIDER=mock` on Cloud Run and every
wallet in the database was empty on chain. **No devnet USDC had ever moved.**
Every prior "devnet" claim in this repository rests on the mock provider. The
plan's requirement for actual USDC transfers was therefore new work, not a
configuration change. That is recorded as S1.13.

### Stage 2 — custody and durable settlement

`financial_operations` plus an append-only event log now back every money
movement. A per-kind state machine enforces two rules: a chain transfer whose
outcome is unknown can only be *checked*, never resent, and a failure after
value has moved must pass through compensation rather than being declared.

Wallet encryption keys are versioned. Rotation verifies each record
round-trips to the same address before writing, and reports rather than
rewrites anything it cannot read. The devnet treasury key is held separately
from the wallet-encryption keys and pays network fees, so users never hold SOL.

### Stage 3 — account flows and QR synchronisation

`GET /accounts` returns Holding and Routine with available and pending
balances, today's receipts separated from spendable funds, and EUR as a
labelled conversion rather than an entitlement. Funding, transfers,
withdrawals and payout destinations each have endpoints; a recovery runner
resumes any interrupted operation from its last confirmed step.

The day-end sweep suggests the smaller of two limits and names which one bound
it. Cash is reported but never enters the arithmetic.

Cross-device QR synchronisation uses a durable event log with a Postgres
NOTIFY trigger, so any API instance serves any device. The portal proxy now
pipes event streams instead of buffering them.

### Stages 4–6 — analytics, orchestration, assessments

Three analytics sections are implemented as pure modules with no database, no
clock of their own and no randomness, which is what makes the combined
explanations reproducible. Orchestration coalesces change triggers into one
row per merchant and refreshes insights on a one-minute worker. Assessments
are now immutable saved rows behind a model registry, with finance packages
linked to the exact assessment they report.

## 2. Coverage

201 tracked requirements.

| Status | Count | Share |
| --- | --- | --- |
| verified | 50 | 25% |
| built (code plus local tests) | 83 | 41% |
| in-progress | 26 | 13% |
| not-started | 40 | 20% |
| blocked / deferred | 2 | 1% |

"Verified" means evidence of the kind the requirement demands exists. Code
presence and a passing mock never counted.

## 3. Tests and demonstrations

### Automated

| Suite | Count | Command |
| --- | --- | --- |
| API unit | 290 | `pnpm --filter api test` |
| Integration, real Postgres | 74 | `pnpm --filter api test:integration` |
| Devnet, real chain | 12 | `pnpm --filter api test:devnet` |

Also passing: `pnpm --filter api build`, `pnpm --filter portal exec tsc
--noEmit`. Lint is clean on all new code; roughly 100 pre-existing files carry
a Prettier baseline the team previously chose not to rewrite, and that
decision was left standing.

The integration suites use a real database deliberately. They prove four
racing requests create one operation, two concurrent reservations leave one
winner, ten racing reservations never overdraw, three concurrent
finalizations write one ledger entry, and two service instances sharing only
the database exchange events inside two seconds.

### Stripe sandbox

- Account `acct_1TVFXW7DIaW4cn1X`: card and ACH Direct Debit both active.
- Hosted Checkout created for card and for `us_bank_account`.
- Platform-controlled account `acct_1UHr638OsVu9qy2o` onboarded to
  `payouts_enabled` with a bank account and a Visa debit card.
- Instant payout to card `po_1UHr7M8OsVu9qy2otl6GutBz`; standard payout to
  bank `po_1UHr7O8OsVu9qy2oHVAoL1c8`.
- **A real hosted Checkout payment of USD 5.00 was completed in a browser**,
  session `cs_test_a1dPonXN…`, `payment_status: paid`.

### Solana devnet

Treasury `82ihqmVixpNYoqJDrGPSexJ6kV2JP8Mis38pAnzzXqV4`, funded by Fred.

| Signature | What it proves |
| --- | --- |
| `5Aex8rYv…` | Treasury to wallet; treasury 20 → 18.5 USDC |
| `Hf64i2ug…` | Holding to Routine; both wallets held **zero lamports**, fee payer on chain is the treasury |
| `8F7Hxzba…` | The funded USD 5.00 delivered as tokens; treasury 12.6 → 7.6, wallet 0 → 5 |
| `29Yzv7so…` | Holding to Routine through the live API; 5 → 3 and 0 → 2 |
| `3JejC2yM…` | Withdrawal returning tokens to the treasury *before* any payout existed |

Every one was verified by independent RPC query, not by trusting the
application's own status column.

The full funding chain ran end to end in **11 seconds**: collection settled
21:26:10, chain confirmed 21:26:17, finalized 21:26:21.

### Failures found by running it

These are the substantive ones. All are fixed and pinned by tests.

1. **A compensating operation could be declared failed.** `canTransition`
   checked `to === 'failed'` before checking whether the operation was already
   compensating. An operation mid-compensation could be moved straight to
   `failed`, stranding the reservation in `pending` forever with the tokens
   already gone. `fail()` made it worse by re-implementing the rules by hand.
   Found by forcing a real payout failure after tokens had moved.

2. **Step methods trusted a stale snapshot.** A worker holding an operation
   object taken before another worker advanced it would throw instead of
   no-opping. The ledger had already prevented a double credit, so this was a
   crash rather than a money bug.

3. **Polling filled the audit log.** One USD 5.00 funding produced 60
   identical `collection_update` rows around the 5 that mattered, because the
   runner logged every poll while the customer filled in the form.

4. **The work queue never cleared finished work.** `complete()` compared a
   Postgres microsecond timestamp against a JavaScript millisecond Date, so
   the condition never matched. The status itself already answers the
   question, so the comparison was removed entirely.

5. **Turnover was ineligible for every new product**, because the anchor
   demanded an opening balance before the period. A product created
   mid-period has knowable opening stock: zero, before it existed.

6. **Turnover reported a confident ratio on impossible history.** Backdated
   movements reconstructed a negative stock level and still produced a ratio
   of 16 against 0.75 average stock.

7. **An SSE snapshot carried a synthetic id.** A client reconnecting with
   `Last-Event-ID` would have replayed from near the start of the log. A
   fresh connection also replayed the entire history after the snapshot.

8. **The merchant-event suite was order-dependent**, catching an event still
   in flight from an earlier case. Each wait now filters for its own type;
   three consecutive runs pass.

Also fixed: a migration-journal trap. Entries 0019–0022 carry `when`
timestamps dated 2027, so a correctly dated new migration is **silently
skipped** — `drizzle-kit migrate` reports success having done nothing. New
migrations must continue the 2027 sequence until the journal is repaired.

## 4. Deployment and migration status

**Nothing has been deployed.** Per your decision, work stops at the deploy
boundary.

Four additive migrations were written and applied **to the local development
database only**:

| Migration | Contents |
| --- | --- |
| `0023_financial_operations` | Operations, event log, key versions, webhook dedup |
| `0024_merchant_events` | Merchant event log, presented request, NOTIFY trigger |
| `0025_merchant_analytics_work` | Analytics work queue |
| `0026_merchant_assessments` | Saved assessments, package link |

All are additive: no table is altered destructively and no data is rewritten.
Existing wallets are labelled `v1`, the key version they were already sealed
with; all 8 local wallets decrypt and derive their stored addresses.

A hosted release would additionally need:

- A verified pre-migration backup.
- `SOLANA_TREASURY_SECRET_KEY` in Secret Manager, and the treasury funded on
  the deployed environment.
- `TRANSFER_PROVIDER=solana`, which is currently `mock`. Without this, the
  hosted system still moves no tokens.
- Stripe webhook events for `checkout.session.*` and `payout.*` registered
  against the deployed endpoint.

## 5. Remaining work and blockers

### Not started

- **All 13 remaining hosted demonstrations (M.*).** No email scenario has
  been demonstrated in a browser or on a device, because no portal or mobile
  UI has been built. Every account feature so far is API-only.
- **All 7 performance and rollout items (P.*)**, including the
  100,000-transaction benchmark and the payment API p95 gate.
- **9 failure-path checks (X.*)**: concurrent operations under load, Stripe
  delayed success and failure, ledger/token reconciliation, key-version
  migration under restore, secrets excluded from logs, analytics boundary
  cases, each combined example, and automatic stock-risk create/resolve.
- **Q.1 and Q.11**: the per-product invoice entry point and the mobile
  Receive screen.
- **N.14**: the blocked portal insights route.
- **V.12**: sale lines still carry no category column, so historical category
  reporting uses the current one — labelled, but not snapshotted.
- **R.17**: silent export truncation in finance packages.

### External blockers

| Blocker | Blocks | Resolution |
| --- | --- | --- |
| Chrome extension not connected | Any browser demonstration I could run myself | Reconnect it, or drive the browser yourself as you did for Checkout |
| A readable test inbox | R.19, inbox-delivery evidence | A mailbox the tester can open |
| A physical device | QR acceptance on hardware | Required explicitly by plan §5 |
| An external inventory export | Pre-existing acceptance gap | A file from a named third-party tool |
| George's scoring model | R.8's adapter target | Formulas, inputs, thresholds, version, expected outputs |

### Honest summary

The API-side platform is substantially built and the money paths are proven
against real Stripe and a real chain. What is not done is everything that
makes it *demonstrable* to someone who is not reading a test report: the
portal and mobile interfaces, and the hosted acceptance run that depends on
them. That is the largest single remaining piece of work, and it has not been
started.
