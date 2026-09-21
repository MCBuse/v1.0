# Merchant implementation review — 21 September 2026

**Verdict: substantial implementation, but the revised plan is not complete. Code fixes are required before hosted acceptance; deployment alone will not close the gaps.**

Reviewed tree: `e46f3ec` on `main`, whose contents match implementation commit `49f4e89`. Contract: the revised merchant plan and its requirement IDs in `docs/plans/revised-merchant-plan-checklist.md`, including Kabe's email, hidden stablecoin infrastructure, sandbox/devnet settlement, and readiness assessment fallback. This review does not authorize or perform deployment.

This is a targeted source and behavior review, not an exhaustive security audit. References below use repository-relative paths and one-based lines. P1 means fix before accepting the affected money, finance or hosted demonstration path. P2 means required correctness or product-completion work before calling the plan complete.

## Findings

### 1. P1 — Mobile transfers bypass the new chain-backed settlement service

**Evidence:** `apps/mobile/features/transfer/repository.ts:8` calls `/wallets/transfer`. `apps/api/src/wallets/wallets.service.ts:145–225` explicitly implements that route without an on-chain transaction: it debits one database balance, credits the other and immediately records completion.

**Impact:** After a genuine Holding top-up, moving money to Routine in the app moves only the displayed balance. Tokens remain in Holding. A subsequent Routine payment can fail for insufficient on-chain funds despite the displayed balance. This is also an accounting divergence when portal and mobile operate on the same wallets.

**Required:** Route the legacy endpoint through the durable account-transfer implementation, preserving its client contract, and connect mobile funding/transfers to the agreed account flow. Test customer funding → mobile move → QR payment with matching database and token balances. Covers F.3/F.4 and O.1–O.7.

### 2. P1 — Environment checks reject the intended hosted sandbox

**Evidence:** `deploy/cloud-run/api.env.yaml:1` sets `NODE_ENV: production`. `apps/api/src/config/environment-separation.ts:71–85` forbids devnet and Stripe test keys whenever NODE_ENV is production; `config.validation.ts:325` invokes the check.

**Reproduction:** Calling the validator with production NODE_ENV, a devnet RPC, `TRANSFER_PROVIDER=solana`, and a placeholder `sk_test_` key returns two fatal problems. Switching the hosted provider from mock to Solana does not resolve them.

**Required:** Separate application runtime mode from financial environment. Support a production-built hosted sandbox while enforcing matching test Stripe credentials, devnet mint/RPC, and sandbox treasury. Do not resolve this by moving the demonstration to live money. Covers K.11 and P.5.

### 3. P1 — Funding creation cannot resume after interruption and can race its runner

**Evidence:** `apps/api/src/accounts/account-funding.service.ts:106–129` creates the durable operation but immediately returns on replay, even with no Checkout URL. Stripe creation happens later at line 143 and its reference is persisted at line 178. `operation-runner.service.ts:144–158` terminally fails a funding operation still at `created` as `never_started`.

**Impact:** An interruption around Checkout creation leaves an operation that cannot recover its provider session. The periodic runner can also encounter the newly created operation while Stripe creation is still in progress. A session created before a crash may have no stored provider reference for webhook correlation.

**Reproduction:** Invoking the real funding replay branch with a persisted `created` operation returns `checkoutUrl: null`; invoking the real runner start branch then changes it to `failed/never_started`.

**Required:** Make Checkout creation a leased, resumable operation step. Reuse the existing Stripe idempotency key to recover the session before persisting its reference. Test crashes before and after the provider response, plus concurrent runner execution. Covers O.4–O.6.

### 4. P1 — A collected top-up can fail permanently without delivery or refund

**Evidence:** `apps/api/src/accounts/account-funding.service.ts:326–335` marks a failed treasury transfer terminally failed. `operation-runner.service.ts:196–210` does the same when chain failure is discovered later. `financial-operations/operation-state.ts:63–67` does not regard collected funding as irreversible; `failed` has no recovery action.

**Impact:** Stripe collection has already succeeded at this point. The merchant can receive neither Holding credit nor a compensating refund, while recovery stops. Withdrawal compensation does not cover this funding path.

**Reproduction:** The state machine permits `funding_card: chain_submitted → failed`, after which `resumeAction` returns `none`.

