# Revised merchant plan — handoff

Sessions of 20–21 September 2026. Branch `feat/merchant-payment-infrastructure`.

Per-requirement status lives in
[docs/plans/revised-merchant-plan-checklist.md](plans/revised-merchant-plan-checklist.md).
This file records what changed, what was proven, and what is left.

## 1. Where this stands

The API-side platform is built and its money paths are proven against real
Stripe and a real chain. The merchant portal now has the account experience,
General Analytics and a live counter; the mobile app has a merchant Receive
screen. What remains is almost entirely the **hosted** demonstration: nothing
has been deployed, so none of the M.* email scenarios can be run.

| Status | Count | Share |
| --- | --- | --- |
| verified | 94 | 47% |
| built (code plus local tests) | 88 | 44% |
| in-progress | 1 | 0% |
| not-started | 16 | 8% |
| blocked / deferred | 2 | 1% |

201 tracked requirements. At the previous handoff this was 50 verified, 83
built, 26 in-progress, 40 not-started.

"Verified" means evidence of the kind the requirement demands exists. Code
presence and a passing mock never counted. Browser evidence is written
`B(local)` when it was produced against a local build with the API stubbed at
the proxy boundary, and `B(hosted)` against the deployed environment. Only
`B(hosted)` satisfies M.*.

## 2. The findings that mattered

Each of these was found by running the thing, not by reading it.

### Two instances could both broadcast the same transfer

The recovery sweep read an operation at `reserved`, checked the status,
decrypted the key and signed. Two instances doing that in the same moment both
passed the check. The database rejected the second status change — after the
second transaction was already on chain. `financial_operations` now carries a
lease (`claimed_until`, `claimed_by`, migration 0027) taken before any
irreversible work, and the post-webhook nudge goes through the same path as the
sweep. Found by X.1.

### A customer could not pay a merchant on devnet at all

F.4 had "only ever run on the mock provider", and running it explained why: the
P2P provider made the payer the fee payer and the rent payer for a missing
destination token account. Users hold no SOL by design, so a first-time
merchant's payment failed with `TokenAccountNotFoundError`. The provider now
delegates to the same `sendSplTransfer` the account flows use, with the
treasury paying. A customer has since paid a merchant invoice on devnet with
the tokens verified on both sides by independent RPC query.

### Every withdrawal's authorization record was being silently dropped

`audit_logs.entity_id` is a uuid column, and a Stripe payout destination is
`ba_1UHr…`. The insert failed, and the audit service swallows write failures by
design so that a bookkeeping problem cannot refuse a legitimate transfer — so
the records vanished without a trace. Non-uuid subjects now go in the metadata.
Found by watching the devnet suite's log output.

### The portal's insights route was blocked, and the failure was invisible

`me/insights` was missing from the proxy allowlist, so every request 404'd. The
panel then hit `return null` on a failed fetch, so a refused route and a
merchant with nothing to report rendered identically. Both fixed; N.14.

### The finance package quietly truncated its own evidence

It took the first 5,000 sales from a paginated list. A merchant past that would
have handed a lender a package whose detail disagreed with its own headline and
said nothing about it. It now reads every sale in the period and carries an
integrity block comparing the two. R.17.

## 3. What was built

### Money movement and custody

- **O.2/O.3** — `POST /wallets/transfer` generated its own idempotency key, so
  a retry moved the money twice. The key is now required from the client and
  namespaced per user on the ledger's unique index.
- **K.10** — authorizations and signatures are recorded in `audit_logs`: who
  was allowed or refused and why, and what was signed, by which address and key
  version. The record shape is closed and a guard refuses metadata naming a
  secret field.
- **K.11** — startup refuses the configurations that mix environments in either
  direction.
- **X.10** — a reconciler compares each wallet's ledger position against its
  chain balance and subtracts what in-flight operations account for, so only
  the unexplained part is reported. An unreadable RPC is its own state.
- **P.6** — `GET /health/operations` reports pending operations, webhook
  failures, stream activity and worker backlog, with reconciliation on request.

### The merchant portal

- **A.1–A.10** — Holding and Routine on the Payment page, with pending kept
  apart from available, today's receipts kept apart from what is spendable, and
  the euro figure always a labelled conversion. No screen asks for a token, a
  network, an address or a seed phrase, and a test asserts each of those words
  is absent.
- **E.1–E.7** — the day-end panel, with the limit that bound the suggestion
  named and the amount editable.
- **Q.1** — "Create invoice / QR" on a catalogue product opens the itemised
  flow already loaded.
- **Q.4/Q.6/Q.8/Q.10** — the portal consumes the event stream, shows what is on
  the counter, and names its connection state; a refused stream falls back to
  polling and says so.
- **Q.13** — the receipt history carries settlement, fees, net, stock moved and
  a reconciliation state that distinguishes "not matched" from "nothing to
  match against".
