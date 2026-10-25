# Change Intelligence: Stage 0 Checklist

Source: `docs/plans/change-intelligence-plan.md` revision 2.3. Stage 0 deliverable (plan §10).
Repo rechecked at commit `37b408e`.

Abbreviations used in the matrix:

- `CI/` = `apps/api/src/change-intelligence/`
- `PORTAL/` = `apps/portal/`
- `SHARED/` = `packages/shared/src/`
- `MIG/` = the API migrations directory that holds `0029_merchant_repair.sql`; new files are numbered after `0037`
- "unit" = Jest unit test, "int" = PostgreSQL integration test against `mcbuse_ci_test`, "e2e" = Playwright, "mock" = mocked-browser Playwright, "bench" = performance run, "report" = evaluation report (§9.7)

Status values: `verified`, `partial`, `failed`, `blocked (Stage 8)`, `changed by Fred`. All rows started as `pending`; statuses updated 2026-10-25 after Stage 7 verification and gap closure (on `6d23fb2` plus the Stage 7 gap fixes). Totals: 317 verified, 35 partial, 0 failed, 6 blocked (Stage 8), 1 changed by Fred (359 rows).

Evidence pointers:

- Jest unit: EV = `CI/engine/evaluate.spec.ts`, RU = `CI/engine/rules.spec.ts`, REG = `CI/engine/registry.spec.ts`, SET = `CI/engine/settings.spec.ts`, LT = `CI/engine/local-time.spec.ts`, CFG = `CI/change-intelligence.config.spec.ts`
- PostgreSQL integration: CAP = `CI/capture.int-spec.ts`, PROC = `CI/change-processing.int-spec.ts`, API = `CI/change-api.int-spec.ts`, STAFF = `CI/staff-change.int-spec.ts`, RES = `CI/change-resilience.int-spec.ts`, RET = `CI/change-retention.int-spec.ts`
- Portal: LIB = `PORTAL/lib/changes.test.ts`, CS = mocked `PORTAL/tests/changes.spec.ts`, SS = mocked `PORTAL/tests/staff-changes.spec.ts`, E2E = `PORTAL/tests-real/changes-source-to-resolution.spec.ts` (real API, isolated database)
- Reports: REP = `docs/evaluations/change-intelligence/evaluation-mrc_88d1fb39ebb04b24bb42-2026-08-05_2026-09-28.md`, PERF = `docs/evaluations/change-intelligence/performance.md`, RB = `docs/change-intelligence-runbook.md`
- Quoted text is the test title.

---

## 1. Matrix: requirement to evidence

### §1 Outcome and scope

| ID | Requirement | Stage | Work location | Evidence | Status |
|---|---|---:|---|---|---|
| R-1-location | Feature lives at Analytics, Changes | 5 | `PORTAL/app/(merchant)/analytics/changes` | mock nav test, screenshot | verified (CS "all three Analytics destinations share one navigation…") |
| R-1-owner-only | Only authenticated merchant owners; non-owner members get 404 and no nav item | 4, 5 | `CI/` controller, nav component | int owner-only 404, mock nav-hidden test | verified (API "answers 404 on every Changes route for an authenticated non-owner"; CS "Changes is hidden from the navigation for non-owners…") |
| R-1-detection-daily | Product sales trends detected daily | 1, 3 | `CI/` engine, daily clock work | unit 9.1.17, int daily rollover | verified (EV 9.1.17; PROC "enqueues the daily clock evaluation in the first run after local midnight") |
| R-1-stock-hourly | Stock, reservation and threshold changes processed hourly | 3, 6 | worker, Cloud Run job | int source-to-visible, bench hourly latency | partial (PROC "processes captured reservations, restocks…"; E2E 9.5; PERF stock-only p95 215 ms local; hourly cadence on hosted scheduler is Stage 8) |
| R-1-update-now | Staff-only "Update now" runs the same worker and rules | 6 | staff API, staff page | int 9.2 Update-now rows | verified (STAFF 9.2.update-now-* rows; SS (10× per viewport)) |
| R-1-settings | Detection, forecast and timing numbers are validated settings | 1 | `CI/` settings module | unit 9.1.25 | verified (SET 9.1.25; CFG "refuses to start on invalid ones") |
| R-1-actions | Merchant actions limited to reviewing explanations and opening existing product/inventory actions | 5 | detail page, inventory link | mock action-link test | verified (CS "inventory deep links open the right product…"; E2E restock via Review stock) |
| R-1-ui-standard | UI is a finished merchant product consistent with the portal | 5 | `PORTAL/` changes route | §9.4 checklist, screenshots | partial (CS suite + screenshots (3 widths); no axe scan (no new deps)) |
| R-1-deterministic | Deterministic calculations, explicit dependencies, no LLM | 1 | `CI/` engine | unit no-network/no-LLM import check, code review | verified (review: `CI/engine/` imports only node:crypto, @repo/shared and itself; no LLM/network import in `CI/`) |
| R-1-domains | Initial domains: product transactions, demand, available stock, depletion, stock-out risk, replenishment | 1 | registry nodes (§5.2) | unit registry test | verified (REG "validates the shipped registry…" (14 nodes)) |
| R-1-platform | Uses existing NestJS, Drizzle/PostgreSQL, Next.js, Cloud Run | 2-6 | repo-wide | code review | verified (review: NestJS + Drizzle/PostgreSQL + Next.js; Cloud Run job config (RB §5)) |
| R-1-mobile | Responsive portal only, no new native screens | 5 | `PORTAL/` | `git diff --stat` shows no `apps/mobile` change | verified (`git diff main --stat -- apps/mobile` is empty) |
| R-1-complete-path | Committed source change leads to durable work, worker, atomic states, visible explained change | 7 | e2e | e2e 9.5 | verified (E2E 9.5.source-to-resolution) |
| R-1-sources | Sources: finalized `merchant_transactions` plus `merchant_invoice_items` via `payment_request_id`; cash sales and items; voids; product stock, reservations, thresholds; committed imports | 3 | loaders in `CI/` | int parent/child observation test | verified (PROC "loads complete committed observations: digital lines via payment_request_id, cash, exclusions and unassigned lines") |
| R-1-no-settlement | Settlement imports and payouts are not demand observations | 3 | loaders | int import-not-sales test | verified (CAP "captures an import only when it becomes committed"; PROC imports are inventory observations) |
| R-1-out-of-scope | No payment rails, crypto, POS connectors, purchasing, suppliers, tasks, subscriptions | 7 | repo-wide | diff review | verified (diff review `main..HEAD`: no payment rail, POS, purchasing or supplier code) |
| R-1-mechanism-claim | Docs and UI do not claim novelty, predictive accuracy or willingness to pay | 5, 6 | copy, report text | copy review, report wording check | verified (REP header caveat; copy review of `PORTAL/lib/changes.ts`) |

### §2.4 to §2.5 Module and relationship to existing analytics

| ID | Requirement | Stage | Work location | Evidence | Status |
|---|---|---:|---|---|---|
| R-2.4-module | Module `CI/` with six separated responsibilities (capture/scheduling, loading, pure engine, persistence, read APIs, worker/ops) | 1-6 | `CI/` subfolders | directory listing, code review | verified (`CI/` layout: capture (MIG 0038/0039), change-source.loader, engine/, change-publisher, change-read/controllers, change-worker) |
| R-2.4-pure | Pure engine has no DB, HTTP, cloud SDK, browser or LLM imports; clock and config injected | 1 | `CI/engine/` | unit import-boundary test | partial (review: engine imports only node:crypto/@repo/shared; clock (`asOf`) and settings injected; no automated import-boundary test) |
| R-2.4-own-queue | New queue copies claim/renew/fail pattern but uses its own tables | 2, 3 | `CI/queue`, migrations | int: legacy completion does not delete CI rows | verified (own tables merchant_change_work/events (MIG 0038); PROC lease/backoff tests; RES rollback) |
| R-2.5-authority | For enabled merchants the new engine is authoritative for product demand-change and stock-risk | 4 | compatibility adapter | int/contract: one forecast authority | verified (API "uses Change Intelligence for enabled, initialized merchants and leaves others on legacy") |
| R-2.5-adapter | Deep Analytics reads those outputs through a compatibility adapter | 4 | analytics service in `apps/api` | contract test | verified (API Deep Analytics compatibility (§2.5)) |
| R-2.5-legacy-suppress | Legacy engine suppresses `stock_risk.<id>` and `anomaly.product.<id>` for enabled merchants; other legacy codes continue | 4 | `merchant-insights.engine.ts` | int: codes present/absent per merchant | verified (API Deep Analytics compatibility; RES rollback restores `stock_risk.<id>`) |
| R-2.5-no-conflict | No conflicting forecasts for one product across views | 4, 7 | adapter | UI test Deep Analytics vs Changes agree | verified (CS "Deep analytics links an insight to the same change") |
| R-2.5-independent | New pipeline does not depend on legacy queue cleanup, generation counter or legacy success | 3 | `CI/` | int: legacy worker failure or disabled, CI still publishes | partial (PROC runs without the legacy worker; no test with the legacy worker failing) |
| R-2.5-docs | Update `docs/merchant-analytics-intelligence.md` with both engines and cadences | 6 | docs file | doc diff | verified (Stage 6: docs/merchant-analytics-intelligence.md "Two engines") |

### §3 Merchant interface

