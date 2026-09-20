# Revised merchant plan — requirement-by-requirement checklist

Source of truth: the revised plan "MCBuse Merchant Dashboard and Payment
Infrastructure". This file tracks every requirement and every email scenario to
its implementation and its verification evidence.

## How to read the status column

| Status | Meaning |
| --- | --- |
| `not-started` | No implementation yet. |
| `in-progress` | Partially implemented; not verifiable end to end. |
| `built` | Implemented, but only local/automated evidence exists. |
| `verified` | Implemented and proven by the evidence category the requirement demands. |
| `blocked` | Cannot proceed without an external dependency named in the row. |
| `deferred` | Out of scope by agreement in the plan. |

Evidence categories are kept separate and never substituted for one another:

- **L** — local automated tests and builds.
- **S** — Stripe sandbox result (real API objects and IDs).
- **D** — Solana devnet proof (real transaction signatures).
- **H** — hosted deployment status (Cloud Run revisions, migrations).
- **B** — authenticated browser or mobile demonstration.
- **I** — recipient inbox delivery confirmation.

A requirement is only `verified` when evidence of the category it names exists.
Code presence, a passing mock, or an initiated deployment never counts.

---

## Stage 1 — Confirm external capabilities (plan §4 step 1)

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| S1.1 | Stripe test key valid; account usable | verified | S — `acct_1TVFXW7DIaW4cn1X`, US, charges + payouts enabled |
| S1.2 | Card payments capability | verified | S — `card_payments: active` |
| S1.3 | ACH Direct Debit capability | verified | S — `us_bank_account_ach_payments: active` |
| S1.4 | Connect available for payout destinations | verified | S — 2 express accounts, `transfers: active`, payouts enabled |
| S1.5 | Bank payout destination eligible | verified | S — `ba_1TWaBz50q5xBIGFCpAuI2Prv`, `available_payout_methods: ["standard","instant"]` |
| S1.6 | Debit-card payout destination eligible | verified | S — `card_1UHr6Z8OsVu9qy2o1JkHBd8v` (Visa debit) on `acct_1UHr638OsVu9qy2o`, `available_payout_methods: ["standard","instant"]` |
| S1.7 | Platform sandbox balance sufficient for payouts | verified | S — USD 4,788.23 available in test mode |
| S1.14 | Platform-controlled connected account can be created and onboarded | verified | S — `acct_1UHr638OsVu9qy2o`, `payouts_enabled: true`, no outstanding requirements |
| S1.15 | Instant payout to debit card executes | verified | S — `po_1UHr7M8OsVu9qy2otl6GutBz`, USD 4.00, `method: instant`, status pending |
| S1.16 | Standard payout to bank executes | verified | S — `po_1UHr7O8OsVu9qy2oHVAoL1c8`, USD 5.00, `method: standard`, status pending |
| S1.17 | Hosted Checkout accepts card collection | verified | S — `cs_test_a148M4G89V6XEZvYzbyj9OjI4NXm3yLAzMuOZLjBJPq1u0c6NuxAZ9AYdm` |
| S1.18 | Hosted Checkout accepts ACH Direct Debit collection | verified | S — `cs_test_a1Llg2Kg8aXmqqWT2VEdoonbaSE9I8qpiWH2W2uUvUMjps2TH0GAPWg1te` |
| S1.8 | Devnet treasury keypair exists and is separately protected | built | L — `82ihqmVixpNYoqJDrGPSexJ6kV2JP8Mis38pAnzzXqV4`, loaded from `SOLANA_TREASURY_SECRET_KEY`, secret gitignored and never committed |
| S1.9 | Devnet treasury holds SOL for network fees | verified | D — 10.000000000 SOL (funded by Fred at faucet.solana.com) |
| S1.10 | Devnet treasury holds test USDC | verified | D — 20.000000 USDC at token account `Ci77zxoSMX9KZh44MbngJWT6gG48kXiLEf4Mc4phJNZv` (funded by Fred) |
| S1.11 | Hosted API reachable and healthy | verified | H — `api.mcbuse.com/api/v1/health` = ok, database ok |
| S1.12 | Deployment credentials available | verified | H — gcloud authenticated on `mcbuse-hackathon-2026-fno` |
| S1.13 | Hosted transfer provider currently `mock` | verified | H — Cloud Run env `TRANSFER_PROVIDER=mock`; no devnet USDC has ever moved |

