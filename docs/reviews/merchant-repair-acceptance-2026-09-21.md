# Merchant repair implementation and acceptance record — 2026-09-21

**Status: API, portal, migrations and background jobs deployed and smoke-tested. Full hosted acceptance remains open. Expo deployment is explicitly deferred by the user.**

The repair work is now committed as `afacbba03a62bc9d2e6ee26162691119a8ef41c6` on `codex/merchant-repair`; the additional acceptance fixes described below are uncommitted. Cloud Build captured the working tree and produced immutable deployed image digests; the base commit alone does not identify the repaired source. No mobile release was made. The original [14-finding review](merchant-plan-gap-review-2026-09-21.md) remains unchanged. This record separates deterministic tests, actual provider/chain checks and the remaining hosted/device proof.

## Finding-by-finding implementation

| Finding | Repair | Evidence and remaining gate |
|---|---|---|
| 1. Mobile settlement diverges | Mobile uses account funding/transfer APIs; the legacy adapter preserves exact base units and returns `TRANSFER_PENDING` until finality. EURC is refused. Historical ledger-only keys cannot initiate a second transfer; they return `LEGACY_TRANSFER_RECONCILIATION_REQUIRED`. | API compatibility tests include fractional cents, values beyond Number precision and concurrent requests. Physical mobile flow still required. |
| 2. Runtime/environment conflict | Explicit mock/sandbox/live financial modes; production runtime supports sandbox; live remains rejected. Canonical `SOLANA_NETWORK` accepts the old alias but rejects conflicts. Deployment preserves existing wallet-key secret references and selected key version. | Configuration tests and builds pass. Hosted sandbox configuration is applied; live mode remains unavailable and new initiation remains disabled. |
| 3. Interrupted Checkout creation | Request and worker share a leased step; immutable inputs and a stable Stripe key are saved first. Replays recover a session; verified provider metadata can recover a missing reference. Old requests outside the safe provider replay window require operator reconciliation. | Real-database tests cover concurrent request/worker, lost responses, metadata correlation and changed treasury readiness. Hosted Checkout collection still required. |
| 4. Collected funding loses value | Collected funds remain owed; definitive non-delivery enters compensation. Original PaymentIntent/refund identity persists. Pending, failed, canceled, disputed or uncertain results never become a false refund success. | Nine deterministic refund safety cases. Actual funding refund through hosted Stripe sandbox still required. |
| 5. Prepared transaction stalls | Signed bytes, signature, blockhash, validity height, network and stable intent are stored before broadcast. Recovery reattaches a transaction after a crash before the operation signature callback; it rebroadcasts identical bytes. Expiration requires history reconciliation; pruned or unavailable history remains pending. | Prepared-recovery tests and real devnet settlement suite pass. Operator CLI/test utilities are not hosted acceptance evidence. |
| 6. Assessment/package mismatch | Saved assessment is authorized first and is part of the request fingerprint and immutable snapshot. PDF/ZIP render from the same snapshot; publication is atomic. Legacy artifacts are preserved and labelled. | Cross-merchant, older assessment, concurrent request and generation-failure tests pass. Hosted downloaded/emailed hashes and inbox content remain to verify. |
| 7. Historical inventory | Reverse movements after the selected end; share one reconstruction across historical position, turnover, stock-outs and Combined Analytics. Unsupported history is explicit. | Average stock **29**, opening/closing **20/28** and unreliable-history regressions pass. |
| 8. Adjustment classification | Shared movement classifications include existing `manual_adjustment`, explicit new restocks and separate imported snapshots. | Recorded adjustment **10** regression passes. |
| 9. Reserved stock ignored | Product analytics carries on-hand, reserved and available quantities; replenishment and availability lists use available stock. | Available stock **2** triggers risk. Portal coverage passes. |
| 10. Worker isolation | Serving API instances have no analytics/recovery timers. Dedicated queue and financial recovery jobs run every minute; the six-hour sweep remains separate. | Both local job entry points start and finish successfully. Cloud Run jobs and schedules are deployed; both analytics jobs and financial recovery completed successfully. Minute scheduling is verified separately in the deployment evidence. |
| 11. Lost analytics changes | Database triggers write a transactional outbox for finalized sales, cash entries/voids, stock/import and reservation changes. Generation counters and renewable leases preserve concurrent changes and recover crashes. Disabled work remains stale; eligible claims avoid starvation and resume on enablement. | Source rollback, outbox failure, reservations, lease expiry, concurrent work and enablement tests pass. Deployed change-to-visible timing remains open. |
| 12. Incomplete finance screens | Run assessment, history and saved detail; visible latest/default or explicit older assessment selection; separate evidence/reporting periods; immutable PDF preview; package and email history. | Desktop browser flows pass against a mock API. Six authenticated hosted pages passed browser smoke checks without runtime errors. Full saved-result/package/email scenario acceptance remains open. |
| 13. Unsafe retries | Merchant-scoped persisted intent keys for assessments/packages/email and mobile money actions; server uniqueness/idempotency; unknown SMTP delivery remains unresolved without automatic resend. | Lost-response/page-refresh browser tests and concurrent API tests pass. The user supplied `nernuer@gmail.com`; receipt of the hosted package was observed in Gmail. Received attachment hashes still need verification. |
| 14. Partial period labels | Daily/weekly/monthly buckets identify clipped starts/ends and ongoing periods. | All three grouping regressions and portal checks pass. |