| ID | Requirement | Stage | Work location | Evidence | Status |
|---|---|---:|---|---|---|
| R-3.1-not-demo | UI does not resemble a demo, PoC or debug console | 5 | changes route | §9.4 appearance checklist, screenshots | verified (CS noDiagnostics + screenshots) |
| R-3.1-portal-style | Use existing typography, components, patterns | 5 | changes route | code review, screenshots | verified (review: @repo/ui components; screenshots) |
| R-3.1-business-first | Lead with change, consequence, action; plain merchant language | 5 | list, detail copy | copy review | verified (CS "the list leads with the change, its consequence and the saved before/after values") |
| R-3.1-persisted | Shows persisted backend results only | 5 | data hooks | mock/e2e: values equal API values | verified (CS "a change’s details are directly linkable, survive a refresh and match the saved values") |
| R-3.1-no-infra | No infrastructure details on main experience | 5 | UI | grep test for forbidden terms, mock | verified (CS noDiagnostics DOM scan; API scan() forbidden keys) |
| R-3.1-states | Complete loading, empty, error, delayed, gap and insufficient-data states | 5 | UI | state coverage tests (§3.8 rows) | verified (CS state tests (loading, empty, filtered, building, insufficient, products not yet assessed, gap, pending/processing/delayed, failed, read failure, offline, archived, unavailable, sample)) |
| R-3.1-a11y-device | Mobile, tablet, desktop, keyboard, assistive technology | 5 | UI | §9.4 a11y tests | partial (CS "keyboard users reach every control…", 3 viewports; no axe scan) |
| R-3.1-no-banners | No oversized banners, process diagrams, unneeded metric tiles | 5 | UI | screenshot review | verified (screenshot review) |
| R-3.1-no-demo-controls | No scenario selector, playback, "Run demo", presentation mode | 5 | UI | mock test: controls absent; grep | verified (CS noDiagnostics (demo controls absent)) |
| R-3.1-no-fake-progress | No fake progress, scripted outcomes, implied-processing animation | 5 | UI | mock processing test, review | verified (CS "the ${state} state is stated without fake progress") |
| R-3.2-route | Add `/analytics/changes` | 5 | `PORTAL/app/(merchant)/analytics/changes/page.tsx` | mock | verified (CS) |
| R-3.2-shared-nav | Shared Analytics nav replaces ad hoc links in `general-analytics-view.tsx` and `analytics-dashboard.tsx` | 5 | new nav component | mock nav test on three pages | verified (CS "all three Analytics destinations share one navigation…") |
| R-3.2-breadcrumbs | Route added to `lib/breadcrumbs.ts` | 5 | `PORTAL/lib/breadcrumbs.ts` | unit/mock | verified (`PORTAL/lib/breadcrumbs.test.ts`) |
| R-3.2-redirects | Existing URLs and `/analytics`, `/analytics/inventory`, `/analytics/transactions` redirects preserved | 5 | routes | mock redirect tests | verified (CS "…and the legacy redirects still work") |
| R-3.2-narrow-nav | Nav usable at narrow width, no page horizontal scroll | 5 | nav | mock 375 px scrollWidth check | partial (CS "no horizontal page scroll on the Analytics pages" (nav fits on all pages); General Analytics has pre-existing horizontal overflow at 375 px) |
| R-3.2-hide-nonowner | Changes item hidden for non-owner members | 5 | nav | mock | verified (CS "Changes is hidden from the navigation for non-owners…") |
| R-3.3-header | Title "Changes", supporting text, last analysis time, cadence text, status line when relevant | 5 | header component | mock, screenshot | verified (CS list test + screenshots) |
| R-3.3-summary | Compact summary strip: active changes, products needing stock review, latest analysis | 5 | summary component | mock | verified (CS list test) |
| R-3.3-filters | Filters: product, type, status, date range (default 30 days); in URL; "Clear filters" | 5 | filter bar | mock URL-state test | verified (CS "filters live in the address, survive a reload, and Clear filters resets them") |
| R-3.3-pagination | Cursor pagination, 25 per page | 4, 5 | API + list | contract test, mock | verified (API pagination tests; CS "cursor pagination keeps 25 per page…") |
| R-3.3-list-entry | Entry shows product, headline, detected time and period, before/after with units, consequence, state, "View explanation" | 5 | list item | mock, screenshot | verified (CS list test; API before = opening entry, now = latest (regression test "before is the state when the change was detected…")) |
| R-3.3-no-causes | No unsupported causes; text and icons alongside colour | 5 | copy, UI | copy review, a11y test | verified (copy review; badges carry text (CS list test)) |
| R-3.4-ordering | Priority order: out of stock, at/below minimum, projected risk, confirmed demand, other; then most recent | 4, 5 | API sort, UI | contract ordering test, mock | verified (API "orders active changes by attention priority…") |
| R-3.4-resolved | Resolved changes via status filter; UI does not imply all are urgent | 5 | list | mock, copy review | verified (CS filters test (status=resolved); E2E resolved view) |
| R-3.5-route | `/analytics/changes/[changeId]` linkable, survives refresh | 5 | detail page | mock/e2e refresh test | verified (CS "a change’s details are directly linkable, survive a refresh…") |
| R-3.5-sections | Six sections: what changed, impact, before/after, suggested action, how calculated, source information | 5 | detail page | mock, screenshot | verified (CS detail test (heading order What changed, Suggested action, Before and after, …)) |
| R-3.5-trail | Dependency trail as compact step list; only saved relationships | 4, 5 | API trail, UI | contract test, mock | verified (API detail "trail"; CS detail test) |
| R-3.6-visible | Merchant-visible set: values/units, periods, dependencies, projections, limitations, calc time, timezone | 4, 5 | API DTOs, UI | contract field test | verified (API detail test (values, periods, asOf, timezone, settings)) |
| R-3.6-hidden | Never show run UUIDs, event IDs, lease tokens, queue internals, node keys, fingerprints, z-scores, stack traces, DB errors, logs, node counts | 4, 5 | DTO whitelist, UI | contract test: forbidden keys absent; mock DOM scan | verified (API scan() on list/detail/run/status; CS noDiagnostics) |
| R-3.6-staff-only-ui | Only staff UI is "Update now"; no general staff console | 6 | `PORTAL/app/staff` | diff review | verified (diff review: only `PORTAL/app/staff/changes`) |
| R-3.7-links | "View product" and "Review stock" link to `/inventory?productId=<id>&action=edit|stock` | 5 | detail page | mock link test | verified (CS detail + inventory deep-link tests) |
| R-3.7-inventory-load | Inventory loads product via `GET /merchants/me/products/:id` when off page | 4, 5 | `inventory-view.tsx` | mock off-page product test | verified (CS "inventory deep links open the right product, including one not on the loaded page…") |
| R-3.7-stock-adjust | Stock adjustments use existing `POST products/:id/stock-adjustments` | 5 | inventory | e2e | verified (E2E restock through the Inventory drawer) |
| R-3.7-no-auto-resolve | Opening an action never resolves anything; resolution only from recalculation | 3, 5 | worker | e2e: open action, case still active | verified (E2E: case stays active until the worker recalculates) |
| R-3.8-loading | Loading skeleton matching final layout | 5 | skeleton | mock, CLS check | partial (CS "loading shows a stable skeleton…"; no CLS measurement) |
| R-3.8-building-baseline | "Needs 28 days... N more days needed" from settings; stock risks still shown | 4, 5 | status API, UI | mock, int 9.3 | verified (CS "building baseline gives the day count and still shows stock problems"; LIB status copy) |
| R-3.8-insufficient-history | Names unavailable item and requirement | 5 | UI | mock | verified (API "names products not yet assessed, what is unavailable and the requirement (§3.8)"; CS "products not yet assessed are named…"; LIB "products not yet assessed (§3.8)") |
| R-3.8-recording-gap | Gap copy with date; current stock problems visible | 5 | UI | mock, screenshot, 9.3 today | verified (CS "a recording gap explains itself…") |
| R-3.8-no-material | "No significant changes were detected..." | 5 | UI | mock | verified (CS "no material changes uses the agreed copy") |
| R-3.8-no-filter-match | "Clear filters" state distinct from no changes | 5 | UI | mock | verified (CS "a filter with no matches is distinct from no detected changes") |
| R-3.8-pending | Pending hourly processing state | 5 | UI | mock | verified (CS pending state test) |
| R-3.8-processing | Processing state, no invented percentages | 5 | UI | mock | verified (CS processing state test) |
| R-3.8-failed | Analysis failed: keep previous results, say latest failed | 5 | UI | mock | verified (CS "a failed analysis keeps the previous results…") |
| R-3.8-read-failure | Read failure: retry; never replace results with empty state | 5 | UI | mock | verified (CS "a read failure offers Retry and never becomes an empty state…") |
| R-3.8-offline | Offline: preserve loaded info, explain connectivity | 5 | UI | mock offline | verified (CS "offline keeps the loaded information…") |
| R-3.8-archived | Archived/unavailable product: keep history, disable actions | 5 | UI | mock | verified (CS "an archived product keeps its history…"; API archived test) |
| R-3.8-unavailable | Deliberate feature-unavailable state | 4, 5 | status API, UI | mock | verified (CS "Changes is hidden … where the feature is unavailable"; API not-enabled/disabled tests) |
| R-3.8-sample | Sample/test records indicator | 5 | UI | mock | verified (CS "a sample account shows a discreet indicator") |
| R-3.8-no-hidden-failure | Blank or "No changes" never hides failure, missing baseline, gap or processing failure | 5 | UI | mock matrix across failure states | verified (LIB "does not claim no changes while trends are not assessed…"; CS loading/read-failure/insufficient tests) |
| R-3.9-semantics | Semantic nav, headings, lists, tables, controls | 5 | UI | axe + mock | partial (CS keyboard/names test; no automated axe scan (no new deps)) |
| R-3.9-focus | Visible focus; focus restoration after drawers close | 5 | UI | mock keyboard test | verified (CS inventory deep-link focus restore; keyboard test) |
| R-3.9-names | Accessible names on icon-only controls | 5 | UI | axe | partial (CS "…with accessible names and 44 px targets"; no axe scan) |
| R-3.9-announce | Polite, non-repeating status announcements | 5 | live region | mock | verified (CS background refresh test (polite live region); LIB announcements) |
| R-3.9-motion | Respect reduced motion | 5 | UI | mock `prefers-reduced-motion` | verified (CS "reduced motion is respected") |
| R-3.9-touch | Touch targets at least 44 x 44 px | 5 | UI | mock bounding-box test | verified (CS "…44 px targets") |
| R-3.9-contrast | Adequate contrast | 5 | UI | axe | partial (portal palette only; no automated axe contrast scan) |
| R-3.9-no-clip | Long names and large values do not clip | 5 | UI | mock long-value fixture, screenshot | verified (CS list test (long name, large values)) |
| R-3.9-format | Consistent number, date and unit formatting | 5 | formatter | unit | verified (LIB formatting tests) |
| R-3.9-widths | Readable at 375, 768, 1280 px | 5 | UI | screenshots, mock | verified (CS on mobile 375 / tablet 768 / desktop 1280 projects + screenshots) |
| R-3.9-no-cls | No layout shift on load | 5 | UI | mock CLS measurement | partial (stable skeleton (CS loading test); no CLS measurement) |
| R-3.9-refresh-keeps | Routine refresh keeps filters and scroll | 5 | polling hook | mock | verified (CS background refresh test) |
| R-3.10-poll | Poll 60 s visible, 5 s while processing; stop hidden; no overlapping requests | 5 | polling hook | mock fake-timer test | verified (CS background refresh test; LIB poll interval) |
| R-3.10-refresh-button | "Refresh" reloads saved results, never launches analysis | 5 | UI | mock: only GET issued | verified (CS: Refresh issues only GETs) |
| R-3.11-provenance-col | `merchants.data_provenance` default `ordinary`; only sample tooling sets `sample` | 2, 6 | migration, seeder | int default, seeder test | verified (CAP "defaults data_provenance to ordinary and rejects unknown values"; seeder --mark-sample runs (Stage 6)) |
| R-3.11-sample-badge | "Sample account" indicator for sample merchants | 5 | header | mock | verified (CS "a sample account shows a discreet indicator") |
| R-3.11-source-info | Source info: digital by `evidence_environment`, cash as `unknown` | 4, 5 | API, detail page | contract, mock | verified (API detail source (cashSalesProvenance unknown); CS detail test) |
| R-3.11-test-payments | "Includes test payments" when any digital sale in window is not `live` | 4, 5 | API, UI | contract, mock | changed by Fred (API still returns `source.includesTestPayments`; Fred removed the "Includes test payments / No test payments" line from the detail page Source information) |
| R-3.11-no-demo-brand | No demo branding, tutorial overlay or presentation controls | 5 | UI | grep, screenshot review | verified (CS noDiagnostics; screenshot review) |