S1.13 is the single most important finding of stage 1: the platform has never
executed a real devnet USDC transfer. Every prior "devnet" claim in the repo
rests on the mock provider. The plan's demand for actual USDC transfers is
therefore new work, not a configuration change.

---

## Stage 2 — Custody, durable settlement, reconciliation (plan §2C, §2E)

### 2E — Wallet and key management

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| K.1 | Preserve existing wallet addresses and encrypted private keys | verified | L — all 8 existing wallets decrypt and derive their stored address; migration 0023 is additive |
| K.2 | Signing stays server-side; clients receive only public wallet data | built | L — `wallets.service.ts` never selects `encryptedKeypair` into a response |
| K.3 | Validate owner, amount, currency, destination, operation state before signing | built | L — owner, amount and decrypted-key/address match are all checked before signing in transfer and withdrawal |
| K.4 | Separately protected devnet treasury key | built | L — `SOLANA_TREASURY_SECRET_KEY`, distinct from the wallet-encryption keys; refuses to fall back to a user wallet |
| K.5 | Treasury-managed SOL funding so users never obtain fee tokens | verified | D — transfer `Hf64i2ug…` succeeded with both user wallets at 0 lamports; fee payer on chain is the treasury |
| K.6 | Encryption-key version references on wallet records | verified | L — `wallets.encryption_key_version`, plus a version tag inside each new payload |
| K.7 | Controlled re-encryption to a new key version | verified | L — `wallets:key-rotate` with dry-run; integration test rotates v1 to v2 preserving every address |
| K.8 | Old key versions retained until migration and recovery checks pass | verified | L — integration test proves a restored v1 record fails recovery once v1 is dropped and passes while retained |
| K.9 | Restore encrypted wallet records with the correct key version (tested) | verified | L — `wallets:key-verify`; 8/8 local wallets pass |
| K.10 | Audit authorizations and signatures without logging secrets | not-started | — |
| K.11 | Devnet credentials separated from any future production environment | not-started | — |

### 2C — Reliable financial operations

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| O.1 | Durable operation records for reservations, chain submission/finality, Stripe transfers, payouts, recovery | built | L — `financial_operations` + event log; 18 integration tests |
| O.2 | Stable client idempotency keys accepted | in-progress | Present for merchant payments, cash sales, imports, finance packages; absent for funding/withdrawal/internal transfer |
| O.3 | Reuse with different inputs rejected | in-progress | Same coverage as O.2 |
| O.4 | Persist prepared blockchain signatures and provider references | built | L — signature derived and persisted before broadcast in `spl-transfer.ts` |
| O.5 | Resume from last confirmed step after timeout or restart | built | L — `OperationRunnerService` dispatches on the stored status every 15s |
| O.6 | Keep uncertain transactions pending while reconciling; never blindly resend | built | L — state machine has no `resend_chain` action; test asserts it for every kind and status |
| O.7 | Finalize balances exactly once | built | L — `recordOnce` keyed by operation id; concurrent finalize writes one entry |
| O.8 | Restore funds only after confirmed reversal or compensating transfer | verified | D — payout failure holds the balance until the treasury's return confirms on chain, then releases |
| O.9 | Record late provider failures or reversals without rewriting history | verified | D — 9-event log across the compensated withdrawal, every step intact |
| O.10 | Top-ups, internal transfers and withdrawals are account movements, not merchant sales | built | L — these flows write ledger entries only; no merchant transaction is created |
| O.11 | Recorded physical cash never increases digital wallet balances | built | L — cash sales write merchant records only |

---

## Stage 3 — Account flows, product invoices, synchronized QR (plan §2A, §2B, §2D, §3A)