Mock mode now refuses new account-settlement operations, chain submission and rebroadcast while preserving replay access. Provider/refund status changes and their audit events commit atomically.

Additional money-safety regression: an insufficient-balance refusal is committed as failed before returning the error. A later deposit cannot resurrect it. Reservation release and terminal operation status commit together.

## Verification

Detailed command outputs are in `/tmp/merchant-repair-*.txt` on this machine. They are local evidence, not hosted acceptance records. Final consolidated counts are in the accompanying `merchant-repair-verification-2026-09-21.json`.

- API unit: 47 suites, 461 tests passed in the final full run; the 9-test prepared-recovery suite also passed after adding the pruned-history safeguard.
- API integration: 21 suites, 236 tests passed against the isolated `mcbuse_repair_tests` PostgreSQL database. The suite uses the existing archive stub; real hosted ZIP/PDF/email byte verification remains a separate gate.
- Portal: 30 unit tests; 76 existing desktop browser cases and 2 new assessment/finance cases passed. Browser tests use a mock API.
- API and portal production builds; API, portal and mobile TypeScript checks passed. iOS Expo bundle export passed; this is not installation or physical-device proof.
- Devnet/Stripe sandbox: **4 suites, 17 tests passed** after connectivity returned. Actual Holding/Routine and customer transfers, funding token delivery, bank/card payout and withdrawal compensation are exercised. Funding collection in that suite is stubbed; do not claim real Checkout collection from these results.
- Local 100,000-transaction/1,000-product benchmark completed in 28,486 ms against the existing 120-second calculation budget. It does not measure hosted payment API regression.
- Local database backup restored into `mcbuse_repair_acceptance`; all 60 original wallet IDs, addresses, encrypted records and key-version fields matched. This proves local record preservation, not hosted key recovery. PostgreSQL restore emitted the known unsupported `transaction_timeout` setting warning with otherwise successful restore; schema-only test restoration excluded that setting.
- Additive migrations `0029_merchant_repair` and `0030_chain_attempt_intent` applied successfully to the restored local database. The original 31-entry migration journal was strictly increasing; no applied migration entry was rewritten.

Actual devnet evidence from the final suite:

| Scenario | Reference | Result |
|---|---|---|
| Customer pays merchant Routine | `4ayVfgGVusaAwPbFGv5wE4UNCeAHbtQm82FQ4FBBaHwHwd1TsECzztFFogRUBwHa9gs8NHUu3Kwy22kcXWTvnx34` | Finalized on devnet; local database assertions passed. |
| Funding delivery | Operation `b771940b-fff1-4686-9cfe-a4a613177ce5` | 300,000 base units credited after finality. Collection was stubbed. |
| Withdrawal compensation | Operation `2b0ec97f-9751-4217-a583-24da9e30bf86` | 250,000 base units returned; reversal confirmed. |