### §4 Capture and processing

| ID | Requirement | Stage | Work location | Evidence | Status |
|---|---|---:|---|---|---|
| R-4.1-migrations | Additive migrations after `0037`, server-only pattern of `0031`/`0032` (RLS on, no `anon`/`authenticated` grants) | 2 | `MIG/` | int grants/RLS query on every new table | verified (CAP "denies client roles direct access to every change table"; MIG 0038/0039) |
| R-4.1-events | Change events table with listed fields | 2 | `MIG/`, schema | int schema test | verified (CAP "creates the work row on first capture and advances it per event") |
| R-4.1-work | Change work table: one row per merchant, revisions, lease, attempts, next attempt, error | 2 | `MIG/` | int | verified (CAP; PROC backoff/lease tests) |
| R-4.1-runs | Change runs table incl. settings, fingerprint, `asOf`, cutoff, reason, status, duration, counts, coverage, fingerprint, requesting staff user | 2 | `MIG/` | int | verified (PROC; API run evidence) |
| R-4.1-states | Current states table: merchant/product/node key, typed value, readiness, fingerprint, version, producing run | 2 | `MIG/` | int | verified (PROC bootstrap test) |
| R-4.1-transitions | Immutable state transitions with explanation facts | 2 | `MIG/` | int immutability test (UPDATE/DELETE rejected) | verified (CAP "keeps transitions immutable and allows one active case per product and type") |
| R-4.1-cases | Change cases with identity, status, severity, resolution, evidence, qualification counters | 2 | `MIG/` | int | verified (PROC end-to-end; CAP partial unique index) |
| R-4.1-processing-meta | Processing metadata (bootstrap status, model version, last daily local date, next evaluation) | 2 | columns on the per-merchant work row (interpretation I-2) | int | verified (work-row columns (I-2); PROC model_upgrade/daily clock tests) |
| R-4.1-provenance-col | `merchants.data_provenance` column | 2 | `MIG/` | int | verified (CAP data_provenance test) |
| R-4.1-composite | Merchant included in composite uniqueness and access conditions | 2 | `MIG/` | int cross-merchant uniqueness test | verified (MIG 0038 composite keys; API tenant 404 tests) |
| R-4.1-keep-work | Work rows kept after success; revisions never reset | 3 | queue | int | verified (PROC (work row kept, revisions advance)) |
| R-4.1-uuid-order | Stable UUIDs for events and runs; sequences not used as commit order | 2, 3 | schema, loader | int concurrent-commit test | verified (PROC "keeps uncommitted events invisible and leaves commits made during a run pending and due") |
| R-4.2-trigger-tx | `merchant_transactions` INSERT/UPDATE/DELETE captured when status to/from finalized or `occurred_at` changes | 2 | trigger SQL | int | verified (CAP "ignores invoice-item inserts on an unpaid request and captures the finalized transaction") |
| R-4.2-trigger-cash | `merchant_cash_sales` INSERT/UPDATE/DELETE captured on record, void, `occurred_at` change | 2 | trigger SQL | int | verified (CAP cash sales tests) |
| R-4.2-trigger-items | `merchant_cash_sale_items` UPDATE/DELETE on `product_id`/`quantity` change; old and new product kept; merchant via parent | 2 | trigger SQL | int | verified (CAP "records old and new product when a line is reassigned…") |
| R-4.2-trigger-products | `merchant_products` INSERT/UPDATE/DELETE only on `on_hand_quantity`, `reserved_quantity`, `low_stock_threshold`, `status` | 2 | trigger SQL | int; image/description update fires nothing | verified (CAP merchant_products tests (incl. "ignores name, description, image, price and no-op updates")) |
| R-4.2-trigger-imports | `merchant_import_batches` UPDATE when status becomes `committed` | 2 | trigger SQL | int | verified (CAP "captures an import only when it becomes committed") |
| R-4.2-trigger-tz | `merchants` UPDATE when `timezone` changes | 2 | trigger SQL | int | verified (CAP "captures a timezone change but not other merchant edits") |
| R-4.2-no-triggers | No triggers on `merchant_invoice_items` or `merchant_stock_movements` | 2 | MIG | int: invoice-item insert yields no event | verified (CAP "ignores invoice-item inserts…", "ignores stock-movement inserts") |
| R-4.2-two-events | Cash sale produces at most two events | 2 | triggers | int event-count test | verified (CAP "records at most two events for a single-product sale") |
| R-4.2-write-in-tx | Trigger writes one event and advances work in source transaction; no analysis | 2 | trigger SQL | int atomicity (rollback leaves no event) | verified (CAP "is atomic with the source write…") |
| R-4.2-no-secrets | No credentials, wallet keys, customer identities, files or payment payloads stored | 2 | trigger payload design | int payload column whitelist test | verified (CAP field assertions on captured events (ids and changed fields only)) |
| R-4.2-legacy-kept | Legacy triggers remain | 2 | MIG | int: both legacy and new triggers present | verified (MIG 0038 adds triggers alongside 0029; RES rollback restores legacy insights) |
| R-4.2-source-overhead | Source-write overhead measured | 2, 7 | bench | bench (§9.6 regression gate) | partial (CAP "measures source-write overhead of capture" (~0.2 ms statement-level, local); HTTP ≤10 % gate not established on a loaded machine (PERF) — Stage 8 rerun on quiet/hosted infra) |
| R-4.3-observations | Four observation kinds: sale, current inventory, inventory provenance, product configuration | 3 | loaders | unit/int | verified (PROC loads complete committed observations) |
| R-4.3-sale-fields | Sale observation fields incl. stable source line ID, source, environment, eligibility | 3 | loaders | int | verified (PROC observations test) |
| R-4.3-counting | Transactions = distinct eligible sale IDs; units = quantity sum | 1, 3 | engine, loaders | unit, int | verified (RU 9.1.23; EV 9.1.6) |
| R-4.3-eligibility | Finalized digital and recorded cash count; pending/failed/cancelled/voided do not | 3 | loaders | int | verified (PROC exclusions; CAP void tests) |
| R-4.3-stock-accounted | `stockAccountedFor=true` does not exclude a sale from demand | 3 | loaders | int | verified (PROC observations test) |
| R-4.3-unassigned | Unassigned lines count to coverage, not to product demand | 3 | loaders | int | verified (PROC "…exclusions and unassigned lines") |
| R-4.3-imports | Imports are inventory observations, not sales | 3 | loaders | int | verified (PROC "processes captured … imports …") |
| R-4.3-available | available = on hand minus reserved | 1 | engine node | unit 9.1.15 | verified (RU 9.1.15) |
| R-4.3-money | Money in integer minor units with currency; unknown provenance stays unknown | 3 | DTOs, loaders | unit/contract | verified (contract: money as minor-unit strings (`SHARED/`); cash provenance `unknown` (API detail)) |
| R-4.3-local-dates | Local dates from `merchants.timezone` | 1 | engine clock | unit 9.1.21 | verified (LT 9.1.21) |
| R-4.3-history-start | History start = earliest of product `created_at`, first stock movement, first sale | 3 | loaders | int seeded-product test | verified (loader `history_start` = LEAST(created_at, first movement, first sale); API status test (Sourdough loaf building_baseline from created_at)) |
| R-4.3-recorded-only | Output never implies MCBuse captures all business activity | 5 | copy | copy review | verified (copy: SOURCE_LIMITATIONS and Deep Analytics limitation "Based on activity recorded in MCBuse only.") |
| R-4.4-flow | Ten-step processing flow (claim, run UUID and `asOf`, repeatable-read load, coalesce, normalize, evaluate, verify lease and revision, atomic save, advance revision, commit before exposure) | 3 | worker | int per step (see §9.2 rows) | verified (PROC suite (claim, REPEATABLE READ load, lease check, atomic publish)) |
| R-4.4-no-partial | No partial run visible | 3 | publisher | int crash test | verified (PROC "publishes nothing after a crash mid-publication…") |
| R-4.4-no-cursor | Never mark events processed by numeric ID below a cursor | 3 | loader | int concurrent-commit test | verified (PROC "keeps uncommitted events invisible and leaves commits made during a run pending and due") |
| R-4.5-independent | Merchants processed independently | 3 | worker | int: one merchant fails, other succeeds | verified (PROC "processes merchants independently…") |
| R-4.5-lease | Lease 120 s, renew 30 s, stale token cannot publish | 3 | queue | int | verified (PROC "lets only a valid lease publish: a stale worker is rejected") |
| R-4.5-serialization | Retry serialization conflicts up to 3 times with bounded jitter | 3 | worker | int/unit fault injection | verified (PROC "retries serialization failures in-process without recording a failure") |
| R-4.5-backoff | Transient retries at 1, 5, 15, 60 min; after 5 failures keep failed, operator retry needed | 3, 6 | queue, CLI | int | verified (PROC "backs off 1, 5, 15 and 60 minutes, then stays failed until an operator retry") |
| R-4.5-malformed | Malformed observations recorded as excluded with reason | 3 | loaders | int | verified (PROC exclusions; EV "negative availability blocks forecasting…") |
| R-4.5-batched | Batched, indexed queries | 2, 3, 7 | loaders, indexes | EXPLAIN check, bench | verified (PERF (materialized first-sale CTE; indexes in MIG 0038); bench gates pass locally) |
| R-4.5-reconciliation | Large backlogs use a labelled reconciliation run | 3 | worker | int reason=`reconciliation` | verified (RES "capture gap: … reconciliation restores state…") |
| R-4.6-init | Enabling a merchant builds states and records an initialization run; no invented history; "Identified during initial analysis" | 3 | bootstrap | int, 9.3 | verified (PROC "bootstraps from existing records…"; EV "initialization never opens demand cases and labels existing stock risks") |
| R-4.6-rollover | Hourly invocation enqueues a clock evaluation when local date rolled over; runs in first hourly run after local midnight | 3, 6 | scheduler | int, bench | verified (PROC "enqueues the daily clock evaluation in the first run after local midnight") |
| R-4.6-noop | Hourly run without events or rollover does nothing | 3 | worker | int | verified (PROC (no events, no rollover → nothing processed)) |
| R-4.6-clock-vs-source | Clock recalculation distinct from source propagation; tests fix the clock | 1 | tests | unit 9.1.11 | verified (EV 9.1.11, 9.1.17) |