### 2A — Simple account experience

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| A.1 | Routine and Holding account cards on Payment | in-progress | API side done (`GET /accounts`); portal UI not yet built |
| A.2 | Available and pending balances shown per account | in-progress | In the API response; portal UI not yet built |
| A.3 | Recent activity and relevant actions per account | in-progress | API returns both; portal UI not yet built |
| A.4 | Today's digital receipts shown separately from spendable funds | in-progress | In `GET /accounts` and the day-end view; portal UI not yet built |
| A.5 | Converted EUR amounts labelled with conversion timestamp | in-progress | `converted.rate`/`quotedAt` in the API; portal UI not yet built |
| A.6 | Actions named Add money / Move money / Pay / Withdraw | in-progress | API returns these labels per account; portal UI not yet built |
| A.7 | No token or network selection in the demonstration journey | not-started | — |
| A.8 | No seed phrases, no address pasting, no user-obtained SOL | not-started | — |
| A.9 | Custody, fee and conversion information remains accessible | in-progress | `custody` block in `GET /accounts`; portal UI not yet built |
| A.10 | EUR display must not imply a fixed EUR entitlement over a USDC balance | in-progress | API carries an explicit note; portal must render it |
| A.11 | Wallets resolved from the merchant's receiving-wallet owner | built | L — `AccountWalletsService.forMerchantOwner` |
| A.12 | Money-moving actions restricted to the authorized owner | built | L — a membership alone cannot move money; only the receiving-wallet owner can |

### 2B — Money flows

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| F.1 | Debit card → Holding via Stripe-hosted Checkout, then devnet treasury funds Holding | verified | S + D — `cs_test_a1dPonXN…` paid USD 5.00; devnet `8F7Hxzba…` treasury 12.6→7.6, wallet 0→5; Holding credited 500c in 11s |
| F.2 | Bank → Holding via USD ACH Direct Debit, pending until success, then treasury funds Holding | built | L + S — same service with `us_bank_account`; only `payment_status=paid` advances |
| F.3 | Holding → Routine: reserve, transfer test USDC between wallets, finalize once | verified | D — devnet suite moves 0.25 USDC; ledger and chain agree; repeated finalize writes no second entry |
| F.4 | Customer Routine → merchant Routine on devnet, with matching receipts | in-progress | Flow exists; has only ever run on the mock provider |
| F.5 | Merchant Routine → Holding, merchant-confirmed, with day-end option | built | L + D — day-end confirm routes through the verified transfer flow |
| F.6 | Holding → bank: reserve, return USDC to treasury, then Stripe sandbox payout | verified | D + S — chain `3JejC2yM…` returns tokens first (providerRef still null), then payout `po_1UHsax8O…` USD 0.25 |
| F.7 | Holding → debit card: same sequence to an eligible debit-card destination | verified | S — `card_1UHr6Z8O…` routes to `withdrawal_card` with instant payout method |
| F.8 | Treasury transfer explicit in implementation and in evidence | verified | D — `5Aex8rYv…` moved treasury 20 → 18.5 USDC; funding and withdrawal both route through the treasury explicitly |
| F.9 | Payout destinations and capabilities retrieved from Stripe | verified | S — live read of `acct_1UHr638O`: 3 destinations, payoutsEnabled, balances, no outstanding requirements |
| F.10 | Incomplete onboarding, ineligible destination, insufficient provider balance are real states | built | L — each is a named state with a reason; none is substituted with success |
| F.11 | An unavailable provider route is never replaced by unlabeled simulated success | verified | S — a USD 25 funding request was refused live: "Treasury holds 16500000 USDC base units; 25000000 are required" |
| F.12 | Bank funding treated as asynchronous; redirect is not settlement | built | L — only `payment_status=paid` advances; `async_payment_failed` fails the operation |
| F.13 | Sandbox conversion fixed at 1 USD per test USDC | verified | L — `operation-money.ts`; any other configured rate is refused, not silently applied |
| F.14 | Quoted EUR conversion preserved for merchant purchases | built | L — `quoteRateScaled` snapshot on payment requests |
| F.15 | Integer arithmetic and explicit rounding throughout | built | L — new flows are bigint end to end and round down for payouts. The legacy widget on-ramp still uses floating point |

### 2D — Day-end transfer

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| E.1 | Show today's digital receipts | built | L — `GET /accounts/day-end`; integration test covers count and total |
| E.2 | Show prior tagged day-end transfers | built | L — prior `merchant_dayend` operations for the business date, with actor |
| E.3 | Show current available Routine funds | built | L — available and pending reported alongside the suggestion |
| E.4 | Suggested amount capped by available funds and by today's receipts net of previous day-end transfers | built | L — 10 unit tests on the cap rule plus integration coverage; reports which limit bound |
| E.5 | Merchant can edit and confirm the amount | built | L — `POST /accounts/day-end` takes any amount; suggestion is advisory |
| E.6 | Merchant timezone used; business date, actor and transfer reference recorded | verified | L — live endpoint returned businessDate 2026-09-21 at 22:00 UTC for a Europe/Berlin merchant |
| E.7 | Cash totals explained separately as non-sweepable | built | L — cash reported in its own currency, excluded from the arithmetic, with an explanatory note |