Stripe sandbox card/bank payment-method configurations are created and available. Their non-secret IDs are in `deploy/cloud-run/api.env.yaml`. No production collection was made.

## Hosted status and blockers

- Network restored: `https://mcbuse-api-vtg5cj3ynq-ew.a.run.app/api/v1/health` reported production runtime and healthy database at `2026-09-21T11:55:45.421Z`.
- Read-only hosted aggregate inventory at `2026-09-21T12:27:25.957Z`: **42 wallets**, all without the new key-version column; **4 historical ledger-only internal transfers**; legacy on-ramp rows: 7 completed and 11 expired; no off-ramp rows. The `financial_operations` table does not yet exist on hosted, so an empty unresolved-operation result is **not** proof that all historical money movements reconcile. Reconcile those four transfers and the completed legacy funding rows before enabling new initiation. This inventory preceded the subsequently authorized backup and cleanup described below.
- Hosted migration metadata: **33 applied migrations**, latest timestamp `1799733000004`, following the successful `mcbuse-api-migrate-7vrmx` execution. All ten entries after the prior 23-entry hosted state are applied. The two additional migrations restrict private application tables to server-side access.
- Hosted repaired API: **`mcbuse-api-00042-v97`**; portal: **`mcbuse-portal-00027-wfk`**, each receiving 100% traffic. API health and nine read-only authenticated/public route checks passed; private operational monitoring returned no current queue failures. The original API image is recorded for rollback; no qualifying before-deployment performance baseline was captured.
- **Hosted backup/restore verified:** after the user approved automatic approval and the wallet cleanup, the full hosted archive was saved at `/private/tmp/mcbuse-hosted-repair-backup` (543,988 bytes; SHA-256 `ebe8f5825591f7126d583c1212b5583aa4670ecb1e7d5dfc0c158c2ca724cbb2`). The application `public` and `drizzle` schemas were restored into isolation; all 42 wallet records matched and all encrypted keys recovered their original addresses. Supabase-managed schemas/extensions remain in the full archive but were not restored on the local PostgreSQL server.
- **Hosted wallet cleanup completed:** deleted 34 empty automated-test wallets belonging to 17 synthetic accounts, plus their dependent synthetic merchant fixtures. Devnet SOL and both token-program balances were checked first. The deletion was rehearsed on the restored database, then committed atomically on hosted. Independent readback found eight wallets belonging to four real users, no orphan wallets and no remaining synthetic wallets. All eight retained wallet records matched exactly. User accounts and real-user financial history were retained. See [cleanup evidence](merchant-wallet-cleanup-2026-09-21.json).
- **Migration rehearsal verified:** all eight pending migrations applied to the isolated hosted restore (23 → 31), preserving the eight remaining wallet addresses and encrypted records. The rehearsal was followed by successful hosted migration and wallet-preservation verification.
- **Physical iPhone connected:** iPhone 14 Pro Max (iOS 26.0), wired, paired and Developer Mode enabled. The existing MCBuse development client loaded the repaired working-tree JavaScript through local Metro, configured for the hosted API; onboarding was observed on the physical screen. Fred signed in and the merchant Receive stream showed Live. Forty hosted-portal QR updates matched on physical screenshots; the p95 screenshot-completion upper bound was 2,844 ms, so the strict two-second gate remains open. Reconnect, polling fallback and money flows remain pending. **Expo deployment is still held:** no cloud build/update or new native installation was performed. See [device readiness evidence](merchant-iphone-readiness-2026-09-21.json).
- **Email receipt observed:** the package generated at 13:51 UTC was sent through the hosted Finance Match form to the user-designated `nernuer@gmail.com` and observed in Gmail with the matching PDF and ZIP filenames. Downloaded API artifact hashes and ZIP/PDF/preview assessment content match. Received attachment-byte hashes remain unverified; no automatic resend was made.
- The devnet treasury supports the small automated test amounts. Before the mobile funding demonstration, verify enough test USDC for the UI's USD 20 minimum and all concurrent deliveries. Sandbox destinations were exercised by the provider suite; recheck eligibility for the selected demonstration merchant.