### §5 Engine and rules

| ID | Requirement | Stage | Work location | Evidence | Status |
|---|---|---:|---|---|---|
| R-5.1-registry | Versioned registry; nodes declare key, scope, inputs, schemas, calculator, readiness, fingerprint, explanation | 1 | `CI/engine/registry` | unit | verified (REG) |
| R-5.1-validation | Startup validation: missing deps, duplicates, cycles, schema compatibility, deterministic topo order | 1 | registry | unit 9.1.22 | verified (REG 9.1.22) |
| R-5.1-model-const | Model `change-intelligence-v1` is a code constant | 1 | registry | unit | verified (`MODEL_VERSION` in engine/registry.ts; API asserts change-intelligence-v1) |
| R-5.1-not-causal | Dependencies explicit, not learned, not claimed as causation | 1, 5 | registry, copy | review | verified (review: copy says "depends on", no causal claims) |
| R-5.2-nodes | All 14 nodes of §5.2 implemented with stated inputs/outputs | 1 | registry | unit per node | verified (REG (14 nodes)) |
| R-5.2-threshold-input | Minimum-stock threshold stays a merchant input; expected depletion merged into adjusted demand | 1 | registry | unit | verified (EV 9.1.8) |
| R-5.3-propagation | Identify affected, recalc in topo order, compare fingerprints, bump version only on meaningful change, stop at unchanged | 1 | engine | unit 9.1.7, 9.1.10 | verified (EV 9.1.7, 9.1.10) |
| R-5.3-transitions-only | Persist transitions only for changed states | 3 | publisher | int | verified (PROC; REP selective vs full: 0 of 122 states differ) |
| R-5.3-counts | Record evaluated, changed, skipped counts for diagnostics | 1, 3 | run record | unit, int | verified (monitoring executionLog (change-monitoring.spec); run counts) |
| R-5.3-no-timestamps | No evaluation timestamps in fingerprints | 1 | fingerprint | unit | verified (SET fingerprint test; EV 9.1.13) |
| R-5.3-stock-only | Stock-only change does not invoke demand calculators | 1 | engine | unit 9.1.7 | verified (EV 9.1.7; REP propagation (demand calculators invoked 0)) |
| R-5.3-tx-not-units | Transaction rise without unit rise creates no unit change | 1 | engine | unit 9.1.6 | verified (EV 9.1.6) |
| R-5.3-daily-reeval | Daily evaluation re-evaluates activity nodes for all products; propagation still stops at unchanged outputs | 1, 3 | engine, clock work | unit 9.1.17, int | verified (EV 9.1.17; PROC daily clock) |
| R-5.4-windows | Local-day windows: recent D-6..D, baseline weeks W1 = D-13..D-7 etc., forecast D-27..D | 1 | engine windows | unit | verified (RU 9.1.23; API detail windows) |
| R-5.4-weeks-used | Use 3 to 4 baseline weeks by history; explanation states the count | 1, 5 | engine, UI | unit 9.1.26 | verified (EV/RU 9.1.26; API status `baselineWeeksUsed`; portal "Usual is based on N weeks") |
| R-5.4-dst | DST days handled by IANA timezone, no special cases | 1 | clock | unit 9.1.21 | verified (LT 9.1.21) |
| R-5.5-order | Readiness evaluated per product and measure in the stated order | 1 | readiness | unit | verified (RU; EV 9.1.5, 9.1.18, 9.1.19) |
| R-5.5-dq | `data_quality_blocked` | 1 | readiness | unit 9.1.15 | verified (RU 9.1.15) |
| R-5.5-gap | `recording_gap` (no recent sale or merchant units < 50% of baseline mean); suppress decreases and forecasts; increases may continue | 1 | readiness | unit 9.1.18 | verified (EV 9.1.18) |
| R-5.5-building | `building_baseline` (history < 7 x (min+1) days, or a baseline week < 50% of merchant median) | 1 | readiness | unit 9.1.19, 9.1.26 | verified (EV 9.1.19, 9.1.26) |
| R-5.5-insufficient | `insufficient_history` when E < 5 | 1 | readiness | unit 9.1.5 | verified (EV 9.1.5) |
| R-5.5-ready | `ready` otherwise; forecast readiness separate | 1 | readiness | unit | verified (EV 9.1.2) |
| R-5.6-formula | R, Wk, E, s², z formula with Poisson floor | 1 | detection | unit 9.1.4, 9.1.23 | verified (RU 9.1.4, 9.1.23) |
| R-5.6-gates | Qualification gates: E >= 5, abs >= 3, rel >= 0.25, abs z >= 2.5 | 1 | detection | unit 9.1.1-9.1.3 | verified (EV 9.1.1–9.1.3) |
| R-5.6-spike | Spike guard replaces most extreme recent day with E/7 and re-checks thresholds | 1 | detection | unit 9.1.20 | verified (EV 9.1.20) |
| R-5.6-e0 | E = 0 unreachable, no infinite percentage | 1 | detection | unit 9.1.5 | verified (RU 9.1.5) |
| R-5.6-independent | Units and transactions evaluated independently | 1 | detection | unit 9.1.6 | verified (EV 9.1.6) |
| R-5.7-confirmation | Two consecutive daily evaluations in same direction; re-running a local day cannot advance | 1 | case lifecycle | unit 9.1.13 | verified (RU 9.1.14 "confirms after two consecutive qualifying days"; 9.1.13) |
| R-5.7-recovery | `returned_to_usual` after two consecutive days with abs z < 1 | 1 | lifecycle | unit 9.1.14 | verified (RU 9.1.14) |
| R-5.7-expiry | `no_longer_detected` after 7 consecutive non-qualifying days | 1 | lifecycle | unit 9.1.14 | verified (RU 9.1.14) |
| R-5.7-readiness-loss | Readiness loss keeps case active, "not re-checked since <date>", `no_longer_assessable` after 14 days | 1, 5 | lifecycle, UI | unit 9.1.14, mock | verified (RU 9.1.14; `notRecheckedSince` in API/portal) |
| R-5.7-reversal | Opposite confirmed direction resolves with `direction_reversed` and opens opposite type | 1 | lifecycle | unit 9.1.14 | verified (RU 9.1.14) |
| R-5.8-formulas | baselineDailyUnits, adjustedDailyUnits, daysToMinimum, daysToZero, suggestedUnits | 1 | forecast nodes | unit 9.1.23 | verified (RU 9.1.23) |
| R-5.8-readiness | Forecast ready: history >= 28 days, >= 14 units in window, no recording gap | 1 | forecast readiness | unit 9.1.18, 9.1.26 | verified (EV 9.1.18, 9.1.26; API status forecast reasons) |
| R-5.8-missing-zero | Missing records mean zero recorded units, not proof of zero sales | 1, 5 | engine, copy | unit, copy review | verified (API detail assumption "Missing records count as zero recorded units…") |
| R-5.8-zero-demand | Zero adjusted demand gives null cover with `no_positive_demand` | 1 | forecast | unit 9.1.15 | verified (RU 9.1.15) |
| R-5.8-negative | Negative available stock blocks forecasting with data-quality warning | 1 | forecast | unit 9.1.15 | verified (EV "negative availability blocks forecasting with a data-quality reason…") |
| R-5.8-dates | Dates = `asOf` plus elapsed days in merchant timezone | 1 | projected dates node | unit 9.1.21 | verified (LT 9.1.21; REP projected_stock_dates finding) |
| R-5.8-precision | Full internal precision, rounded for display; suggested quantities whole | 1, 5 | engine, formatter | unit | verified (LIB formatting; ChangeValue full precision) |
| R-5.8-disclaimer | Explain exclusions (hours, lead times, incoming orders, unrecorded activity) | 5 | detail copy | mock text check | verified (API PROJECTION_ASSUMPTION; CS detail test) |
| R-5.9-risk-order | Out of stock, low stock, forecast unavailable, projected risk within 7 days, normal | 1 | stock risk node | unit 9.1.24 | verified (RU 9.1.24) |
| R-5.9-visible | Current stock problems visible when forecast unavailable | 1, 5 | engine, UI | unit 9.1.24, mock | verified (RU 9.1.24; CS building-baseline/gap tests keep stock problems) |
| R-5.10-example | Arithmetic acceptance example (stock 40, min 5, R = 42, E = 28) | 1 | engine | unit 9.1.23; independent isolation of product B | verified (RU 9.1.23; EV 9.1.11) |
| R-5.10-before-col | "Before" column read as forecast before the shifted week (28-day units 112), tested as forecast arithmetic (interpretation I-4) | 1 | engine | unit 9.1.23 split into forecast and detection tests | verified (RU 9.1.23 (forecast and detection separate, I-4)) |
| R-5.10-actual-stock | When the event also changes stock, use actual resulting stock | 1, 3 | engine, loader | int | verified (PROC end to end (stock after sale)) |
| R-5.11-defaults | 16 settings with defaults | 1 | settings module | unit 9.1.25 | verified (SET 9.1.25) |
| R-5.11-ranges | Allowed ranges including cross-key (`baselineWeeksMin` <= `baselineWeeksMax`) | 1 | settings validator | unit 9.1.25 | verified (SET 9.1.25) |
| R-5.11-env | `MERCHANT_CHANGE_INTELLIGENCE_SETTINGS` JSON overrides only given keys | 1 | settings loader | unit 9.1.25 | verified (SET 9.1.25; CFG partial overrides) |
| R-5.11-refuse-start | Worker and API refuse to start on unknown or out-of-range value | 3, 4 | bootstrap | int/unit startup test for both entrypoints | verified (CFG "…refuses to start on invalid ones" (shared by API and worker)) |
| R-5.11-global | Settings global per environment; no per-merchant override | 1 | settings | review | verified (review: one settings object per process) |
| R-5.11-store-run | Every run stores effective settings and fingerprint; cases and explanations show originating values | 3, 5 | runs, UI | int, mock | verified (API "keeps the settings that created the case after settings change") |
| R-5.11-settings-change | Fingerprint change triggers `settings_change` re-evaluation of all enabled merchants; cases keep history | 3 | scheduler | unit 9.1.27, int | verified (EV 9.1.27; PROC settings_change) |
| R-5.11-no-endpoint | No endpoint for changing settings; hosted change needs Fred's approval | 4, 8 | API routes | route list test | partial (review: change.controller/staff-change.controller expose no settings write; no automated route-list test) |
| R-5.12-deferred | During-day detection is not in v1; hourly processing remains for stock, reservation, threshold, archive, correction | 1 | engine scope | review; no 4-hour window code | verified (review: no during-day detection window in engine) |