### 3A — Product invoices, QR synchronization, history

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| Q.1 | "Create invoice / QR" on catalogue products opens the itemized invoice flow preloaded | not-started | Itemized invoice flow exists; no per-product entry point |
| Q.2 | Each purchase gets a unique request preserving names, SKUs, quantities, prices, conversion snapshot | built | L — invoice items + quote snapshot |
| Q.3 | Reserve stock on creation, consume on finalized payment, release on expiry or cancellation | built | L — `merchant-inventory.service.ts` |
| Q.4 | "Present on app" action and a dedicated merchant Receive screen | not-started | — |
| Q.5 | Selected request persisted server-side | not-started | — |
| Q.6 | Presentation and status changes delivered by authenticated SSE | not-started | — |
| Q.7 | Events backed by a PostgreSQL event log and cross-instance notification | not-started | — |
| Q.8 | Streaming portal proxy and authenticated mobile streaming | not-started | Portal proxy currently buffers JSON |
| Q.9 | Replay missed events or reload authoritative state on reconnect | not-started | — |
| Q.10 | Polling fallback and visible connection status retained | not-started | — |
| Q.11 | Receive screen updates without hijacking unrelated mobile screens | not-started | — |
| Q.12 | Two-second p95 propagation, matching request ID, amount and status | not-started | — |
| Q.13 | Searchable, paginated transaction history with all listed financial attributes | in-progress | Many attributes exist; stock impact, fees, net amount, reconciliation state incomplete |
| Q.14 | Cash entry, historical sale time, private attachments, stock-already-accounted-for, audited voids retained | built | L + H — existing behaviour to be preserved |

---

## Stage 4 — General Analytics (plan §3B, §3C, §3D)

### 3B — General Transaction Analytics

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| T.1 | Shared date, source and environment filters | built | L — existing analytics filters |
| T.2 | Today filter | not-started | — |
| T.3 | Explicit daily / weekly / monthly grouping | in-progress | Grouping is currently implied by range length |
| T.4 | Total recorded sales and transaction count | built | L |
| T.5 | Average transaction value | built | L |
| T.6 | Cash and digital amounts, counts and percentage shares | in-progress | Amounts exist; counts and shares incomplete |
| T.7 | Daily, weekly and monthly sales | in-progress | — |
| T.8 | All 24 hourly sales and transaction buckets | built | L — `hourlyRhythm` |
| T.9 | Peak hours and trading windows | not-started | — |
| T.10 | Sales, transaction-count and average-value trends | in-progress | Sales trend only |
| T.11 | Payment-method distribution | not-started | Payment method is not yet separated from capture channel |
| T.12 | Merchant-local boundaries and comparable periods | built | L — `merchantLocalDateKey` |
| T.13 | Explicit partial-period and missing-baseline labels | not-started | — |
| T.14 | Entire selected range accessible, not silently truncated to 14 entries | not-started | — |
| T.15 | Readable charts plus accessible table detail | not-started | — |

### 3C — General Inventory Analytics

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| V.1 | On-hand, reserved and available quantities | in-progress | On-hand exists |
| V.2 | Inventory value at current selling prices | not-started | — |
| V.3 | Period-specific stock movements by type | in-progress | Movements recorded; not reported by type per period |
| V.4 | Fast-moving products ranked by units per day | not-started | — |
| V.5 | Slow-moving and stocked-but-unsold products | not-started | — |
| V.6 | Products at or below minimum and approaching minimum | in-progress | Low-stock count exists |
| V.7 | Current stock-outs and historical intervals where records support them | not-started | — |
| V.8 | Inventory turnover across eligible products | not-started | — |
| V.9 | Product and category sales with sortable, paginated detail | in-progress | Product sales exist; category detail does not |
| V.10 | Turnover = units sold ÷ average recorded daily closing on-hand stock | not-started | — |
| V.11 | Insufficient history reported where opening stock is unreliable | not-started | — |
| V.12 | Category snapshot captured on new sale lines | not-started | — |
| V.13 | Legacy category fallback labelled explicitly | not-started | — |
| V.14 | Selling-price valuation never presented as cost, profit or margin | built | L — documented boundary |