## Deployed state and remaining release gates

Detailed revision, scheduler, execution, browser, wallet and access-control evidence: [deployment record](merchant-repair-deployment-2026-09-21.json).

- API image: `sha256:aaa137de28c3fbc976a02498b7a543668b8c100f52f96b87fc9d5e72e9406414` (Cloud Build `fff32a4f-0ed9-489f-ba84-acedf83460d0`).
- Portal image: `sha256:f8165f2ce7698019a7bbd66c4d84dd94a55f6161059eedeade2b5c3b83fc1ebe` (Cloud Build `61af9833-77e2-4270-935d-4c509cd018c8`).
- Financial recovery and analytics queue run every minute; the existing full analytics sweep remains every six hours UTC. The only enabled pilot is the remaining real merchant `mrc_7226ebf0b0b84c81b775`; deleted test merchants were not recreated.
- Sandbox treasury and private operational-monitoring secrets are configured in Secret Manager. Existing wallet-key references were preserved; all eight hosted records and decrypted addresses match the pre-migration restore.
- The deployment preflight found broad Supabase client-role grants and missing row-level protection on private application tables. Additive migrations `0031_private_application_tables` and `0032_private_analytics_outbox` enable RLS on all 44 application tables, revoke direct public-client grants and remove future default table grants for those client roles. Server-side API access remains functional. The restored-database test passed 448 permission checks; hosted readback confirms 44 protected tables and zero client-role grants. See [Supabase's access-control documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).
- The first API build was canceled to include the access-control fix. After the successful replacement build, the deployment wrapper stopped before migration; rollout resumed using the exact built image digest. No database rollback or migration-history rewrite was performed.
- `MONEY_INITIATION_ENABLED=false` remains intentional. Reconcile the historical ledger-only transfers and legacy funding against token/provider history before enabling new initiation. The recovery worker remains active independently of API traffic.
- Complete the hosted financial/artifact scenarios and performance gates below. Reconnect/fallback timing, received attachment hashes, six-merchant timing and financial flow evidence remain incomplete. Deployment smoke checks do not establish these outcomes.

## Remaining hosted acceptance checklist

Every row needs environment, immutable source commit, deployed revisions, UTC time, scenario, operation/assessment/package IDs and evidence links. Never record tokens, secrets, encrypted key payloads or signed transaction bytes.

- [ ] Both accounts visible; bank/card funding into Holding; Holding → Routine; product invoice/QR; customer payment to Routine; end-of-day Routine → Holding; withdrawal to bank and eligible card.
- [ ] Cash capture and void; transaction database/detail including financial attributes; all General Transaction, Inventory and Combined Analytics panels; insight creation and resolution.
- [ ] At least **40** desktop → **physical mobile** QR updates including reconnect and polling fallback: observed visible-screen **p95 ≤2 seconds**. Service-event timings are insufficient.
- [ ] At least **40** committed changes across **six** demonstration merchants through the deployed queue: committed-change → visible-insight **p95 ≤2 minutes**. Include reservation-only changes.
- [ ] Hosted 100,000-transaction/1,000-product benchmark and comparable before/after payment API workload: **after p95 ≤ before p95 ×1.10**. No local 3 ms exception; do not replace a missing baseline with a later run.
- [ ] Older saved assessment after business data changes; preview/PDF/ZIP/email retain its identity, model, evidence window and profile/consent snapshot. Match hashes and confirm receipt/content in the designated readable inbox.
- [ ] Actual Stripe sandbox collected-but-undelivered funding refund; visible pending/refund action states; uncertain chain outcome remains pending; verify no delivery-plus-refund credit.
- [ ] Deployment restore verification, unresolved-operation reconciliation, monitoring and recovery during initiation-disabled rollback.

**Completion rule:** all 14 findings and every applicable hosted acceptance gate must be closed with evidence. Local success, actual devnet transfers and a reachable hosted API do not together substitute for the missing hosted/device/inbox checks.

Recovery references: [Solana confirmation and expiration](https://solana.com/developers/cookbook/transactions/confirmation), [available ledger history](https://solana.com/docs/rpc/http/getfirstavailableblock), [Stripe idempotency retention](https://docs.stripe.com/api/idempotent_requests), and [refund states](https://docs.stripe.com/refunds). The implementation conservatively retains pending status when the RPC history cannot support a non-delivery conclusion.

## Physical-device and finance follow-up

- **QR:** 40/40 unpaid portal requests appeared on Fred’s physical iPhone. Screenshot completion measured a conservative p95 upper bound of **2,844 ms**, including capture overhead, with seven samples above 2 seconds. This does not establish the required visible-screen p95. The first run stopped after 35 updates when its create form did not reappear; the last five ran in a fresh browser. The warmup full-URI/bare-nonce comparison was corrected before the measured run. All 41 warmup/measured requests subsequently expired unpaid; the counter was cleared. [Detailed measurements](merchant-iphone-qr-acceptance-2026-09-21.json).
- **Polling repair, local only:** reduced the mobile fallback interval from three seconds to one second, prevented overlapping polls and ignored results after the owning effect is cancelled. Mobile TypeScript passed. This change has not yet been reloaded and verified on the physical device. Expo remains held. The requested airplane-mode/reconnect test is awaiting the user.
- **Assessment/package:** saved `0011cc8d-f2d0-472f-a863-47fbf770c6ce` via the hosted UI, then generated immutable package `7fbc41db-9e7b-4f9b-8190-f820ad908b76`. The preview and ZIP snapshot contain the exact saved assessment; the PDF inside the ZIP equals the separately downloaded PDF. Rendering was inspected. Gmail receipt is verified; attachment-byte hashes and the older-assessment-after-business-change scenario remain open. [Finance evidence](merchant-finance-hosted-acceptance-2026-09-21.json).
- **Two hosted defects found and repaired:** the portal had no root `/api/accounts` route, and global anti-framing headers blocked its own PDF preview. Added the root GET adapter and limited same-origin framing to the package PDF endpoint. The revised portal passed 31 unit tests and TypeScript, deployed as **`mcbuse-portal-00028-t7n`** with 100% traffic (build `58a85e3c-7b74-43a7-a809-2bb5685802a1`). Hosted account summary now returns Routine/Holding, PDF content and hash match, and the embedded PDF renders in Chrome. Ordinary pages retain `DENY` / `frame-ancestors 'none'`. [Fix verification](merchant-portal-acceptance-fixes-2026-09-21.json).
- An earlier portal build `92528ee2-ec39-40f0-bd89-79667ad18664` was cancelled before deployment so the replacement could include both defects. API and workers remain on the previously recorded image.

### Legacy financial reconciliation — read-only result

At 14:10 UTC, all eight retained wallets had zero finalized balance of the configured devnet USDC mint. Six had nonzero legacy ledger balances totalling **1,173 USDC**. The treasury held **3.321366 devnet USDC**. Stripe test-mode verification at 14:12 UTC confirmed all seven completed legacy funding sessions were paid with succeeded PaymentIntents, no amount refunded and no dispute. None has a stored chain reference. These are genuine test-mode provider events, not evidence of production collections.

Current zero token balances do not prove tokens were never delivered historically. Historical network/mint settings, ledger postings and available chain history must be reconciled before compensation or enabling new initiation. No balances, provider payments, keys or financial history were changed. [Reconciliation evidence](merchant-legacy-financial-reconciliation-2026-09-21.json).

### Older assessment after a data change

Hosted API acceptance created one explicitly labelled EUR0.01 custom cash entry (`de57f07c-971c-42ba-8c40-e36233dd8872`) and retried it with the same persisted intent, obtaining the same entry. It then saved assessment `2ddd8575-e67f-4cf4-b18d-9d75a54cc88e` and created demonstration package `9b964bd4-11c6-4242-a625-a5f7dd7b2aef`, explicitly selecting the older `0011cc8d-f2d0-472f-a863-47fbf770c6ce` assessment.

The package snapshot includes the new test cash record, while its assessment in preview and ZIP equals the older saved assessment exactly. Retrying the package returned the same package; the PDF inside the ZIP equals the separately downloaded PDF. The cash entry was then voided, and repeating the void left it voided. No product stock or wallet balance was involved. The second package has not been emailed; its email follow-through and the received-byte checks remain open. [Detailed evidence](merchant-older-assessment-acceptance-2026-09-21.json).

The pre-repair hosted manifest used `TRANSFER_PROVIDER=mock` with the same devnet USDC mint. The old widget funding settlement code wrote ledger credits without submitting a chain transaction. These explain the observed legacy mismatch, but no correction or refund has been applied without completing the historical reconciliation.


### Authorized legacy sandbox reset — completed

The user clarified: **“Clear legacy sandbox records; keep wallet addresses.”** After a fresh full backup and successful isolated restore/rehearsal, the hosted cleanup removed 14 pre-repair ledger entries, 18 legacy Stripe funding records, 31 old payment requests and four dependent merchant rows. All 16 USDC/EURC balance rows were reset to zero. No Stripe or chain mutation was performed. The archived provider events remain test-mode historical evidence, not a claim of refunded or reconciled delivery.

Independent database and hosted API readback confirmed that all eight complete wallet records, including encrypted keys and addresses, remained identical. Holding/Routine APIs returned zero balances and no legacy activity for Fred, Kabe, Theo and e_aci; the hosted portal account endpoint also returned zero balances. The merchant workspace, memberships, products, stock movements, two saved assessments, six packages, ten artifacts and existing email attempt were unchanged. Today's 41 QR acceptance requests and voided cash test remain. One preserved stock movement retains the old invoice ID as provenance; that invoice is available in the verified backup and documented in the reset audit.

The reset queued a merchant analytics refresh; the deployed worker consumed it and the insights endpoint reported fresh data at 14:32:43 UTC. Audit ID: `02015c2f-6b3d-4aaf-82dc-58052e6d989f`. Backup SHA-256: `e6379871f622e2717066f6876970186906cb74a86dbfd55effb481902d457b62`. New money initiation remains disabled, and all other open hosted acceptance gates remain open. [Reset and verification evidence](merchant-legacy-sandbox-reset-2026-09-21.json).


### Low-cost idle schedules — 21 September 2026

Following the user's cost concern, both `mcbuse-api-analytics-queue` and `mcbuse-api-financial-recovery` now run every six hours at 00:00, 06:00, 12:00 and 18:00 UTC. Their existing Scheduler IDs retain the historical `every-minute` suffix; the verified schedule is six-hourly. The separate full analytics sweep remains six-hourly. No new schedules or job deployments were created.

Before reducing recovery frequency, hosted read-only checks found no unfinished financial operations, customer payments, processing payment requests, pending ledger entries, reserved wallet balances, unfinished funding, offramps or chain attempts. New money initiation remains disabled. Both deployment scripts now default to six hours; `MCBUSE_ANALYTICS_QUEUE_SCHEDULE` and `MCBUSE_RECOVERY_SCHEDULE` provide explicit acceptance overrides. Recovery deployment refuses an implicit idle default when money initiation is enabled. Shell syntax and targeted diff checks passed.

The two changed schedules now total 240 executions per 30 days instead of 86,400. At one vCPU/512 MiB and at most 60 seconds per execution, estimated compute is $0.2736 before free allowances/credits, excluding retries, manual runs and other resources. This is not an account-bill measurement. Manual execution remains available. **The two-minute insight gate is not achievable with the idle schedule; enable minute cadence temporarily for acceptance and restore frequent recovery before allowing new payments.** [Configuration and verification evidence](merchant-low-cost-schedules-2026-09-21.json).


### User-selected hourly cadence — current setting

The user subsequently requested **once an hour**. Both the analytics queue and financial recovery schedules are now enabled at the start of every hour UTC (also Ghana time), with 24 scheduled runs per job daily. Both deployment defaults match. The separate full analytics sweep remains every six hours. Independent Scheduler readback and shell syntax checks passed. This supersedes the preceding six-hour setting for those two jobs; the acceptance timing limitations still apply. [Hourly schedule evidence](merchant-hourly-schedules-2026-09-21.json).