### §6 Change cases and explanations

| ID | Requirement | Stage | Work location | Evidence | Status |
|---|---|---:|---|---|---|
| R-6-types | Seven case types, one active per merchant, product and type | 1, 2 | schema, lifecycle | int partial unique index test | verified (CAP partial unique index) |
| R-6-open | Opening a case records first detection and transition | 3 | publisher | int | verified (PROC end to end; API detail transitions) |
| R-6-append | Meaningful changes append history; unchanged calculations create none | 3 | publisher | int | verified (API "before is the state when the change was detected; now is the latest update") |
| R-6-coalesce | Several sales in one window feed one case | 3 | worker | int | verified (PROC "coalesces events into affected products and fields without losing any") |
| R-6-restock | Restock resolves stock risk only when risk is normal; independent demand case stays | 1, 3 | lifecycle | unit 9.1.9, e2e | verified (EV 9.1.9; PROC end to end; E2E 9.5) |
| R-6-archive | Archiving resolves cases with `product_archived` | 3 | lifecycle | int | verified (EV "archiving resolves the product cases with product_archived") |
| R-6-correction | Voids and corrections to an evaluated window open or append `historical_correction` | 1, 3 | lifecycle | unit 9.1.16, int | verified (EV 9.1.16) |
| R-6-reason | Initialization and rebuilds record actual reason; resolved history readable | 3, 4 | runs, API | int, contract | verified (PROC model_upgrade/settings_change; API run evidence) |
| R-6-explanations | Explanations from structured facts; each recommendation traces to saved values and model version | 1, 4 | explanation templates | unit, report (explanation completeness) | verified (REP explanation completeness: 0 incomplete) |
| R-6-no-llm | No Groq call; no AI narration of numbers or success | 1 | `CI/` | grep/import test | verified (review: no Groq/LLM import in `CI/`; Deep Analytics adapter narrationSource deterministic) |

### §7 APIs and contracts

| ID | Requirement | Stage | Work location | Evidence | Status |
|---|---|---:|---|---|---|
| R-7-shared-types | Types in `SHARED/change-intelligence.ts`, exported from entrypoint | 0 | `SHARED/` | `pnpm check-types` | verified (`pnpm check-types` (portal, api build)) |
| R-7-list | `GET /merchants/me/changes` | 4 | `CI/` controller | contract | verified (API list tests) |
| R-7-status | `GET /merchants/me/changes/status` with availability, readiness, cadence, freshness, processing, last sale date, provenance | 4 | controller | contract | verified (API status tests (incl. per-product readiness)) |
| R-7-run | `GET /merchants/me/changes/runs/:runId` bounded merchant-safe evidence | 4 | controller | contract | verified (API detail and run evidence) |
| R-7-detail | `GET /merchants/me/changes/:changeId` | 4 | controller | contract | verified (API detail tests) |
| R-7-product | `GET /merchants/me/products/:id` | 4 | products controller | contract, 404 cross-tenant | verified (API "products/:id returns the same shape…, scoped to the merchant") |
| R-7-route-order | Static routes declared before parameterized | 4 | controller | contract: `/status` not captured by `:changeId` | verified (API status/list/detail all answered by the same controller) |
| R-7-query | Filters, limit default 25 max 100, default range 30 days max 366, keyset on `(lastChangedAt, id)`, validation of UUID/date/cursor/enum | 4 | DTOs | contract boundary tests | verified (API "accepts limit=100 and a 366-day range", "rejects malformed path ids with 400", cursor tests) |
| R-7-enums | `ChangeReadiness`, `ChangeCaseStatus`, `NodeOutcome`, `RunReason`, `CaseResolution` exactly as in plan | 0 | `SHARED/change-intelligence.ts` | type test | verified (`SHARED/change-intelligence.ts`; change-read.spec type groups) |
| R-7-response | Responses include IDs, model version, period, `asOf`, timezone, coverage, provenance, units, freshness, facts, reason codes | 4 | DTOs | contract | verified (API detail/status tests) |
| R-7-serialize | Bigint revisions and money as strings | 4 | DTOs | contract | partial (money as strings in contract; revisions are not exposed in merchant responses) |
| R-7-distinct | Scheduled, processing, failed, gap, no-material outcomes distinguishable | 4 | status API | contract per outcome | verified (API "no material changes is distinct from a recording gap…", "distinguishes pending, delayed, processing and failed…") |
| R-7-security-owner | JWT protection; non-owner 404 | 4 | guard | int | verified (API non-owner 404) |
| R-7-security-tenant | All queries scoped by authenticated merchant; other merchant's case, run, product 404 | 4 | repository | int tenant isolation | verified (API "answers 404 for another merchant’s case, run and product"; per-product readiness scoped (demand lists none of calm’s)) |
| R-7-no-client-merchant | Client-supplied merchant ID never used | 4 | DTOs | contract | verified (API "…never accepts a client merchant id") |
| R-7-cache | Private/no-store cache headers | 4 | controller | contract header test | verified (API "sets private no-store cache headers…") |
| R-7-proxy | Explicit portal proxy allowlist patterns | 4 | `PORTAL/app/api/merchant/[...path]/route.ts` | unit/mock allow and deny cases | verified (`PORTAL/lib/server/merchant-proxy-allowlist.test.ts`) |
| R-7-sanitize | Merchant-facing errors sanitized | 4, 5 | filters | contract | verified (API 400/404 through HttpExceptionFilter) |
| R-7-no-public | No public seed, threshold or cadence endpoints | 4 | routes | route list test | partial (review: no seed/threshold/cadence routes; no automated route-list test) |
| R-7-insight-fields | `MerchantInsight` gains optional `modelVersion`, `changeCaseId`; Deep Analytics links to Changes | 0, 4, 5 | `SHARED/merchant.ts`, analytics view | type test, mock link | verified (API Deep Analytics compatibility; CS "Deep analytics links an insight to the same change") |

### §8 Worker, operations, rollout