**Required:** Keep collected-but-undelivered funding recoverable; implement recorded delivery retry or provider refund/compensation, including definitive chain failure. Verify the final provider, chain and ledger outcome together. Covers O.5/O.8/O.9 and F.1/F.2.

### 5. P1 — A prepared transaction can remain pending forever after a crash

**Evidence:** `apps/api/src/solana/spl-transfer.ts:112–118` persists the signature before broadcasting. It does not persist the signed transaction bytes or blockhash expiry with the operation. `signatureStatus` at line 161 treats a missing signature as pending indefinitely; `operation-runner.service.ts:189–193` only defers polling.

**Impact:** A crash between signature persistence and broadcast leaves nothing on chain to discover. Funds/reservations can remain pending permanently. Avoiding duplicate sends is necessary, but this is not restart recovery.

**Required:** Persist enough information to rebroadcast the identical signed transaction and determine expiry. Resolve an expired, definitively unlanded transaction before safely retrying or compensating. Test a process stop at the exact persistence/broadcast boundary. Covers O.4–O.6.

### 6. P1 — Downloaded finance evidence is not derived from the saved assessment it cites

**Evidence:** `apps/api/src/data-capture/merchant.controller.ts:615–630` creates the package before resolving/linking the assessment. `merchant-finance.service.ts:75–77,147–192` computes fresh readiness and persists/renders the artifacts without a saved assessment argument. The package fingerprint at lines 44–45 omits assessment ID. `assessment/merchant-assessment.service.ts:142–146` silently keeps the first link on conflict.

**Impact:** Selecting an older assessment can produce a document containing current readiness while the response names the older saved assessment. Replaying the same key with a different assessment can return a new assessment in the response while the stored link/artifacts remain unchanged. A checksum proves byte stability, not that those bytes contain the selected assessment.

**Reproduction:** Calling the actual controller method with instrumented dependencies produces the order `render and persist artifacts → load saved assessment → link assessment`; the returned snapshot and assessment can have different stages.

**Required:** Validate and resolve the assessment first; snapshot its identity, model, result and evidence window into the package before rendering. Include it in the idempotency fingerprint and atomically publish the complete package/link/artifacts. Covers R.10–R.12/R.16.

### 7. P1 — Historical stock, turnover and combined opening/closing figures are wrong

**Evidence:** `apps/api/src/data-capture/analytics/inventory-analytics.ts:401–405` starts reconstruction at today's on-hand quantity without reversing movements after the requested end date. `combined-analytics.ts:120–128` also treats today's quantity as the selected period's closing stock.

**Reproduction:** Opening stock 20; add 10 on September 1; sell 2 on September 2; add 72 on September 10. For September 1–2 the correct daily closings are 30 and 28, averaging 29. The calculator returns average stock **101**, labels it eligible, and reports turnover **0.0198** instead of approximately **0.0690**. Combined analytics reports opening/closing **92/100** instead of **20/28**.

**Required:** Reconstruct the as-of-period-end balance by reversing later movements before walking the selected period. Keep current stock explicitly separate. Apply the same reliable history to turnover, stock-out intervals and combined opening/closing figures. Covers V.7/V.10/V.11/C.1.

### 8. P2 — Combined analytics does not recognize actual adjustment records

**Evidence:** `apps/api/src/data-capture/analytics/combined-analytics.ts:118–119` looks for `restock` and `adjustment`. The stock adjustment endpoint writes `manual_adjustment` at `merchant-inventory.service.ts:255`; imports use `import_snapshot`.

**Impact:** The real adjustment contributes to net stock change but the named adjustment/restocking figures remain zero. Tests using invented movement names do not verify the real producer/consumer contract.

**Reproduction:** The recorded +10 manual adjustment in finding 7 produces `adjusted: 0` and `restocked: 0`.

**Required:** Share movement classifications between recording and analytics. If restocking needs a separate business meaning, capture it explicitly rather than assuming every positive adjustment is a restock. Test through the actual stock endpoint. Covers V.3/C.1.

### 9. P2 — Replenishment advice ignores reserved stock

**Evidence:** `apps/api/src/data-capture/analytics/combined-analytics.ts:350–377` calculates cover from `onHandQuantity`, and even places that value under the `availableQuantity` key. The inventory rankings likewise do not carry per-product available quantity.