- **T.15/V.7/V.9/V.12** — General Analytics has a portal page for the first
  time. Every chart carries its numbers, every detail table sorts and pages.
- **N.13/N.14** — insights report their own freshness and their last failed
  recalculation, and a failed read says so rather than rendering as nothing.

### Mobile

- **Q.4/Q.8/Q.11** — a merchant Receive screen showing whatever is on the
  counter, over a real event stream built on Expo's streaming fetch, opened on
  focus and closed on blur. Metro had to be configured for the monorepo before
  the app could resolve a workspace package at all; both bundles verified with
  `expo export`.

### Data

Four additive migrations beyond the previous handoff's 0023–0026:

| Migration | Contents |
| --- | --- |
| `0027_operation_claims` | The operation lease that stops two instances acting at once |
| `0028_sale_line_category_snapshot` | The product category as it stood at the sale |

## 4. Tests and demonstrations

| Suite | Count | Command |
| --- | --- | --- |
| API unit | 447 | `pnpm --filter api test` |
| Integration, real Postgres | 221 | `pnpm --filter api test:integration` |
| Devnet, real chain | 17 | `pnpm --filter api test:devnet` |
| Portal browser (mobile, tablet, desktop) | 133 | `pnpm --filter portal test:e2e` |
| Portal unit | 30 | `pnpm --filter portal test` |

Also passing: `pnpm --filter api build`, `pnpm --filter portal exec tsc
--noEmit`, `pnpm --filter mobile exec tsc --noEmit`, and `expo export` for iOS
and Android. Lint is clean on all new code; the portal's four pre-existing
warnings and the API's Prettier baseline were left as the team chose.

### Measured, not asserted once

- **Event propagation** between two instances: p50 2.1ms, p95 16.7ms, max
  28.6ms over 40 events, against a two-second target (Q.12, P.3).
- **Orchestration**: six merchants with 60 days of sales each refresh in 365ms;
  worst case including the fixed 60-second cadence is 60.4s against the
  two-minute target (N.12).
- **Benchmark at plan scale** (100,000 transactions, 1,000 products): the
  insight engine 37.1s, the three General Analytics calculators 28.9s (P.1).
  `pnpm --filter api analytics:load`.
- **Payment API p95** against a committed baseline, failing only on a
  regression that is both over 10% and outside a 3ms noise floor (P.2).
  `pnpm --filter api perf:payment`.

### Solana devnet

Treasury `82ihqmVixpNYoqJDrGPSexJ6kV2JP8Mis38pAnzzXqV4`, funded by Fred.
Earlier signatures are listed in the checklist; the new one is F.4:

| Signature | What it proves |
| --- | --- |
| `2rkAT2QN…` | A customer paying a merchant invoice: tokens leave the customer's wallet and arrive in the merchant's, both confirmed by independent RPC query, with the receipt and the ledger agreeing |

## 5. Deployment status

**Nothing has been deployed.** Per your decision, work stops at the deploy
boundary.

Migrations 0023–0028 have been applied **to the local development database
only**. All are additive: no table is altered destructively and no data is
rewritten. A hosted release would additionally need:

- A verified pre-migration backup.
- `SOLANA_TREASURY_SECRET_KEY` in Secret Manager, and the treasury funded there.
- `TRANSFER_PROVIDER=solana`, which is currently `mock`. Startup now refuses to
  run production with `mock`, so this cannot be forgotten.
- Stripe webhook events for `checkout.session.*` and `payout.*` registered
  against the deployed endpoint.
- `OPS_MONITORING_TOKEN`, or `GET /health/operations` stays a 404.

The migration-journal trap still stands: entries 0019–0028 carry `when`
timestamps dated 2027, so a correctly dated new migration is **silently
skipped**. New migrations must continue the 2027 sequence until the journal is
repaired.

## 6. What is left

### Needs a deployment

All 15 remaining hosted demonstrations (M.1, M.3–M.10, M.12–M.16) and the three
rollout items (P.4 backups, P.5 deployment order, P.7 recovery during
rollback). Every one of these is now blocked only by the deploy decision: the
software each exercises is built and locally proven.

M.11 and M.16 are the two closest — both need only a hosted run.

### External blockers, unchanged

| Blocker | Blocks | Resolution |
| --- | --- | --- |
| A readable test inbox | R.19, inbox-delivery evidence | A mailbox the tester can open |
| A physical device | QR acceptance on hardware; the mobile half of Q.4, Q.8 and Q.11 | Required explicitly by plan §5 |
| An external inventory export | A pre-existing acceptance gap | A file from a named third-party tool |
| George's scoring model | R.8's adapter target | Formulas, inputs, thresholds, version, expected outputs |

### Honest summary

The work that can be done without deploying is done. The remaining 16
not-started items are the hosted acceptance run and the rollout steps that
depend on it, plus four external dependencies that are not mine to resolve.
Deploying is your decision, and this is the point at which it becomes the
thing standing between the plan and a demonstration.