| ID | Requirement | Stage | Work location | Evidence | Status |
|---|---|---:|---|---|---|
| R-8-worker-mode | Dedicated Changes worker mode, own queue, own Cloud Run job | 6 | worker entry, deploy config | int worker run, config review | verified (Stage 6: change-worker.ts; deploy/cloud-run/changes-job.env.yaml; runbook §5) |
| R-8-schedule | Scheduler `0 * * * *` UTC | 6, 8 | deploy config | config review; hosted check at Stage 8 | partial (Stage 6: config in runbook §5; hosted check Stage 8) |
| R-8-execution | Each execution: enqueue due daily work, process within budget, leave rest durable, log summary, exit non-zero on failure | 6 | worker | int exit-code and budget tests | verified (Stage 6: change-worker.ts + executionLog; CLI smoke run on mcbuse_ci_test) |
| R-8-pool | Reuse DB config with low pool limit | 6 | worker config | config review | verified (Stage 6: change-worker.module.ts (pool 3); changes-job.env.yaml) |
| R-8-cli-one | CLI: process one merchant now | 6 | CLI | int | verified (Stage 6: changes:ops --merchant; staff-change.int-spec) |
| R-8-cli-retry | CLI: retry failed work | 6 | CLI | int | verified (Stage 6: changes:ops --retry-failed; change-processing.int-spec) |
| R-8-cli-rebuild | CLI: rebuild after model upgrade | 6 | CLI | int | verified (Stage 6: changes:ops --rebuild; change-retention.int-spec "operator rebuild") |
| R-8-cli-export | CLI: export evaluation evidence including §2.3 backtest replay | 6 | CLI | report | verified (Stage 6: changes:evaluate; docs/evaluations/change-intelligence/) |
| R-8-cli-sample | CLI: seed or reset a sample account | 6 | CLI/seeder | int | verified (Stage 6: seeder --mark-sample/--demand-shift run on mcbuse_ci_test) |
| R-8-un-access | "Update now" needs active `staff_permissions` row with `change_intelligence_operator`, using `requireStaff` pattern | 6 | staff service | int 403/404 cases | verified (Stage 6: ChangeOperatorGuard; staff-change.int-spec) |
| R-8-un-migration | `staff_permissions` key changed to `(user_id, permission)`; existing rows unaffected | 2 or 6 | `MIG/` | int dual-permission, existing rows retained | verified (Stage 6: 0038 PK; 9.2.update-now-dual-permission) |
| R-8-un-merchants-blocked | Merchants and owners cannot use it; merchant API/UI unchanged | 6 | staff controller | int 404 | verified (Stage 6: 9.2.update-now-404) |
| R-8-un-audit | Each use writes `audit_logs` row, entity type `change_update_now`, with staff user, merchant, reason | 6 | staff service | int | verified (Stage 6: 9.2.update-now-audited) |
| R-8-un-api-list | `GET /staff/changes/merchants?q=` (enabled merchants, name/email match, max 50, fields listed) | 6 | staff controller | int | verified (Stage 6: 9.2.update-now-picker) |
| R-8-un-api-post | `POST /staff/changes/update-now` with `{merchantId, reason <= 200}`; returns `queued` or `already_running` | 6 | staff controller | int, DTO validation test | verified (Stage 6: staff-change.int-spec (validation, queued/already_running)) |
| R-8-un-page | Staff portal page with searchable picker (no UUID typing), status, reason field, button; hidden without permission | 6 | `PORTAL/app/staff` | mock, screenshot | verified (`PORTAL/app/staff/changes`; SS 10× per viewport after the picker race fix; workspace.test.tsx) |
| R-8-un-proxy | Staff proxy allowlist patterns added | 6 | staff proxy route | unit | verified (Stage 6: lib/server/staff-proxy-allowlist.test.ts) |
| R-8-un-run | Marks work due now; starts Cloud Run job via Admin REST API with API service identity; identity limited to this job; no new SDK; local CLI alternative | 6, 8 | staff service, IAM config | int with stubbed REST client; IAM verified hosted at Stage 8 | partial (Stage 6: trigger unit-tested with mocked HTTP; IAM verified hosted at Stage 8) |
| R-8-un-limits | Enabled merchants only; one execution per merchant per minute; shares lease | 6 | staff service | int | verified (Stage 6: 9.2.update-now-already-running, -no-overlap) |
| R-8-un-no-bypass | Bypasses no rule; demand changes still need history and confirmation | 6 | worker | int | verified (Stage 6: 9.2.update-now-confirmation-timing) |
| R-8-seed-extend | Extend `seed-local-overview-demo.mjs`; no new seeder | 6 | `apps/api/scripts/` | diff review | verified (Stage 6: seed-local-overview-demo.mjs diff) |
| R-8-seed-shift | `--demand-shift "<sku>:<mult>:<fromDaysAgo>"` deterministic | 6 | seeder | seeder test | verified (Stage 6: seeded sample merchant, COF-CAP ×1.5 last 14 days (run log)) |
| R-8-seed-mark | `--mark-sample` sets `data_provenance='sample'`; refuses ordinary merchant without it; refuses on merchant with a `live` digital sale | 6 | seeder | seeder tests (3 cases) | verified (Stage 6: 3 seeder runs: ordinary refused, live refused, sample marked) |
| R-8-seed-catchup | Catch-up runs close the 26/28 Sep gap | 6, 7 | seeder | int 9.3 sample run | partial (Stage 6: catch-up run on local sample merchant; current-data run Stage 7) |
| R-8-seed-cash | Acceptance uses `--digital-share 0`; dedicated sample merchant for shift | 7 | acceptance script | 9.3 run log | partial (local acceptance screenshots `PORTAL/test-results-real/change-intelligence-real/sample-*` (untracked); no written 9.3 run log) |
| R-8-seed-hosted | Hosted seeding needs `--allow-host` and Fred's approval | 8 | seeder | not run; blocked until approval | blocked (Stage 8) (not run; needs --allow-host and Fred’s approval) |
| R-8-config-vars | Four config vars: ENABLED, ALLOWLIST, SETTINGS, `CHANGE_INTELLIGENCE_JOB_NAME` | 3, 6 | config module | unit | verified (Stage 6: change-intelligence.config.ts; .env.example; api.env.yaml) |
| R-8-same-availability | Worker and read APIs use same availability check; UI reads it via status API | 3, 4 | availability service | unit/int | verified (ChangeIntelligenceConfig.isEnabledFor shared by worker and read APIs; RES rollback) |
| R-8-monitoring | Capture the 11 monitoring measures | 6 | metrics/logging | unit + sample log output | verified (Stage 6: change-monitoring.spec.ts; sample log line in runbook §6) |
| R-8-alerts | Six alert conditions defined | 6 | monitoring config | config review; hosted firing is Stage 8 | verified (Stage 6: runbook §6 log-based metrics (hosted firing at Stage 8)) |
| R-8-retention | Retention: unprocessed events kept; processed detail 90 days; runs/transitions/resolved cases 12 months; states and active cases kept; transitions keep evidence; bounded configurable maintenance | 6 | maintenance job | int 9.2 retention | verified (Stage 6: change-retention.int-spec) |
| R-8-allowlist | Initial allowlist holds the two public IDs; set in local/test now, hosted values only at Stage 8 | 6, 8 | env files, `deploy/cloud-run/api.env.yaml` | local config check; hosted deferred | partial (Stage 6: set in deploy files; hosted value ships at Stage 8) |
| R-8-release-migrations | Append-only migrations; verify fresh and upgraded databases | 2, 7 | `MIG/` | int fresh and upgrade run | verified (`pnpm changes:release-checks` (fresh 0000–0039 and upgrade from 0037, RB)) |
| R-8-release-perms | Server-only permissions on every new table | 2 | `MIG/` | int | verified (CAP "denies client roles direct access to every change table") |
| R-8-release-index-first | Indexes created before capture enabled | 2 | `MIG/` ordering | migration order test | verified (MIG 0038 creates indexes before the capture triggers) |
| R-8-release-bootstrap | Bootstrap merchants before switching Deep Analytics authority | 4, 8 | bootstrap, adapter | int | verified (API Deep Analytics: authority only when initialized) |
| R-8-release-allowlist-first | Roll out to allowlist first | 8 | deploy | hosted | blocked (Stage 8) (hosted rollout) |
| R-8-rollback | Rollback disables processing and restores legacy reads; records kept | 7 | flags | int rollback test | verified (RES "rollback: disabling the flag stops processing…") |
| R-8-capture-off | Capture disable independent; gap requires reconciliation before freshness restored | 2, 7 | `ALTER TABLE ... DISABLE TRIGGER change_capture_*` (I-3) | int | verified (RES "capture gap: … reconciliation restores state…") |
| R-8-no-deploy | No production deploy without Fred's approval of that release | 8 | process | Stage 8 out of scope until approval | blocked (Stage 8) (no deploy made; needs Fred’s approval of the release) |

### §9.1 Pure engine (one row per item)

| ID | Requirement | Stage | Work location | Evidence | Status |
|---|---|---:|---|---|---|
| R-9.1-01 | Stable baseline gives no case | 1 | `CI/engine/*.spec.ts` | unit `9.1.1` | verified (EV 9.1.1) |
| R-9.1-02 | Sustained +50% (§5.10): qualifies day 1, confirmed day 2 | 1 | engine spec | unit `9.1.2` | verified (EV 9.1.2) |
| R-9.1-03 | Fluctuations with abs z < 2.5 give no case | 1 | engine spec | unit `9.1.3` | verified (EV 9.1.3) |
| R-9.1-04 | s² > E: denominator uses s² | 1 | engine spec | unit `9.1.4` | verified (RU 9.1.4) |
| R-9.1-05 | E < 5 gives `insufficient_history`; E = 0 never divides | 1 | engine spec | unit `9.1.5` | verified (EV 9.1.5; RU 9.1.5) |
| R-9.1-06 | Transactions up, units flat: transaction case only, forecast unchanged | 1 | engine spec | unit `9.1.6` | verified (EV 9.1.6) |
| R-9.1-07 | Stock-only propagation does not invoke demand calculators | 1 | engine spec | unit `9.1.7` (spy on calculators) | verified (EV 9.1.7) |
| R-9.1-08 | Threshold-only propagation | 1 | engine spec | unit `9.1.8` | verified (EV 9.1.8) |
| R-9.1-09 | Restock resolves stock risk; demand case stays open | 1 | engine spec | unit `9.1.9` | verified (EV 9.1.9) |
| R-9.1-10 | Unchanged intermediate node stops propagation | 1 | engine spec | unit `9.1.10` | verified (EV 9.1.10) |
| R-9.1-11 | Product A change leaves product B versions/fingerprints unchanged at fixed clock | 1 | engine spec | unit `9.1.11` | verified (EV 9.1.11) |
| R-9.1-12 | Merchant summary updates | 1 | engine spec | unit `9.1.12` | verified (EV 9.1.12) |
| R-9.1-13 | Re-running same local day does not advance confirmation | 1 | engine spec | unit `9.1.13` | verified (EV 9.1.13; RU 9.1.13 (rule)) |
| R-9.1-14 | Recovery, expiry, readiness loss, reversal | 1 | engine spec | unit `9.1.14` (four sub-cases) | verified (RU 9.1.14) |
| R-9.1-15 | Zero demand, zero stock, negative availability | 1 | engine spec | unit `9.1.15` | verified (RU 9.1.15) |
| R-9.1-16 | Void and reassignment affect correct products, produce `historical_correction` | 1 | engine spec | unit `9.1.16` | verified (EV 9.1.16) |
| R-9.1-17 | Clock-only daily rollover | 1 | engine spec | unit `9.1.17` | verified (EV 9.1.17) |
| R-9.1-18 | Recording gap: no decrease cases, forecasts suppressed, low-stock stays | 1 | engine spec | unit `9.1.18` | verified (EV 9.1.18) |
| R-9.1-19 | Past gap in baseline week gives `building_baseline`, no false increase | 1 | engine spec | unit `9.1.19` | verified (EV 9.1.19) |
| R-9.1-20 | Single-day spike rejected by guard | 1 | engine spec | unit `9.1.20` | verified (EV 9.1.20) |
| R-9.1-21 | `Europe/Berlin` 2026-10-25 (25 h), 2026-03-29 (23 h), `Africa/Accra` ordinary days | 1 | engine spec | unit `9.1.21` | verified (LT 9.1.21) |
| R-9.1-22 | Invalid dependency registries rejected | 1 | engine spec | unit `9.1.22` | verified (REG 9.1.22) |
| R-9.1-23 | Exact §5.10 arithmetic | 1 | engine spec | unit `9.1.23` | verified (RU 9.1.23) |
| R-9.1-24 | Risk ordering: out of stock shown when forecast unavailable | 1 | engine spec | unit `9.1.24` | verified (RU 9.1.24) |
| R-9.1-25 | Settings: defaults, partial override, reject unknown keys and out-of-range | 1 | settings spec | unit `9.1.25` | verified (SET 9.1.25) |
| R-9.1-26 | Baseline weeks: 27 days building; 28-34 days 3 weeks; >= 35 days 4 weeks; count in explanation | 1 | engine spec | unit `9.1.26` | verified (EV 9.1.26; RU 9.1.26 (rule)) |
| R-9.1-27 | Settings change gives new fingerprint and `settings_change` run; old cases keep their settings | 1, 3 | settings spec, int | unit `9.1.27`, int | verified (EV 9.1.27; PROC settings_change) |

### §9.2 PostgreSQL integration (one row per bullet)

All run against `mcbuse_ci_test` with `DATABASE_URL` exported explicitly. Never the hosted database.