**Reproduction:** With 100 on hand, 98 reserved, reorder threshold 5 and one unit sold per day, available stock is 2. The combined analysis nevertheless says there are **95 days** before reaching the reorder level.

**Required:** Use per-product available stock for availability/replenishment guidance and expose on-hand/reserved separately. Align the inventory risk lists and terminology with the same definition. Covers C.4 and the availability portion of N.6.

### 10. P2 — One-minute orchestration is not isolated in the deployed worker

**Evidence:** `apps/api/src/analytics-intelligence/analytics-orchestrator.service.ts:38–44` starts its timer on module initialization. That module is imported by the main API through `data-capture.module.ts:16`. The standalone `worker.ts:9` calls `runAll`, not the change queue; `scripts/cloud-run/deploy-analytics-worker.sh:16` still defaults to a six-hour schedule.

**Impact:** The one-minute calculation runs inside the API process, sharing its CPU/event loop. The existing separate job does not provide the planned one-minute queue cadence. A fast direct call to `tick()` does not establish the deployed two-minute freshness target.

**Required:** Provide an explicit worker execution mode/entry point for the queue, disable this computation in serving API instances, and configure a reliable one-minute execution mechanism for the demo pilot. Verify freshness and payment latency with that topology. Covers N.9/N.10/N.12 and P.2/P.3.

### 11. P2 — Analytics change notifications can be lost or falsely completed

**Evidence:** `apps/api/src/data-capture/merchant-activity.service.ts:69,96` enqueues after source transactions commit. `analytics-work-queue.service.ts:44–46,86–91` explicitly swallows enqueue failures. `analytics-orchestrator.service.ts:64–67` ignores the result of `runForMerchant`, although `merchant-insights.service.ts:93–104` can return `processed: false` for disabled/not-allowlisted merchants.

**Impact:** A committed sale can lose its only timely recalculation trigger. Another path clears queued work without calculating anything and reports it as processed. Reservation-only changes also have no enqueue call in the reviewed mutation paths, despite changing availability.

**Reproduction:** With `runForMerchant` returning `{processed:false, reason:'disabled'}`, the real orchestrator calls queue completion and reports `{processed:1, failed:0}`.

**Required:** Record an outbox marker in the same transaction as the source change; consume it asynchronously. Distinguish processed, deferred and intentionally discarded work. Include availability changes that require refreshed stock risk. Covers N.2–N.8/N.13.

### 12. P2 — Credit Assessment and Finance Match stop at backend coverage

**Evidence:** `apps/portal/app/(merchant)/credit-assessment/credit-assessment.tsx:14–20` still fetches the old read-only `me/credit-assessment` endpoint. It has no Run assessment action or saved history. `apps/portal/app/(merchant)/finance-match/page.tsx:18–53` sends only `periodDays`, offers no assessment selection, and does not display package/email-attempt history or the detailed saved assessment preview.

**Impact:** The merchant cannot demonstrate the saved assessment lifecycle specified in the revised plan. The checklist's R.1/R.7 verification is API evidence, not completion of the merchant action/history screens.

**Required:** Connect the portal to assessment create/read/history, allow a specific saved result to be selected for a package, and expose immutable preview/package/email history. Keep readiness clearly distinguished from George's future score. Covers R.1/R.7/R.10/R.11/R.14 and M.15/M.16.

### 13. P2 — Finance screen retries generate new idempotency keys

**Evidence:** `apps/portal/app/(merchant)/finance-match/page.tsx:20,30` calls `crypto.randomUUID()` inside every package creation and email submission attempt.

**Impact:** If the first request succeeds but its response is lost, the user's retry creates another package or sends another email. Server-side idempotency cannot deduplicate different keys.

**Required:** Retain a key for the same user intent across uncertain outcomes/retries, resetting it only for a genuinely new operation. Test dropped responses after successful persistence/submission. Covers R.16.

### 14. P2 — Truncated historical periods are labelled complete

**Evidence:** `apps/api/src/data-capture/analytics/transaction-analytics.ts:256–269` sets `partial` only when today lies inside the displayed bucket. It does not consider whether the selected range clips that bucket.

**Reproduction:** Querying September 2 at noon through September 3 at noon with weekly grouping returns a bucket labelled August 31–September 6 with `partial: false`.