### 3D — Combined Analytics

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| C.1 | Sales versus stock: revenue, units, opening/closing stock, restocking, adjustments, net change | not-started | — |
| C.2 | Trading concentration: transaction and revenue shares, default busiest contiguous three-hour window | not-started | — |
| C.3 | Volume versus value: transaction growth, revenue growth, average-ticket change together | not-started | — |
| C.4 | Velocity versus availability: sales speed, available stock, threshold, replenishment guidance | not-started | — |
| C.5 | Explanations generated deterministically | not-started | — |
| C.6 | AI wording optional and never alters calculations | built | L — narration is already separated from calculation |
| C.7 | Sales filters applied consistently | not-started | — |
| C.8 | Physical stock labelled as whole-stock data; no false discrepancies against filtered sales | not-started | — |

---

## Stage 5 — Light orchestration (plan §3E)

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| N.1 | Sale or stock change → recalculate metrics → update stock risk → refresh or resolve insight | not-started | Insight engine exists but is schedule-driven only |
| N.2 | Triggered by finalized digital sales | not-started | — |
| N.3 | Triggered by cash entry and void | not-started | — |
| N.4 | Triggered by stock adjustments | not-started | — |
| N.5 | Triggered by committed imports | not-started | — |
| N.6 | Reservation changes affect availability but not completed-sales totals | not-started | — |
| N.7 | Durable events with source transactions | not-started | — |
| N.8 | Repeated changes coalesced | not-started | — |
| N.9 | One-minute background worker | not-started | Worker currently runs every six hours |
| N.10 | Expensive calculation kept outside payment requests | built | L — worker is a separate Cloud Run job |
| N.11 | Existing forecast history requirements reused; unreliable projections suppressed | built | L — documented thresholds |
| N.12 | Two-minute p95 insight update under demonstration load | not-started | — |
| N.13 | Freshness and failures shown | in-progress | Staleness threshold exists |
| N.14 | Blocked portal insights route fixed; fetch failure never renders as an empty panel | not-started | — |
| N.15 | Automatic purchasing and paid intelligence excluded | deferred | By agreement |

---

## Stage 6 — Credit Assessment and Finance Match (plan §3F)

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| R.1 | "Run assessment" action | not-started | Assessment is currently computed on read |
| R.2 | Immutable persisted `readiness-rules-v1` result | not-started | — |
| R.3 | Result carries ID, model/version, timestamp, evidence window | in-progress | Version exists; not persisted per run |
| R.4 | Result carries business profile and consent | in-progress | — |
| R.5 | Result carries passed/missing requirements and readiness stage | built | L — `merchant-readiness.ts` |
| R.6 | Result carries reliability metrics, source coverage, limitations | in-progress | — |
| R.7 | Assessment history | not-started | — |
| R.8 | Adapter boundary for George's future model | not-started | — |
| R.9 | No fabricated credit score; fallback never claimed as George's integration | built | L — documented |
| R.10 | Finance Match package linked to a saved assessment | not-started | Packages exist but are not linked to a saved assessment |
| R.11 | Preview and download the same immutable PDF/data snapshot | in-progress | Immutable package exists; no preview |
| R.12 | 7/30/90-day reporting preserved, assessment window labelled separately | in-progress | — |
| R.13 | Provenance, limitations and demonstration labels included | built | L + H |
| R.14 | Package and email-attempt history | in-progress | Attempts recorded; no history view |
| R.15 | Explicit recipient confirmation preserved | built | L + H |
| R.16 | Retries never duplicate packages or messages | built | L + H — idempotency fingerprints |
| R.17 | Silent export truncation removed; exported detail reconciles to totals | not-started | — |
| R.18 | SMTP acceptance distinguished from confirmed inbox delivery | built | H — recorded as `accepted_by_smtp` |
| R.19 | Delivery verified to a designated test inbox | blocked | Needs a mailbox the tester can read |
| R.20 | Sending to a financial institution remains an explicit merchant action | built | L |

---

## Stage 7 — Verification and completion (plan §5)

### Failure-path checks