| ID | Requirement | Stage | Work location | Evidence | Status |
|---|---|---:|---|---|---|
| R-9.2-atomicity | Source write and event commit or roll back together | 2 | `CI/**/*.int-spec.ts` | int `9.2.source-event-atomicity` | verified (CAP "is atomic with the source write…") |
| R-9.2-parent-child | Complete committed parent/child observations; digital lines resolved via `payment_request_id` | 3 | loaders | int `9.2.parent-child-observations` | verified (PROC "loads complete committed observations…") |
| R-9.2-coalescing | Coalescing loses no products | 3 | worker | int `9.2.event-coalescing` | verified (PROC "coalesces events…") |
| R-9.2-uncommitted | Uncommitted events invisible | 3 | loader | int `9.2.uncommitted-invisible` | verified (PROC "keeps uncommitted events invisible…") |
| R-9.2-concurrent | Concurrent commits not skipped | 3 | loader | int `9.2.concurrent-commits` | verified (PROC "…leaves commits made during a run pending and due") |
| R-9.2-crash | No partial publication after crash | 3 | publisher | int `9.2.crash-no-partial` | verified (PROC "publishes nothing after a crash mid-publication…") |
| R-9.2-idempotent | Idempotent retry | 3 | worker | int `9.2.idempotent-retry` | verified (PROC "…retries idempotently") |
| R-9.2-lease | Only valid lease publishes; stale workers rejected | 3 | queue | int `9.2.stale-lease-rejected` | verified (PROC "lets only a valid lease publish…") |
| R-9.2-later-pending | Later events remain pending | 3 | worker | int `9.2.later-events-pending` | verified (PROC "…commits made during a run pending and due") |
| R-9.2-atomic-complete | Publication and completion atomic | 3 | publisher | int `9.2.publish-complete-atomic` | verified (PROC crash test) |
| R-9.2-bootstrap | Bootstrap and replay do not double-count | 3 | bootstrap | int `9.2.bootstrap-replay` | verified (PROC "bootstraps from existing records…") |
| R-9.2-capture-kinds | Capture of imports, reservations, archives, voids, restocks, timezone changes | 2 | triggers | int `9.2.capture-*` (six cases) | verified (CAP; PROC "processes captured reservations, restocks, imports, voids, archives and timezone changes") |
| R-9.2-invoice-items | Invoice-item inserts on unpaid requests produce no events | 2 | triggers | int `9.2.invoice-item-no-event` | verified (CAP "ignores invoice-item inserts on an unpaid request…") |
| R-9.2-tenant | Tenant isolation and owner-only access | 4 | API | int `9.2.tenant-isolation` | verified (API access tests) |
| R-9.2-retention | Safe retention | 6 | maintenance | int `9.2.retention-safe` | verified (Stage 6: change-retention.int-spec 9.2.retention-safe) |
| R-9.2-model-upgrade | Explicit model-upgrade history | 3, 6 | rebuild | int `9.2.model-upgrade-history` | verified (Stage 6: change-retention.int-spec rebuild; change-processing.int-spec) |
| R-9.2-un-picker | Picker searches by name and email, lists only enabled merchants, 403 without permission | 6 | staff API | int `9.2.update-now-picker` | verified (Stage 6: staff-change.int-spec) |
| R-9.2-un-dual | One user can hold `credit_analyst` and `change_intelligence_operator` | 6 | migration | int `9.2.update-now-dual-permission` | verified (Stage 6: staff-change.int-spec) |
| R-9.2-un-403 | 403 for staff without permission | 6 | staff API | int `9.2.update-now-403` | verified (Stage 6: staff-change.int-spec) |
| R-9.2-un-404 | 404 for merchants and owners | 6 | staff API | int `9.2.update-now-404` | verified (Stage 6: staff-change.int-spec) |
| R-9.2-un-audit | Every use audited | 6 | staff service | int `9.2.update-now-audited` | verified (Stage 6: staff-change.int-spec) |
| R-9.2-un-running | `already_running` within a minute or during processing | 6 | staff service | int `9.2.update-now-already-running` | verified (Stage 6: staff-change.int-spec) |
| R-9.2-un-overlap | No overlap with hourly run | 6 | queue | int `9.2.update-now-no-overlap` | verified (Stage 6: staff-change.int-spec) |
| R-9.2-un-timing | No change to confirmation timing | 6 | worker | int `9.2.update-now-confirmation-timing` | verified (Stage 6: staff-change.int-spec) |

### §9.3 to §9.7 Acceptance, performance, report

| ID | Requirement | Stage | Work location | Evidence | Status |
|---|---|---:|---|---|---|
| R-9.3-isolated | Current-data acceptance on a restored dump in an isolated database, never hosted | 7 | acceptance script | run log naming the database | verified (REP: source `mcbuse_current_copy` (READ ONLY, REPEATABLE READ), local restored copy) |
| R-9.3-today-gap | `asOf` 2026-10-25: both merchants `recording_gap` with last sale date | 7 | acceptance | report, screenshot | partial (screenshots gap-aci-list / gap-mcbuse-list at 375/768/1280 (`PORTAL/test-results-real/change-intelligence-real`, untracked); no written report) |
| R-9.3-today-no-demand | No demand cases; forecasts unavailable with `no_recent_activity` | 7 | acceptance | report | partial (gap screenshots only; no written report) |
| R-9.3-today-lowstock | Six low-stock cases labelled "Identified during initial analysis" | 7 | acceptance | report, screenshot | partial (gap screenshots only; count of six not recorded in a report) |
| R-9.3-today-candy | Coffee Candy `insufficient_history` | 7 | acceptance | report | partial (not recorded in a report; per-product readiness now shown in status/UI (API "names products not yet assessed…")) |
| R-9.3-today-ui | UI shows recording-gap state, not "No changes" | 7 | acceptance | screenshot | partial (gap screenshots show the recording-gap state; no automated assertion) |
| R-9.3-replay-424d | `asOf` 2026-09-29 01:00 Europe/Berlin: `424d...` ready for 10 products, forecasts ready | 7 | acceptance | report | partial (REP replay: Sourdough loaf (424d…) is insufficient_history at E=4.75, so not all 10 ready; the plan’s "all 10 ready" contradicts its own §5.5 E<5 rule) |
| R-9.3-replay-dfdf | `dfdf...` ready with 3 baseline weeks (33 days), explanation says so; forecasts ready except Coffee Candy | 7 | acceptance | report | partial (not recorded in a report) |
| R-9.3-replay-min4 | `baselineWeeksMin` = 4: `dfdf...` `building_baseline`, "2 more days needed" | 7 | acceptance | report | partial (screenshot replay-weeksmin4-mcbuse-list (untracked); no written report) |
| R-9.3-backtest | TypeScript replay 5 Aug - 28 Sep for `424d...` reproduces §2.3 qualifying counts (z >= 2.0: 44, 2.5: 20, 3.0: 8; 549 evaluations); confirmed cases listed | 6, 7 | evaluation export | report | partial (REP: qualifying 44/20/8 and confirmed 4/1 reproduced; ready evaluations 539 vs 549 (Sourdough loaf E<5 days)) |
| R-9.3-shift | Catch-up seed with `--demand-shift "<Cappuccino sku>:1.5:14"`: Changes page shows confirmed increase with before/after cover | 7 | acceptance, e2e | screenshot, e2e | partial (screenshots sample-list-* (untracked)) |
| R-9.3-shift-restock | "Review stock" opens the product; restock resolves stock risk, demand case stays open | 7 | e2e | e2e | verified (E2E 9.5 (Review stock → restock → stock_normal); screenshots sample-after-restock-*) |
| R-9.4-functionality | Seven functionality checks (destinations/redirects, deep links, URL filters, values match, Deep/Changes agree, inventory actions incl. off-page, background update keeps state) | 5, 7 | mock, e2e | mock suite | verified (CS functionality tests (destinations/redirects, deep links, URL filters, values match, Deep/Changes agree, inventory off-page, background refresh)) |
| R-9.4-states | All 13 listed states covered | 5 | mock | mock + screenshots | verified (CS state tests + screenshots) |
| R-9.4-a11y | Accessibility and responsiveness checks (keyboard, names, headings, focus restore, announcements, reduced motion, 3 widths, no clipping, no horizontal scroll, no colour-only meaning) | 5 | mock | axe + mock | partial (CS keyboard/names/44 px/focus restore/announcements/reduced motion/3 widths; no axe scan (no new deps); General Analytics pre-existing 375 px overflow) |
| R-9.4-appearance | Production appearance checks (no demo wording, no raw IDs, no hard-coded results, no fake progress, existing components, truthful provenance) | 5 | mock, review | mock DOM scan, review | verified (CS noDiagnostics; screenshots) |
| R-9.4-screenshots | Screenshots of success and non-success states supplement, not replace, interaction tests | 5, 7 | evidence folder | screenshot set | verified (CS screenshots (`PORTAL/test-results/change-intelligence`) and real-run screenshots) |
| R-9.5-e2e | Separate Playwright config with real API and isolated PostgreSQL covering mutation to recalculated resolution; mocked tests retained | 7 | `PORTAL/` e2e config | e2e `9.5.source-to-resolution` | verified (`PORTAL/playwright.e2e-real.config.ts`; E2E 9.5.source-to-resolution) |
| R-9.6-fixture | 100,000 sales, 1,000 products; extend `merchant-insights.load.ts` | 7 | load script | bench | verified (PERF fixture (1,000 products, 100,000 sales); `changes:load`) |
| R-9.6-incremental | One-product incremental p95 <= 2 s | 7 | bench | bench | verified (PERF p95 204 ms (gate 2 s), local) |
| R-9.6-stock-only | Stock-only propagation p95 <= 500 ms | 7 | bench | bench | verified (PERF p95 215 ms (gate 500 ms), local) |
| R-9.6-daily | Daily clock evaluation, 1,000 products <= 30 s | 7 | bench | bench | verified (PERF 1.06 s (gate 30 s), local) |
| R-9.6-init | Full initialization <= 120 s | 7 | bench | bench | verified (PERF 1.72 s cold (gate 120 s), local) |
| R-9.6-write | Source-write p95 regression <= 10% | 2, 7 | bench | bench | partial (PERF: HTTP ≤10 % gate not established on a loaded machine; statement-level ~0.2 ms (CAP); Stage 8 rerun on quiet/hosted infra) |
| R-9.6-hourly | Stock change source-to-visible <= 65 min | 7 | bench | bench | blocked (Stage 8) (hosted scheduler latency (PERF "Hosted-only gates")) |
| R-9.6-update-now | "Update now" stock/threshold visible <= 2 min incl. job start-up | 7 | bench | bench (local with CLI start; hosted number at Stage 8) | blocked (Stage 8) (hosted job start-up (PERF "Hosted-only gates"); local CLI path measured) |
| R-9.6-demand-visible | Demand case visible after second qualifying day by 02:05 local | 7 | bench | bench | blocked (Stage 8) (hosted (PERF "Hosted-only gates")) |
| R-9.6-record | Startup measured separately; hardware, DB size, concurrency, samples, cold/warm recorded; gates labelled proposed | 7 | report | report | verified (PERF conditions table (hardware, DB size, concurrency, samples, cold/warm, load)) |
| R-9.7-format | Evaluation report in JSON and Markdown | 6, 7 | evaluation export | report files | verified (Stage 6: evaluation-*.json/.md) |
| R-9.7-confusion | Labelled detection outcomes with confusion matrix on injected-shift fixtures | 6, 7 | export | report | partial (REP detection power; figures differ from §2.3 (different injection method: binomial thinning / Bernoulli extra unit)) |
| R-9.7-false-pos | False-positive count on unshifted data | 6, 7 | export | report | verified (Stage 6: evaluation report) |
| R-9.7-backtest | §2.3 backtest replay | 6, 7 | export | report | verified (Stage 6: evaluation report) |
| R-9.7-affected | Expected vs actual affected-node sets | 6, 7 | export | report | verified (Stage 6: evaluation report (propagation)) |
| R-9.7-consistency | Propagation and selective-update consistency | 6, 7 | export | report | verified (REP (refreshed 2026-10-25): selective vs full 0 of 122 states differ for stock-only and threshold-only) |
| R-9.7-latency | Latency | 7 | export | report | partial (REP pure-engine latency (p50 5.4 ms, p95 14.3 ms) and PERF local; hosted latency Stage 8) |
| R-9.7-arith | Arithmetic correctness | 7 | export | report | verified (Stage 6: evaluation report: 0 mismatches) |
| R-9.7-wape | 7-day forecast WAPE (reference 26.1%) | 6, 7 | export | report | verified (Stage 6: evaluation report: 26.1% over 560) |
| R-9.7-explanations | Explanation completeness | 7 | export | report | verified (Stage 6: evaluation report: 0 incomplete) |
| R-9.7-ui | UI acceptance results | 7 | export | report | partial (UI acceptance in CS/E2E suites and screenshots; not written into the evaluation report) |
| R-9.7-caveat | Report states fixtures prove mechanics, not real-world accuracy | 7 | report text | report | verified (Stage 6: evaluation report header) |