**Required:** Mark buckets partial when either selected-range boundary truncates them, and distinguish elapsed/current-period incompleteness where useful. Test daily, weekly and monthly clipping. Covers T.13.

## Coverage against the plan

| Area | Assessment |
| --- | --- |
| Routine/Holding portal experience | Substantial UI and backend implementation exists. Mobile compatibility and settlement recovery still need findings 1–5 fixed. |
| Wallet/key management | Versioned encryption, address-preserving re-encryption, separate treasury and server-side signing are implemented. Unit tests pass. This review did not independently repeat backup restoration or hosted key rotation; deployment recovery evidence remains separate. |
| Product invoice/QR, receipt history and cash capture | Implemented in source, including persisted presentation and streaming support. Hosted desktop-to-physical-device demonstration remains unverified here. |
| General transaction analytics | Broad requested metric coverage exists: source shares, trends, hourly buckets, grouping, methods, charts and tables. Partial-period correctness remains open. |
| Inventory analytics | Broad coverage exists, with selling-price valuation and category snapshots. Historical reconstruction and reservation-sensitive interpretation require corrections. |
| Combined analytics | All four analyses exist. Presence is not correctness: historical balances, movement classification and availability guidance have reproduced defects. |
| Light change orchestration | Queue, recalculation and failure UI exist. Worker isolation, reliable triggers and deployed latency are incomplete. |
| Credit Assessment | Saved readiness backend exists. Merchant-facing run/history flow is incomplete. George's actual scoring integration remains an agreed external deferral, not a fabricated completed score. |
| Finance Match | Package/download/email infrastructure exists. Assessment fidelity, portal history/selection and retry handling remain open. |

## What was independently checked

- API unit suite: **44 suites, 447 tests passed** (`pnpm --filter api exec jest --runInBand --watchman=false`).
- Portal unit suite: **4 files, 30 tests passed** (`pnpm --filter portal test`).
- Executed the actual analytics functions with adversarial stock histories, reservations and clipped periods; results are recorded above.
- Executed the environment validator with safe synthetic configuration.
- Exercised actual funding replay/runner, finance-controller ordering, and orchestration methods with instrumented dependencies. These are isolated behavioral checks, not real provider transactions.
- Reviewed the implementation handoff/checklist and the relevant portal, mobile, financial operations, key-management, analytics and worker code.

No application code was changed. No deployment, provider payment, external email, live database migration or real-device test was performed. The implementing agent's PostgreSQL integration, devnet and mocked-browser counts are not relabelled as independently rerun evidence here.

## Acceptance evidence still needed

The implementation handoff accurately states that the branch has not been deployed. Respecting that boundary is not a defect. However, its statement that remaining work is almost entirely hosted demonstration is too strong given the findings above.

1. Measure QR propagation from the actual desktop UI to the physical mobile Receive screen, including request ID, amount and status. Checklist Q.12/P.3 currently use service-to-service timing, which does not prove this acceptance criterion.
2. Measure change-to-insight latency with the actual worker, scheduler and deployed data. The reported 365 ms direct processing time plus an assumed 60-second cadence is not a deployed p95 measurement.
3. Complete sandbox bank funding and eligible debit-card payout as full flows; API capability mappings and unit tests are not final provider settlement evidence. Recheck all balances against token positions.
4. Complete the hosted email scenarios after code corrections, including cash exclusion from wallet balances, day-end movement and full transaction attributes.
5. Download and email a package tied to a chosen saved assessment, verify the content and bytes, and confirm arrival in a readable test inbox. SMTP acceptance alone is insufficient.
6. Measure the agreed payment API p95 regression threshold. The current local benchmark additionally permits a 3 ms noise floor and takes the best of multiple rounds (`payment-api.perf.ts:39–46,92,177–186`); that is not the exact agreed 10% gate. Keep any local diagnostic allowance separate from the rollout criterion.
7. Verify backup restoration, migration order, hosted key recovery, monitoring and continued settlement recovery during rollback. Resolve the migration timestamp issue already called out by the implementation handoff before rollout.

Recommended handback order: fix money-path divergence/recovery and sandbox startup; fix assessment/package integrity; correct analytics; finish the assessment/finance screens and worker; then rerun targeted regression tests and perform the authorized hosted/device acceptance. Update checklist statuses to match the evidence actually obtained.