| ID | Check | Status |
| --- | --- | --- |
| X.1 | Concurrent operations | not-started |
| X.2 | Insufficient funds | verified (L + D) — refused for transfer and withdrawal; concurrent reservations never overdraw |
| X.3 | Duplicate submissions | verified (L) — idempotent replay, conflicting reuse refused, 4-way race yields one record |
| X.4 | Unauthorized cross-merchant access | in-progress |
| X.5 | Blockchain timeout, restart, reconciliation without duplicate transfer | in-progress |
| X.6 | Stripe delayed success | not-started |
| X.7 | Stripe failure | not-started |
| X.8 | Duplicate Stripe webhooks | built (L) — events persisted by id; redelivery recognised, differing body refused |
| X.9 | Payout failure after token movement | verified (D) — also found a real bug: a compensating operation could be declared failed, stranding the reservation |
| X.10 | Ledger and token reconciliation and recovery | not-started |
| X.11 | Key-version migration and backup restoration | not-started |
| X.12 | Secrets excluded from responses and logs | not-started |
| X.13 | Invoice reservation, expiry, cancellation, cash void | built |
| X.14 | Cross-device event replay, reconnect, multiple API instances | not-started |
| X.15 | Analytics totals, timezone boundaries, empty periods, missing baselines, mixed sources, incomplete stock history | not-started |
| X.16 | Every combined-analysis example | not-started |
| X.17 | Automatic stock-risk creation and resolution | not-started |
| X.18 | Assessment reproducibility, package immutability, email retry | in-progress |

### Hosted demonstration — the email scenarios

| ID | Scenario | Status |
| --- | --- | --- |
| M.1 | Both accounts visible and accurate | not-started |
| M.2 | Card funding into Holding | verified (S + D) — real hosted Checkout paid, tokens delivered, balance credited |
| M.3 | Bank funding into Holding | not-started |
| M.4 | Holding → Routine transfer | not-started |
| M.5 | Product invoice created on desktop | not-started |
| M.6 | Invoice displayed on mobile | not-started |
| M.7 | Customer devnet payment received into merchant Routine | not-started |
| M.8 | Merchant-confirmed day-end move to Holding | not-started |
| M.9 | Bank withdrawal | not-started |
| M.10 | Eligible debit-card withdrawal | not-started |
| M.11 | Cash capture with correct history and stock effects | built (needs B) |
| M.12 | Transaction details with all required financial attributes | not-started |
| M.13 | Complete Transaction, Inventory and Combined Analytics | not-started |
| M.14 | Change creates a stock-risk insight; replenishment resolves it | not-started |
| M.15 | Saved readiness assessment | not-started |
| M.16 | Downloaded and emailed assessment package match | in-progress |

### Performance and rollout

| ID | Requirement | Status |
| --- | --- | --- |
| P.1 | Re-run the 100,000-transaction / 1,000-product benchmark | not-started |
| P.2 | Payment API p95 degradation within the 10% rollout gate | not-started |
| P.3 | QR and orchestration latency measured against targets | not-started |
| P.4 | Backups verified before migrations | not-started |
| P.5 | API deployed before clients; demonstration merchants enabled first | not-started |
| P.6 | Monitoring for pending operations, reconciliation differences, webhook failures, stream health, worker backlog | not-started |
| P.7 | Recovery workers keep running during rollback | not-started |

---

## Open external dependencies

| # | Dependency | Blocks | Resolution |
| --- | --- | --- | --- |
| 1 | Devnet SOL for the treasury | S1.9, every devnet transfer | Fred funds `82ihqmVixpNYoqJDrGPSexJ6kV2JP8Mis38pAnzzXqV4` at faucet.solana.com, cluster **Devnet** (agreed 2026-09-20) |
| 2 | Devnet test USDC for the treasury | S1.10, F.1–F.3, F.6–F.8 | Fred funds the same address at faucet.circle.com, chain **Solana Devnet** (agreed 2026-09-20) |
| 3 | A readable test inbox | R.19, I evidence | A mailbox the tester can open and confirm |
| 4 | A physical device | QR acceptance on hardware | Plan §5 requires it explicitly |
| 5 | An external inventory export | Pre-existing acceptance gap | Named third-party tool export file |
| 6 | George's scoring model | R.8 adapter target | Formulas, inputs, thresholds, version, expected outputs |

Items 3–6 were already open before this plan. Items 1 and 2 are new and were
discovered in stage 1.