---

## 2. Stage 0 recheck: differences from §2.1

Repo rechecked at commit `37b408e`. Every §2.1 fact matched:

- legacy queue, lease and allowlist
- `0029` triggers
- legacy insight codes
- 6-hour cadence and 375-minute stale threshold
- Analytics routes and redirects
- proxy allowlist
- inventory `useSearchParams`
- no `GET products/:id`
- editable timezone
- seeder behaviour

Additional findings:

- (a) `apps/api/.env` has a `DATABASE_URL` that targets the hosted Supabase database. All integration and acceptance work therefore uses an isolated local database, `mcbuse_ci_test` (localhost:5432), with `DATABASE_URL` exported explicitly in the shell or test config. Nothing reads `apps/api/.env` for these runs.
- (b) The repo's skills live in `.agents/skills/` (tdd, execute, commit-check).

---

## 3. Interpretations of open points (veto list)

The plan is silent on these. Each is a decision made for implementation.

- **I-1. Expiry of non-demand cases.** `stock_threshold_change` and `historical_correction` cases resolve as `no_longer_detected` after `expiryDays` daily evaluations without further change.
- **I-2. Processing metadata location.** The §4.1 "Processing metadata" row (bootstrap status, model version, last daily evaluation local date, next scheduled evaluation) lives on the per-merchant change-work row. No separate table.
- **I-3. Disabling capture.** Capture is disabled operationally with `ALTER TABLE ... DISABLE TRIGGER change_capture_*`. There is no config table.
- **I-4. §5.10 "Before" column.** Read as the forecast before the shifted week (28-day units 112, 4.0/day). Tested as forecast arithmetic, separately from the detection arithmetic (R = 42 vs E = 28).
- **I-5. Stage 8.** The hosted release is out of scope until Fred approves it. No hosted deploy, hosted seeding, hosted allowlist change or hosted job/IAM change is made before that.

### Interpretations made in Stages 1, 3 and 4

The plan is silent on these too. They are recorded in the code (comments next to the
implementation) rather than in the Stage 1/3/4 commit messages, which only summarise scope.

- **I-6. Merchant-level trend readiness** (`change-read.service.ts` `trendReadiness`). `ready` when any active product is ready; otherwise `building_baseline` when any product is building (days left = the smallest); otherwise `data_quality_blocked` if any product is blocked, else `insufficient_history`. A merchant recording gap overrides all of them.
- **I-7. Per-product readiness** (Stage 7 gap fix, §3.8). Status lists only active products whose trends or stock outlook are not yet assessed, in name order, with product-level readiness (the merchant recording gap is reported once, not per product), weeks used, usual weekly units, days left and the forecast reason code. Requirements come from the current settings.
- **I-8. Before and after** (§3.3/§3.5/§5.10). Before = the opening history entry's values (the state when the change was detected); Now = the latest saved values. Applied in the read path to the list card and detail; the history list keeps every entry. Falls back to the case evidence if the opening entry no longer exists.
- **I-9. Cases keep their opening settings** (`change-publisher.service.ts`, §5.11). Each history entry records its own run's settings.
- **I-10. Active view is not date-bounded** (§5.9). Resolved/all views default to the last 30 local days on `last_changed_at`; the active view shows every active case unless a range is given, so a long-standing stock problem stays visible.
- **I-11. Unavailable feature.** List, detail and run evidence answer 404 when the feature is off for the merchant; status answers 200 with `available: false` and `unavailableReason` `disabled` (global flag) or `not_enabled` (allowlist).
- **I-12. Delayed.** Processing is `delayed` when the oldest pending event is older than 75 minutes (one hourly run plus margin); a failure more recent than the last success is `failed` (it takes precedence over delayed and pending).
- **I-13. Cursors.** Opaque base64url JSON bound to its ordering (attention vs most recent); a malformed cursor or one from the other view is 400.
- **I-14. Detail history bound.** The detail returns the latest 100 history entries.
- **I-15. Deep Analytics authority** (§2.5). Change Intelligence is authoritative only when the merchant is enabled **and** initialized (bootstrap completed); the adapter covers stock-risk and unit-demand cases. Transaction-velocity cases stay on the Changes page only.
- **I-16. Serialization conflicts** (§4.5). Retried in-process with bounded jitter and not recorded as failures; only exhausted retries count toward backoff.
- **I-17. Stock-only runs load the whole sale window** (PERF). Kept to preserve the engine's input contract; within the gates.

### Stage 7 known deviations and limits

- §9.3 replay: Sourdough loaf (424d…) is `insufficient_history` at E = 4.75, so "ready for 10 products" cannot hold; the plan's statement contradicts its own §5.5 E < 5 rule. Ready evaluations are 539, not 549, for the same reason.
- Detection-power figures differ from §2.3 because the injection method differs (binomial thinning / Bernoulli extra unit, REP method).
- Source-write ≤ 10 % gate through HTTP is not established on this loaded machine; statement-level overhead is about 0.2 ms locally. Rerun on quiet or hosted infrastructure at Stage 8.
- Hosted-only latency gates (hourly source-to-visible, Update now with job start-up, demand visible by 02:05) are blocked until Stage 8.
- "Includes test payments" on the detail page was removed by Fred (R-3.11-test-payments); the API field remains.
- General Analytics has pre-existing horizontal overflow at 375 px (not introduced by this work).
- No automated axe scan: adding axe would be a new dependency. Keyboard, names, 44 px targets, focus restore, announcements and reduced motion are covered by CS.
- The `merchant-events` "burst in order" integration test is flaky on `main` already (not related to Change Intelligence).
- The §9.3 current-data acceptance was run locally with screenshots in `PORTAL/test-results-real/change-intelligence-real/` (git-ignored). Counts such as the six initial low-stock cases are not recorded in a committed report, so those rows are `partial`.

---

## 4. Named test scenarios

### §9.1 Pure engine (unit)

- 9.1.1 stable-baseline-no-case
- 9.1.2 sustained-increase-confirmed-day-2
- 9.1.3 small-fluctuation-no-case
- 9.1.4 high-variance-uses-s2
- 9.1.5 low-expected-insufficient-history
- 9.1.6 transactions-up-units-flat
- 9.1.7 stock-only-skips-demand
- 9.1.8 threshold-only
- 9.1.9 restock-keeps-demand-case
- 9.1.10 unchanged-node-stops-propagation
- 9.1.11 product-isolation-fixed-clock
- 9.1.12 merchant-summary-updates
- 9.1.13 same-day-rerun-no-confirmation
- 9.1.14 recovery-expiry-readiness-loss-reversal
- 9.1.15 zero-demand-zero-stock-negative-available
- 9.1.16 void-reassignment-historical-correction
- 9.1.17 clock-only-rollover
- 9.1.18 recording-gap-suppression
- 9.1.19 past-gap-building-baseline
- 9.1.20 single-day-spike-guard
- 9.1.21 dst-and-accra-local-days
- 9.1.22 invalid-registries
- 9.1.23 exact-5.10-arithmetic (forecast and detection tests separate, per I-4)
- 9.1.24 risk-order-out-of-stock-without-forecast
- 9.1.25 settings-defaults-override-rejection
- 9.1.26 baseline-weeks-by-history
- 9.1.27 settings-change-fingerprint-and-run

### §9.2 PostgreSQL integration

- 9.2.source-event-atomicity
- 9.2.parent-child-observations
- 9.2.event-coalescing
- 9.2.uncommitted-invisible
- 9.2.concurrent-commits
- 9.2.crash-no-partial
- 9.2.idempotent-retry
- 9.2.stale-lease-rejected
- 9.2.later-events-pending
- 9.2.publish-complete-atomic
- 9.2.bootstrap-replay
- 9.2.capture-imports
- 9.2.capture-reservations
- 9.2.capture-archives
- 9.2.capture-voids
- 9.2.capture-restocks
- 9.2.capture-timezone
- 9.2.invoice-item-no-event
- 9.2.tenant-isolation
- 9.2.retention-safe
- 9.2.model-upgrade-history
- 9.2.update-now-picker
- 9.2.update-now-dual-permission
- 9.2.update-now-403
- 9.2.update-now-404
- 9.2.update-now-audited
- 9.2.update-now-already-running
- 9.2.update-now-no-overlap
- 9.2.update-now-confirmation-timing

### §9.3 Current-data acceptance

- 9.3.today-recording-gap
- 9.3.today-no-demand-forecast-unavailable
- 9.3.today-six-initial-low-stock
- 9.3.today-coffee-candy-insufficient
- 9.3.today-ui-gap-state
- 9.3.replay-424d-ready
- 9.3.replay-dfdf-three-weeks
- 9.3.replay-dfdf-min4-building-baseline
- 9.3.backtest-replay
- 9.3.shift-confirmed-increase
- 9.3.shift-review-stock-restock

### §9.4 Production UI acceptance

- 9.4.functionality-destinations-redirects
- 9.4.functionality-deep-links-refresh
- 9.4.functionality-url-filters-pagination
- 9.4.functionality-values-match-backend
- 9.4.functionality-deep-and-changes-agree
- 9.4.functionality-inventory-action-off-page
- 9.4.functionality-background-update-keeps-state
- 9.4.states-all-thirteen
- 9.4.a11y-keyboard-focus-names-headings
- 9.4.a11y-focus-restore-announcements-motion
- 9.4.responsive-375-768-1280
- 9.4.no-clipping-no-horizontal-scroll-no-colour-only
- 9.4.appearance-no-demo-no-diagnostics-no-hardcoded

### §9.5 Real end-to-end path

- 9.5.source-to-resolution

---

Row count is reported in the hand-back message (lines matching `^| R-` in section 1).
