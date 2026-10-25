# MCBuse Change Intelligence & Orchestration — Production Implementation Plan

Revision 2.3 (2026-10-25): staff merchant picker, multi-permission staff table, initial allowlist.
Revision 2.2 (2026-10-25): fast sessions replaced by a staff-only "Update now".
Revision 2.1 (2026-10-25): adds settings.
Revision 2 (2026-10-25). Revision 1 was reviewed against commit `37b408e` and
the configured database. This revision corrects the baseline, threshold and
timing rules so that they work on the volumes MCBuse actually records, and
fixes the factual mismatches found in the review. Section 0 lists every change.

---

## 0. Changes from revision 1

| # | Revision 1 | Revision 2 | Why |
|---|---|---|---|
| 1 | During-day (4-hour) product detection plus daily 3-day detection | **Daily detection only**, on a 7-day window against the previous 3–4 weeks. During-day detection is deferred (§5.12). | Products record about 2 units per 4-hour window; the 20-unit baseline gate could never be met (§2.2). |
| 2 | Baseline mean ≥ 20, absolute ≥ 5, relative ≥ 20%, > 3 population SD over 4 samples | Expected ≥ 5 per week, absolute ≥ 3, relative ≥ 25%, dispersion-aware z ≥ 2.5, single-day spike guard | These are count-appropriate rules, backtested on current data (§2.3). |
| 3 | Forecast needs ≥ 28 linked units in 28 days | ≥ 14 units in 28 days, plus a recorded merchant sale in the last 7 days | Every current product except one meets 14. The recency rule stops stale rates from producing forecasts. |
| 4 | `adjusted = baseline × confirmedRatio` | When a unit-demand change is confirmed, use the recent 7-day rate; otherwise use the 28-day rate | The 28-day baseline already contains the recent week, so multiplying would double-count it. |
| 5 | Daily baseline windows shifted by up to 28 days, but only 28 days of history required | The history needed now follows from the number of baseline weeks used: 28 days with the defaults (see #18). Forecasts need 28. | Revision 1's history requirement didn't match how far back its baseline reached. |
| 6 | Fast session: change visible in p95 ≤ 15 s | Fast sessions removed. Staff "Update now" makes a **stock or threshold** change visible within 2 minutes. | Demand cases need their confirmation days by design, and a one-off update covers the support need. |
| 7 | No rule for gaps in the merchant's recording | `recording_gap` readiness. Decrease detection and forecasts are suppressed while the merchant has stopped recording. | Current data ends 26–28 Sep, so without this rule every product would show a false decrease. |
| 8 | DST: mark unequal 4-hour windows unavailable | Windows are local calendar days, so 23- and 25-hour days are handled naturally | During-day windows are gone. |
| 9 | Triggers on invoice items and stock movements | Capture finalized `merchant_transactions`, cash-sale headers and items, products (filtered by column), committed imports and merchant timezone. No trigger on invoice items or stock movements. | Invoice items are written before payment. Stock movements duplicate product updates and would triple the events written per sale. |
| 10 | Increase and decrease are separate case types, but a reversal "replaces" the direction | A reversal resolves the old case with `direction_reversed` and opens a case of the opposite type | Removes the conflict with "one active case per type". |
| 11 | `MERCHANT_CHANGE_INTELLIGENCE_MODEL_VERSION` environment variable | Removed. The model version is a code constant in the registry. | An environment variable could only disagree with the code. |
| 12 | Inventory deep link assumes the product can be loaded | Add `GET /merchants/me/products/:id` | No such endpoint exists today. |
| 13 | Three Analytics destinations | Same, and the existing `/analytics`, `/analytics/inventory` and `/analytics/transactions` redirects are preserved | These routes exist as bookmark redirects. |
| 14 | Generated records must be identifiable (no mechanism given) | `merchants.data_provenance` (`ordinary` / `sample`), set only by sample tooling. Digital sales keep `evidence_environment`; cash sales are reported as `unknown` provenance. | Cash sales have no provenance column, and the seeder marks nothing today. |
| 15 | Timezone handling unspecified | Use `merchants.timezone`. Show it in the calculation details, linked to the existing Business profile editor. A timezone change triggers recalculation. | Both current merchants are on the `Europe/Berlin` default. The value is already editable. |
| 16 | — | Hackathon constraints no longer apply | The hackathon has ended. |
| 17 | Rules fixed in code | All detection, forecast and timing numbers are **settings** (§5.11) with validated ranges. Each run records the settings it used. | Fred's request (rev 2.1). Thresholds will need tuning as real merchant data arrives. |
| 18 | Always 4 baseline weeks, so 35 days of history | Uses as many weeks as are available, between 3 (minimum) and 4 (maximum). Detection starts after 28 days. | Backtest: 3 weeks ≈ 4 weeks in quality; 2 weeks doubles false alarms (§2.3). |
| 19 | Fast sessions (5 s loop for up to 60 min) | Removed. Replaced by a one-off, staff-only **"Update now"** with a `change_intelligence_operator` permission, one staff API endpoint, a button in the staff portal and audit logging (§8). | Fred's decision (rev 2.2): fast sessions were a lot of work for a convenience. |

---

## 1. Outcome and agreed scope

Build a production feature that detects meaningful changes in recorded merchant
activity, identifies the business states affected, recalculates those states and
explains the consequences.

**Both the engine and the interface must be production grade.** This is an
everyday merchant feature. It must work on actual records and feel like a
finished part of MCBuse.

Controlled scenarios are isolated acceptance-test fixtures. They use the same
engine and interface.

### Fixed decisions

| Area | Decision |
|---|---|
| Location | **Analytics → Changes**, alongside General Analytics and Deep Analytics |
| Users | Existing authenticated merchant owners. Non-owner members get 404 from the Changes API and do not see the navigation item. |
| Detection | Daily analysis of product sales trends. Stock, reservation and threshold changes are processed hourly. |
| Normal processing | Hourly background execution |
| Faster processing | Staff-only "Update now": one immediate run of the same worker and rules |
| Tuning | Detection, forecast and timing numbers are validated settings (§5.11) |
| Merchant actions | Review explanations and open existing product/inventory actions |
| UI standard | Finished merchant product, consistent with the existing portal |
| Runtime intelligence | Deterministic calculations and explicit dependencies; no LLM required |
| Initial domains | Product transactions, recorded demand, available stock, depletion, stock-out risk and replenishment guidance |
| Platform | Existing NestJS API, PostgreSQL/Drizzle, Next.js portal and Cloud Run infrastructure |
| Mobile | Responsive portal; no new native-mobile screens in this release |

**Completion means the complete path works:**

> A committed source change produces durable work; the worker identifies the
> affected dependency branch; resulting states and explanations are saved
> atomically; the merchant sees the change and can inspect its meaning and
> evidence.

### Scope boundaries

This release does not add payment rails, crypto functionality, external POS
connectors, purchasing automation, supplier management, task assignment or
subscriptions.

Use existing sources:

- Finalized MCBuse transactions (`merchant_transactions`, `status='finalized'`)
  and their product lines. The lines are `merchant_invoice_items`, joined on
  `payment_request_id`.
- Recorded cash sales (`merchant_cash_sales`) and their product lines
  (`merchant_cash_sale_items`).
- Cash-sale voids (`status='voided'`).
- Product stock (`on_hand_quantity`), reservations (`reserved_quantity`) and
  minimum-stock thresholds (`low_stock_threshold`) on `merchant_products`.
- Existing committed inventory imports.

Settlement imports do not provide product sales. Do not treat payout records as
demand observations.

The implementation demonstrates a mechanism. Technological novelty, predictive
accuracy and willingness to pay require separate evidence.

---

## 2. Current implementation, data and architecture

### 2.1 Verified starting point (commit `37b408e`, clean tree)

**Existing analytics:**

- `merchant_analytics_work` is a queue with one row per merchant. It already has a 120 s lease, 30 s
  renewal, `FOR UPDATE SKIP LOCKED`, `next_attempt_at`, an enable flag and an
  allowlist (`analytics-work-queue.service.ts`, `analytics-orchestrator.service.ts`).
- Triggers (`0029_merchant_repair.sql`) call `enqueue_merchant_analytics`
  on INSERT/UPDATE of `merchant_transactions`, `merchant_cash_sales`,
  `merchant_products` and `merchant_import_batches`. They do not fire on DELETE
  or on item tables.
- Completing work deletes `merchant_analytics_outbox` rows and the work row
  (generation counter).
- The legacy engine (`merchant-insights.engine.ts`, `merchant-intelligence-v1`)
  writes these insight codes:
  - product-level: `stock_risk.<productId>`, `anomaly.product.<productId>`, `discrepancy.stock.<productId>`
  - merchant-level: `anomaly.daily_volume`, `anomaly.hour.<h>`, `anomaly.payment_mix`, performance.
- The legacy worker runs every 6 hours (`docs/merchant-analytics-intelligence.md`)
  with a stale threshold of 375 minutes.

**Portal:**

- Analytics routes: `/analytics` → `/analytics/general`, `/analytics/deep`.
  `/analytics/inventory` and `/analytics/transactions` are bookmark redirects.
- The proxy allowlist is in `apps/portal/app/api/merchant/[...path]/route.ts`.
- Inventory (`app/(merchant)/inventory/inventory-view.tsx`) already reads
  `useSearchParams`.
- There is no `GET /merchants/me/products/:id`. `products/:id/analytics` exists.
- Timezone is editable in Business profile (`update-merchant-profile.dto.ts`).

**Seeder:** `apps/api/scripts/seed-local-overview-demo.mjs` already produces
deterministic café trading with a realistic rhythm and voids. It refuses remote
hosts unless `--allow-host` / `--allow-db-host` is given, and later runs only
add the days since the previous run.

Recheck these facts at Stage 0. The repository may have changed.

### 2.2 Current data (read-only queries, 2026-10-25)

| Measure | Value |
|---|---|
| Merchants | 2 active, both `Europe/Berlin` (the column default) |
| Products | 22 (21 with sales) |
| Digital sales | 350 finalized, all `evidence_environment='test'`, 25 Aug – 28 Sep |
| Cash sales | 1,598 recorded + 8 voided, 1 Jul – 28 Sep, all generated by the seeder (`ovw` idempotency prefix) |
| Linked product lines | 3,154 units; 13 unassigned lines |
| Committed imports | 0 |
| Merchant `424d…` | 10 products, history 1 Jul – 28 Sep (84 active days) |
| Merchant `dfdf…` | 11 products, history 27 Aug – 26 Sep (30 days) |
| Units per product per day (last 28 days of data) | 0.8 – 5.8; median ≈ 3 |
| Units per product per active 4-hour window | mean 1.3 – 2.6; max 7 |
| Products currently at/below threshold | Butter croissant (3), Ham and cheese sandwich (4), Sourdough loaf (2) on both merchants (threshold 5) |
| Gap to today | **No sales since 26/28 Sep (27+ days)** |

All current merchant data is generated test data. `docs/go-live-checklist.md`
requires seeded history to be removed before launch.

### 2.3 Rule backtest on current data

A reference implementation of the §5 rules was run over the daily product
totals for merchant `424d…`. That is the only merchant with ≥ 35 days of history:
549 eligible product-day evaluations across 10 products, 5 Aug – 28 Sep.

| Rule | Qualifying evaluations | Confirmed cases (2 consecutive days) |
|---|---:|---:|
| z ≥ 2.0 | 44 | — |
| **z ≥ 2.5 (chosen)** | 20 | 4 |
| z ≥ 3.0 | 8 | 1 |

Detection power was measured by injecting a sustained shift 21 days before the
end of the data: 20 trials × 10 products, with confirmation required.

| Injected shift | z ≥ 2.5 detected | median lag | z ≥ 3.0 detected |
|---|---:|---:|---:|
| ×1.25 | 33% | 8 days | 7% |
| ×1.5 | 68% | 7 days | 39% |
| ×2.0 | 90% | 6 days | 90% |
| ×0.5 | 30% | 9 days | 7% |

Number of baseline weeks, compared over the same 5 Aug – 28 Sep period at
z ≥ 2.5 with confirmation:

| Baseline weeks | History needed | Changes opened on unaltered data | +50% shift caught | ×2 shift caught |
|---:|---:|---:|---:|---:|
| 2 | 21 days | 9 | 66% | 90% |
| **3 (minimum)** | **28 days** | 5 | 68% | 90% |
| **4 (maximum)** | 35 days | 4 | 67% | 90% |

Fewer weeks does not catch more real changes. It only adds false alarms, so the
minimum is 3.

Seven-day forecast WAPE using the 28-day rate was **26.1%** over 560
evaluations. The matching-weekday mean gives the identical figure because, over
a 7-day horizon, it reduces to the same total.

Interpretation:

- z ≥ 2.5 produces about one confirmed case per two weeks across a 10-product
  café. It catches most sustained increases of 50% or more.
- Decreases are hard to detect at these volumes. The UI and documentation must not imply
  otherwise.
- These rules are versioned initial rules, not validated merchant-risk
  thresholds. The data is generated.

### 2.4 New feature module

Create `apps/api/src/change-intelligence/` with separate responsibilities:

1. Source-change capture and scheduling.
2. Canonical source-data loading.
3. Pure dependency and calculation engine.
4. Transactional state/run persistence.
5. Merchant read APIs.
6. Worker and operational tools.

The pure engine has no database, HTTP, cloud SDK, browser or LLM dependencies.
Inject the clock and the versioned calculation configuration.

The new queue copies the existing claim/renew/fail pattern from
`AnalyticsWorkQueueService`. It uses its own tables because the legacy
completion step deletes outbox rows and work rows.

### 2.5 Relationship to existing analytics

| View | Responsibility |
|---|---|
| General Analytics | Descriptive reporting on recorded activity |
| Deep Analytics | Current signals, forecasts and risks |
| Changes | What changed, what it affected and how the resulting guidance changed |

For enabled merchants, the new engine becomes authoritative for product
demand-change and stock-risk outputs. Deep Analytics reads those through a
compatibility adapter. The legacy engine suppresses `stock_risk.<productId>` and
`anomaly.product.<productId>` for those merchants. The remaining legacy codes continue
with their own model identity and calculation timestamp.

Do not show conflicting forecasts for the same product across analytics views.
The new pipeline must not depend on legacy queue cleanup, generation counters
or successful legacy execution.

Update `docs/merchant-analytics-intelligence.md` to describe both engines and
their separate cadences.

---

## 3. Production-grade merchant interface

### 3.1 Mandatory product standard

The interface must be designed for a merchant using it routinely.

**It must not resemble a demo, presentation, debugging console or technical
proof-of-concept dashboard.**

- Use the portal's existing typography, spacing, colours, components and
  interaction patterns.
- Lead with the business change, its consequence and the relevant action.
- Use plain merchant language.
- Show actual persisted backend results.
- Keep infrastructure details out of the main merchant experience.
- Provide complete loading, empty, error, delayed-update, recording-gap and
  insufficient-data states.
- Support mobile, tablet, desktop, keyboard and assistive technology.
- Avoid oversized explanatory banners, decorative process diagrams and
  unnecessary metric tiles.
- No scenario selectors, playback controls, "Run demo" buttons or presentation
  mode on merchant pages.
- No fake progress, scripted outcomes or animations that imply processing not
  reported by the backend.

### 3.2 Navigation

Add `/analytics/changes`. Extract a shared Analytics navigation component used
by General analytics, Deep analytics and Changes. It replaces the ad hoc links
in `general-analytics-view.tsx` and `analytics-dashboard.tsx`. Add the route to
`lib/breadcrumbs.ts`.

Preserve existing URLs and the `/analytics`, `/analytics/inventory` and
`/analytics/transactions` redirects. Navigation must remain usable at narrow
widths without page-level horizontal scrolling. Hide the Changes item for
non-owner members.

### 3.3 Page hierarchy

#### Header

- Title: **Changes**
- Supporting text: "See what changed in your recorded activity and how it
  affects your stock and sales outlook."
- Last successful analysis time.
- Cadence: "Stock updates hourly. Sales trends update once a day."
- A concise pending, processing, delayed or recording-gap status when relevant.

#### Summary

A compact strip of persisted values: active changes, products needing stock
review, latest successful analysis.

#### Filters

Product; change type (demand, stock, threshold, correction); status (active,
resolved, all); date range (default last 30 days). Persist filters in URL
parameters, and offer "Clear filters" when any are active. Use cursor
pagination with 25 entries per page.

#### Change list

Each entry shows the product name, a plain-English headline, the detected time and
observation period, before/after values with explicit units, the operational
consequence, active/resolved state and a "View explanation" link.

Example (realistic volumes):

> **Cappuccino is selling faster**
> 42 units were recorded in the last 7 days, against a usual 28.
> Stock is now expected to reach its minimum in about 6 days instead of 9.
> Review replenishment for the coming week.

Do not infer unsupported causes. Use text and icons alongside colour.

### 3.4 Default ordering and attention

The default view shows active changes in this priority order:

1. Out of stock.
2. At or below minimum stock.
3. Projected stock risk.
4. Confirmed demand changes.
5. Other supported changes.

Within a priority, sort by most recent meaningful change. Resolved changes remain available through the
status filter. The UI must not imply every change is urgent.

### 3.5 Detail page

`/analytics/changes/[changeId]`. It must be directly linkable and survive a refresh.

Sections:

1. **What changed:** the observed 7-day value, the usual weekly value and the 4
   baseline weeks.
2. **Impact:** the affected business states.
3. **Before and after:** values with units.
4. **Suggested action:** the existing workflow.
5. **How this was calculated:** an expandable section covering inputs, windows,
   assumptions, the merchant timezone (linked to Business profile) and the
   model version.
6. **Source information:** coverage and provenance.

Present the dependency trail as a compact step list. Show only relationships represented in the saved calculation.

### 3.6 Merchant information versus operational diagnostics

Merchant-visible: recorded values and units, baseline and observation periods,
relevant dependencies, before/after projections, data limitations, last
calculation time, timezone.

Never on merchant screens: run UUIDs, event IDs, lease tokens, queue internals,
node keys, raw fingerprints, z-scores, stack traces, database errors,
processing logs, raw evaluated/skipped-node counts.

Diagnostics belong in restricted commands and exported evaluation reports. The
only staff UI is the "Update now" control (§8). Do not build a general staff
console.

### 3.7 Existing merchant actions

"View product" and "Review stock" link to
`/inventory?productId=<id>&action=edit|stock`. Inventory loads the product
through the new `GET /merchants/me/products/:id` when it is not on the loaded
page. Stock adjustments use the existing
`POST products/:id/stock-adjustments`. The engine resolves a risk only when the
recalculated state supports it. Opening an action never resolves anything.

### 3.8 Required states and copy

| State | Required behaviour |
|---|---|
| Loading | Stable skeleton matching the final layout |
| Building baseline | "Sales trends need 28 days of recorded sales. N more days needed." The day count comes from the settings. Stock risks are still shown. |
| Insufficient product history | Name what is unavailable and the requirement (e.g. "at least 14 units in the last 28 days") |
| Recording gap | "No sales recorded since <date>. Sales trends and projections resume when new sales are recorded." Current stock problems remain visible. |
| No material changes | "No significant changes were detected in your recorded sales." |
| No filter matches | Offer "Clear filters"; distinct from no detected changes |
| Pending hourly processing | New records are awaiting the next update |
| Processing | Active processing, no invented percentages |
| Analysis failed | Retain previous results; state that the latest analysis failed |
| Read failure | Retry; never replace previous results with an empty state |
| Offline | Preserve loaded information; explain connectivity |
| Product archived/unavailable | Preserve history; disable unavailable actions |
| Feature unavailable | Deliberate unavailable state |
| Sample or test records | Discreet account/source indicator (§3.11) |

A blank panel or "No changes" must never hide a failed request, missing
baseline, recording gap or processing failure.

### 3.9 Interaction and accessibility

- Semantic navigation, headings, lists, tables and controls.
- Visible focus.
- Accessible names on icon-only controls.
- Focus restoration after drawers close.
- Polite announcements of significant status changes, without repetition.
- Respect reduced-motion settings.
- Touch targets of at least 44 × 44 px.
- Adequate contrast.
- Long names and large values must not clip.
- Consistent formatting of numbers, dates and units.
- Readable hierarchy at 375, 768 and 1280 px.
- No layout shift on load.
- Routine refresh must not reset filters or scroll position.

### 3.10 Refresh behaviour

Poll every 60 s while the page is visible, and every 5 s while the backend reports active
processing. Stop in hidden tabs and never send overlapping requests. "Refresh" reloads saved results and never
launches analysis.

### 3.11 Data provenance

- `merchants.data_provenance` is `ordinary` by default. Only the sample tooling (§8) sets
  it to `sample`.
- The Changes header shows a small "Sample account" indicator for `sample`
  merchants.
- Source information reports digital sales by `evidence_environment`
  (`live`/`test`/`synthetic`/`unknown`) and cash sales as provenance
  `unknown`.
- Show "Includes test payments" when any digital sale in the analysed window is not `live`.

No demo branding, tutorial overlay or presentation controls.

---

## 4. Durable data capture and processing

### 4.1 Persistence

Use additive migrations, numbered after `0037`, with the existing server-only
permissions pattern (`0031`/`0032`): RLS enabled and no `anon`/`authenticated`
grants.

| Record | Essential contents |
|---|---|
| Change events | UUID, merchant, source type/ID, operation, relevant changed fields, old/new product references, timestamps, processing status, run reference |
| Change work | One durable row per merchant: requested/processed revisions, lease token/expiry, attempts, next attempt, error |
| Change runs | UUID, merchant, model version, effective settings and settings fingerprint, fixed `asOf`, source cutoff, reason, status, duration, counts, coverage, fingerprint, error, requesting staff user for "Update now" runs |
| Current states | Merchant/product/node key, typed value, readiness, semantic fingerprint, version, last changed time, producing run |
| State transitions | Immutable before/after values, parent references, run ID, explanation facts |
| Change cases | Merchant/product/type identity, status, severity, first/last detection, latest transition, resolution reason, evidence, consecutive-qualification counters |
| Processing metadata | Bootstrap status, model version, last daily evaluation local date, next scheduled evaluation |
| `merchants.data_provenance` | `ordinary` / `sample` |

Include the merchant in composite uniqueness and access conditions. Keep work
rows after success, and never reset revisions. Use stable UUIDs for events and
runs. Numeric sequences are not commit ordering.

### 4.2 Transactional capture

New triggers, separate from the legacy ones:

| Source | Operations | Captured when |
|---|---|---|
| `merchant_transactions` | INSERT, UPDATE, DELETE | `status` changes to or from `finalized`, or `occurred_at` changes. Product lines are resolved at load time through `payment_request_id`. |
| `merchant_cash_sales` | INSERT, UPDATE, DELETE | Recorded, voided, or `occurred_at` changes |
| `merchant_cash_sale_items` | UPDATE, DELETE | `product_id` or `quantity` changes. Old and new product are kept, and the merchant is resolved through the parent. Inserts are covered by the header. |
| `merchant_products` | INSERT, UPDATE, DELETE | Only `on_hand_quantity`, `reserved_quantity`, `low_stock_threshold`, `status` |
| `merchant_import_batches` | UPDATE | Status becomes `committed` |
| `merchants` | UPDATE | `timezone` changes |

There are no triggers on `merchant_invoice_items` (written before payment) or on
`merchant_stock_movements` (the product row update carries the same change).
A cash sale produces at most two events: the header and the product stock
update.

Each trigger writes one event and advances work in the source transaction. It
performs no analysis. Image and description changes do not fire. Do not store
credentials, wallet keys, customer identities, uploaded files or payment
payloads. Legacy triggers remain during rollout.

### 4.3 Canonical observations

Normalize into product sale observations, current inventory observations,
inventory provenance observations and product configuration observations.

Sale observations contain:

- merchant and product IDs;
- the sale ID and stable source line ID;
- `occurred_at` and the recording time;
- quantity;
- source (`mcbuse_payment` / `merchant_cash`);
- environment (`evidence_environment` for digital sales, `unknown` for cash);
- eligibility.

Rules:

- Transactions = distinct eligible sale IDs that contain the product. Units = sum of quantities.
- Finalized digital sales and recorded cash sales count. Pending, failed, cancelled and voided sales do not.
- `stockAccountedFor=true` does not exclude a sale from demand.
- Unassigned lines count toward coverage but not toward product demand.
- Imports are inventory observations, not sales.
- Reservations reduce availability: available = on hand − reserved.
- Money stays in integer minor units with its currency. Unknown provenance stays unknown.
- Local dates use `merchants.timezone`.
- Product observation history starts at the earliest of the product's `created_at`, its first
  stock movement and its first recorded sale. Seeded products have sales before
  `created_at`.

The first release reports recorded activity only. It must not imply that MCBuse captures all of the merchant's business.

### 4.4 Consistent processing

For one merchant:

1. Claim work with a lease (`FOR UPDATE SKIP LOCKED`).
2. Assign a run UUID and a fixed `asOf`.
3. In a repeatable-read transaction, load the visible committed events, the relevant
   observations and the current states.
4. Coalesce events into affected products and input fields.
5. Normalize observations.
6. Evaluate the dependency engine.
7. Verify lease ownership and the expected state revision.
8. Atomically save states, transitions, cases, the run and processed event references.
9. Advance the processed revision while preserving later work.
10. Commit before exposing results.

No partial run is ever visible. Concurrent commits stay eligible for a later pass. Never
mark events processed because a numeric ID is below a cursor.

### 4.5 Recovery

- Merchants are processed independently.
- Leases last 120 s and are renewed every 30 s. A stale token cannot publish.
- Retry serialization conflicts up to 3 times with bounded jitter.
- Retry other transient failures after 1, 5, 15 and 60 minutes. After 5 failed attempts, keep the work as failed and require an operator retry.
- Malformed observations are recorded as excluded with a reason.
- Use batched queries with indexed merchant/product/time predicates.
- Large backlogs use an explicit reconciliation run, labelled as such.

### 4.6 Initialization and time

- Enabling a merchant builds current states from existing records and records an
  initialization run. Do not invent historical changes. Existing risks are labelled
  "Identified during initial analysis".
- Every hourly invocation enqueues a clock evaluation for each enabled merchant whose
  local date has rolled over since the last daily evaluation. The daily
  evaluation runs in the first hourly run after local midnight.
- Hourly runs without new events and without a rollover do nothing.
- Clock-driven recalculation is distinct from source-event propagation. Tests
  hold the clock fixed when proving that an unrelated product is unchanged.

---

## 5. Dependency engine and calculation rules

### 5.1 Registry

A versioned code registry. Each node declares:

- a stable key and scope;
- source fields or parent nodes;
- input and output schemas;
- a calculator;
- readiness rules;
- a semantic fingerprint;
- an explanation template.

At startup, validate missing dependencies, duplicate keys, cycles, schema compatibility and
deterministic topological order. The initial model is `change-intelligence-v1`, a constant in code.

Dependencies are explicitly defined. They are not learned and do not prove real-world causation.

### 5.2 Nodes

| Node | Inputs | Output |
|---|---|---|
| Merchant recording activity | Eligible sales, clock | Recent and baseline merchant-level weekly units; recording-gap flag |
| Product transaction activity | Eligible sales, clock | Recent 7-day and 4 baseline weekly transaction counts |
| Product unit activity | Eligible sale lines, clock | Recent 7-day, 4 baseline weekly and last-28-day unit totals; daily breakdown for the spike guard |
| Transaction change | Transaction activity, recording activity | Direction, differences, qualification, confirmation |
| Unit-demand change | Unit activity, recording activity | Direction, differences, qualification, confirmation |
| Baseline daily demand | Unit activity | Recorded units/day (28-day) |
| Adjusted daily demand | Baseline, unit-demand change | Projected units/day |
| Available stock | On hand, reserved | Available quantity |
| Minimum-stock policy | `low_stock_threshold` | Minimum quantity |
| Stock cover | Available, minimum, adjusted demand | Days to minimum/zero |
| Projected stock dates | Cover, clock, timezone | Estimated local dates |
| Replenishment guidance | Available, minimum, adjusted demand | Suggested seven-day quantity |
| Stock risk | Available, minimum, cover, readiness | Risk classification |
| Merchant change summary | Active cases | Summary counts |

The minimum-stock threshold remains a merchant input. "Expected depletion" from
revision 1 is merged into adjusted daily demand because it was the same value.

### 5.3 Selective propagation

1. Identify directly affected nodes.
2. Recalculate them in topological order.
3. Compare semantic fingerprints.
4. Bump the version and propagate only when the value, readiness or meaningful evidence changed.
5. Stop at unchanged outputs.
6. Persist transitions only for changed states.
7. Record evaluated, changed and skipped counts for diagnostics.

Never include evaluation timestamps in fingerprints. A stock-only change does not invoke demand
calculators. A rise in transactions without a rise in units does not create a unit change.

The daily clock evaluation re-evaluates the activity nodes for every product.
That is expected: the window moves. Selective propagation still stops at
unchanged downstream outputs.

### 5.4 Windows

Every number in §5.4–§5.10 is the default of a setting in §5.11.

All windows are merchant-local calendar days. Day D is the most recent
completed local day at `asOf`.

- **Recent window:** D−6 … D (7 days).
- **Baseline weeks:** W1 = D−13 … D−7, W2 = D−20 … D−14, and so on. The
  engine uses as many complete weeks as the product's history allows, from
  `baselineWeeksMin` (3) up to `baselineWeeksMax` (4). The explanation states
  how many weeks were used.
- **Forecast window:** D−27 … D (28 days).

Local-day boundaries come from the IANA timezone, so 23-hour and 25-hour DST
days are handled without special cases.

### 5.5 Readiness

Evaluated per product and per measure (units, transactions), in this order:

1. `data_quality_blocked`: negative available stock or malformed observations
   for the product.
2. `recording_gap`: the merchant recorded no eligible sale in the recent window,
   **or** merchant-level recent units are below 50% of the merchant-level
   baseline weekly mean. Decrease detection and forecasts are suppressed. Increase
   detection may continue.
3. `building_baseline`: product observation history is shorter than
   7 × (`baselineWeeksMin` + 1) complete local days (28 by default),
   **or** any baseline week used has merchant-level units below 50% of the median
   of the merchant's baseline weeks. This stops a past recording gap from
   creating false increases.
4. `insufficient_history`: expected weekly value E < 5.
5. `ready`.

Forecast readiness is separate (§5.8).

### 5.6 Materiality (daily, per product, units and transactions independently)

```text
R  = recent 7-day total
Wk = baseline weekly totals W1..Wn (n = 3 or 4)
E  = mean(Wk)
s² = sample variance(Wk)            (n − 1)
z  = (R − E) / sqrt(max(E, s², 1))   (Poisson floor; overdispersion uses s²)

qualifies when all hold:
  E ≥ 5
  |R − E| ≥ 3
  |R − E| / E ≥ 0.25
  |z| ≥ 2.5
  spike guard: replace the single most extreme day in the recent window
  (largest for an increase, smallest for a decrease) with E / 7, recompute R'.
  R' must still meet the absolute and relative thresholds in the same direction.
```

E = 0 is unreachable because of the E ≥ 5 gate. It never produces an infinite percentage.

### 5.7 Confirmation, recovery and expiry

- **Confirmation:** qualifies in the same direction on two consecutive daily
  evaluations. Re-running an already-evaluated local day cannot advance
  confirmation (keyed by local date D).
- **Recovery:** resolve with `returned_to_usual` after two consecutive daily
  evaluations with |z| < 1.
- **Expiry:** resolve with `no_longer_detected` after 7 consecutive daily
  evaluations that do not qualify.
- **Readiness loss:** this is not recovery. The case stays active and is marked "not
  re-checked since <date>". It resolves with `no_longer_assessable` after 14 days
  without a ready evaluation.
- **Reversal:** a confirmed opposite direction resolves the open case with
  `direction_reversed` and opens a case of the opposite type. History is preserved.

### 5.8 Forecast arithmetic

```text
baselineDailyUnits = unitsInForecastWindow / 28

adjustedDailyUnits =
  recentUnits / 7        if an active confirmed unit_demand_increase/decrease case exists
  baselineDailyUnits     otherwise

availableUnits = onHandUnits − reservedUnits
daysToMinimum  = max(0, availableUnits − minimumUnits) / adjustedDailyUnits
daysToZero     = max(0, availableUnits) / adjustedDailyUnits
suggestedUnits = max(0, ceil(7 × adjustedDailyUnits + minimumUnits − availableUnits))
```

Forecast readiness requires all of the following:

- product observation history ≥ 28 complete local days;
- ≥ 14 linked units in the forecast window;
- the merchant is not in `recording_gap`.

Rules:

- Missing records mean zero recorded units, not proof of zero sales.
- Zero adjusted demand gives null cover and dates with reason `no_positive_demand`.
- Negative available stock blocks forecasting with a data-quality warning.
- Dates are the fixed `asOf` plus elapsed days, displayed in the merchant timezone.
- Keep full internal precision and round for display only. Suggested quantities are whole units.
- Explain that projections exclude opening hours, supplier lead times, incoming orders and
  unrecorded activity.

### 5.9 Risk ordering

1. Available ≤ 0 → out of stock.
2. Available ≤ minimum → low stock.
3. Forecast not ready → forecast unavailable. The reason is shown, and the current-stock classification above still applies.
4. Projected minimum within 7 days → projected stock risk.
5. Otherwise → normal.

Known current stock problems stay visible even when forecasts are unavailable.
This order fixes revision 1, which would have hidden out-of-stock behind
"forecast unavailable".

### 5.10 Arithmetic acceptance example (realistic volumes)

Available stock 40, minimum 5, fixed `asOf`. The baseline weeks are 27, 28, 28, 29
(E = 28, s² = 0.67). The recent week records 6 units on each of 7 days (R = 42).

Detection: |R − E| = 14 ≥ 3; relative 50% ≥ 25%; z = 14 / √28 = 2.65 ≥ 2.5.
Spike guard: R' = 42 − 6 + 4 = 40, which is still 12 units and 43% above E. The change qualifies, and
it is confirmed on the second consecutive day.

| Value | Before (no case) | After confirmed unit increase |
|---|---:|---:|
| Daily units used | 4.0 (112 / 28) | 6.0 (42 / 7) |
| Days to minimum | 8.75 | 5.83 |
| Days to zero | 10.0 | 6.67 |
| Suggested replenishment | 0 | 7 |
| Stock risk | normal | projected stock risk |

Product B's versions and fingerprints remain unchanged. When a source event
also changes stock, use the actual resulting stock.

### 5.11 Settings

All settings have code defaults. An environment can override them with
`MERCHANT_CHANGE_INTELLIGENCE_SETTINGS`, a JSON object containing only the
keys to change. The worker and API validate the merged result at startup and
**refuse to start** if any value is unknown or out of range.

| Setting | Default | Allowed range | Controls |
|---|---:|---|---|
| `baselineWeeksMin` | 3 | 3 – `baselineWeeksMax` | Fewest earlier weeks used to define "usual"; sets the history needed (§5.5) |
| `baselineWeeksMax` | 4 | `baselineWeeksMin` – 8 | Most earlier weeks used |
| `minExpectedWeekly` | 5 | 3 – 100 | Products/measures below this are `insufficient_history` |
| `minAbsoluteDifference` | 3 | 1 – 100 | Smallest change, in units or sales |
| `minRelativeDifference` | 0.25 | 0.10 – 1.00 | Smallest change as a share of usual |
| `minZ` | 2.5 | 1.5 – 4.0 | How unusual a week must be compared with normal variation |
| `confirmationDays` | 2 | 1 – 3 | Consecutive qualifying days before a change opens |
| `recoveryDays` | 2 | 1 – 7 | Consecutive "back to usual" days before it closes |
| `recoveryZ` | 1.0 | 0.5 – 2.0 | What counts as back to usual |
| `expiryDays` | 7 | 3 – 28 | Non-qualifying days before closing as `no_longer_detected` |
| `unassessableDays` | 14 | 7 – 60 | Days without a ready evaluation before `no_longer_assessable` |
| `recordingGapRatio` | 0.5 | 0.1 – 0.9 | Merchant activity share below which `recording_gap` applies |
| `forecastWindowDays` | 28 | 14 – 56 | Days averaged for the usual daily rate |
| `forecastMinUnits` | 14 | 5 – 100 | Units needed in the forecast window |
| `projectedRiskDays` | 7 | 1 – 28 | Horizon for projected stock risk |
| `replenishmentDays` | 7 | 1 – 28 | Days of demand covered by the suggested quantity |

Rules:

- Settings are global per environment in v1. Per-merchant overrides are deferred.
- Every run stores the effective settings and their fingerprint. Saved cases and
  explanations show the values that produced them, never the current ones.
- When the settings fingerprint changes, the next hourly run re-evaluates every
  enabled merchant with reason `settings_change`. Open cases are re-checked under
  the new rules and keep their history.
- Changing settings on a hosted environment is a configuration deploy and needs
  Fred's approval. There is no endpoint for changing settings.

### 5.12 Deferred: during-day detection

Not in `change-intelligence-v1`. Reintroduce it as a new model version only when
pilot merchants have products averaging ≥ 20 units per 4-hour window
(current maximum: 2.6). Hourly processing remains, for stock, reservation,
threshold, archive and correction changes.

---

## 6. Change cases and explanations

There is one active case per merchant, product and type:

- `transaction_velocity_increase`
- `transaction_velocity_decrease`
- `unit_demand_increase`
- `unit_demand_decrease`
- `stock_risk`
- `stock_threshold_change`
- `historical_correction`

- Opening a case records the first detection and transition.
- Meaningful later changes append history. Unchanged calculations do not create entries.
- Several sales in one processing window contribute to one case.
- Restocking resolves stock risk only when the risk becomes normal. It does not
  resolve an independent demand case.
- Archiving a product resolves its cases with `product_archived`.
- Voids and corrections that change an already-evaluated window open or append a
  `historical_correction` entry.
- Initialization and rebuilds record their actual reason. Resolved history remains readable.

Explanations are built from structured facts. Every recommendation traces to saved
values and a model version. No Groq call; AI narration never chooses
dependencies, changes numbers or decides whether processing succeeded.

---

## 7. APIs and shared contracts

Shared types live in `packages/shared/src/change-intelligence.ts` and are exported from the package
entrypoint.

| Endpoint | Purpose |
|---|---|
| `GET /merchants/me/changes` | Filtered, paginated cases |
| `GET /merchants/me/changes/status` | Availability, readiness, cadence, freshness, processing status, last recorded sale date, provenance |
| `GET /merchants/me/changes/runs/:runId` | Bounded merchant-safe calculation evidence |
| `GET /merchants/me/changes/:changeId` | Case, transitions, dependency trail, evidence |
| `GET /merchants/me/products/:id` | Single product for the inventory deep link |

Declare static routes before parameterized routes.

Query rules:

- Filters: `productId`, `type`, `status`, `from`, `to`, `cursor`, `limit`.
- Limit: default 25, maximum 100.
- Date range: default 30 days, maximum 366 days.
- Keyset pagination on descending `(lastChangedAt, id)`.
- Validate UUIDs, dates, cursors and enums.

```ts
type ChangeReadiness =
  | "ready"
  | "building_baseline"
  | "insufficient_history"
  | "recording_gap"
  | "data_quality_blocked";

type ChangeCaseStatus = "active" | "resolved";

type NodeOutcome = "changed" | "unchanged" | "blocked" | "skipped";

type RunReason =
  | "source_change"
  | "clock"
  | "initialization"
  | "reconciliation"
  | "model_upgrade"
  | "settings_change";

type CaseResolution =
  | "returned_to_usual"
  | "no_longer_detected"
  | "no_longer_assessable"
  | "direction_reversed"
  | "stock_normal"
  | "product_archived";
```

Responses include:

- stable IDs and the model version;
- the observation period and `asOf`;
- the merchant timezone;
- source coverage and provenance;
- values with units;
- freshness;
- structured explanation facts and stable reason codes.

Bigint revisions and money are serialized as strings. Scheduled, processing, failed, recording-gap and
no-material-change outcomes must be distinguishable.

Security:

- Use existing JWT protection and owner resolution. Non-owner members get 404.
- Every query is scoped by the authenticated merchant. Another merchant's case, run or product returns 404.
- Never accept a client-supplied merchant ID for tenant selection.
- Keep the private/no-store cache headers.
- Add explicit portal proxy allowlist patterns.
- Sanitize error messages shown to merchants.
- No public seed, threshold or cadence endpoints.

Extend `MerchantInsight` with optional `modelVersion` and `changeCaseId` so Deep
Analytics can link to Changes.

---

## 8. Worker, operations and rollout

### Scheduling

A dedicated Changes worker mode with its own durable queue and Cloud Run job.
Scheduler: `0 * * * *`, UTC. Each execution:

1. Enqueues due daily clock evaluations.
2. Processes merchants until the execution budget is nearly exhausted.
3. Leaves remaining work durable.
4. Logs a structured summary.
5. Exits non-zero on processing failures.

Reuse the current database configuration with a low pool limit.

### Operator commands (CLI, engineers only)

- Process one merchant now.
- Retry failed work.
- Rebuild after a model upgrade.
- Export evaluation evidence, including the §2.3 backtest replay.
- Seed or reset a sample account.

### "Update now" (staff only)

**Purpose:** when a merchant reports a stale warning, for example "I restocked
but it still says low stock", staff can process that merchant once,
immediately, instead of waiting for the next hourly run. This replaces the
fast sessions from revision 2.1.

**Access:**

- Only users with an active `staff_permissions` row of permission
  `change_intelligence_operator`. Use the existing `staff_permissions` table and
  the `requireStaff` pattern in `credit-access.service.ts`.
- **Migration needed:** `staff_permissions` currently has `user_id` as its
  primary key, so a user can hold only one permission. Change the key to
  `(user_id, permission)` so one person can be both `credit_analyst` and
  `change_intelligence_operator`. Existing rows are unaffected, and the credit
  `requireStaff` check already filters by permission.
- Merchants, including owners, cannot use it. The merchant API and UI are unchanged.
- Each use writes an `audit_logs` row with entity type `change_update_now`,
  including the staff user, the merchant and the reason.

**Staff API**, under the existing `/staff` prefix with JWT and the permission check:

| Endpoint | Purpose |
|---|---|
| `GET /staff/changes/merchants?q=` | Merchants with Change Intelligence enabled. Each entry has the business name, owner email, public ID, last successful update and processing status. `q` matches business name or owner email, case-insensitive. Up to 50 results. |
| `POST /staff/changes/update-now` | `{ merchantId, reason (required, ≤ 200 chars) }`. `merchantId` comes from the picker. Returns `queued`, or `already_running` if that merchant is being processed. |

This follows the existing `GET /staff/credit-assessments/merchants` pattern.

**Staff portal:** a page in the existing `apps/portal/app/staff` area.

- **Merchant picker:** a searchable dropdown. Staff type part of a business name
  or owner email, and each option shows "Aci Café — owner@example.com". Staff
  never type a UUID.
- The selected merchant's last update time and status.
- A reason field and an "Update now" button.
- The page is hidden without the permission. Add the patterns to the staff proxy allowlist.

**How it runs:**

1. The request marks that merchant's work as due now.
2. It then starts one execution of the Changes Cloud Run job through the Cloud Run
   Admin REST API, using the API service's own identity. Grant that identity
   permission to run only this job. No new SDK is needed.
3. The job processes due work and exits, exactly like an hourly run.
4. Locally, engineers use the "process one merchant now" CLI command.

**Limits:**

- Only enabled merchants: the feature flag and allowlist still apply.
- At most one execution started per merchant per minute. Repeat requests return
  `already_running`.
- It shares the normal lease, so it never overlaps the hourly run.

**Rules:** it bypasses no rule. Sales-trend changes still need their history and
confirmation days. Only stock, reservation, threshold, archive and correction
changes update sooner.

### Sample data

Extend the existing `apps/api/scripts/seed-local-overview-demo.mjs`. Do not build a
new seeder.

- `--demand-shift "<sku>:<multiplier>:<fromDaysAgo>"`: deterministic sustained
  shift for one product, used for the demand-change acceptance scenario.
- `--mark-sample`: sets `merchants.data_provenance='sample'`. The seeder refuses to
  add history to a merchant that is `ordinary` unless `--mark-sample` is passed,
  and refuses `--mark-sample` on a merchant with any `live` digital sale.
- Catch-up runs already fill the days since the previous run. That closes the
  current 26/28 Sep → today gap.
- Change Intelligence acceptance uses `--digital-share 0`, cash only, so no
  payments are made.
- Use a dedicated sample merchant for the shift scenario. The two existing
  accounts keep their natural history.
- Hosted runs need `--allow-host`/`--allow-db-host` **and Fred's explicit
  approval**. Seeded hosted history is removed before launch, per
  `docs/go-live-checklist.md`.

### Feature configuration

- `MERCHANT_CHANGE_INTELLIGENCE_ENABLED`
- `MERCHANT_CHANGE_INTELLIGENCE_ALLOWLIST`
- `MERCHANT_CHANGE_INTELLIGENCE_SETTINGS` (optional JSON overrides, §5.11)
- `CHANGE_INTELLIGENCE_JOB_NAME` (the Cloud Run job that "Update now" starts)

The worker and the read APIs use the same availability check. The UI reads it through the status API.

### Monitoring

Capture:

- queue depth and age of the oldest item;
- failed merchants;
- capture lag;
- run duration;
- events, products and nodes processed;
- evaluated, changed and skipped nodes;
- retries and lease losses;
- readiness counts by state;
- last successful execution;
- model version and run ID.

Alert when:

- there has been no successful scheduled run for 75 minutes;
- eligible pending work is older than 75 minutes;
- a merchant has exhausted its retries;
- lease or serialization failures repeat;
- the backlog keeps growing;
- a daily evaluation is missed for a merchant more than 2 hours after its local midnight.

### Retention

- Unprocessed events are kept until processed or explicitly resolved.
- Processed event detail: 90 days.
- Runs, transitions and resolved cases: 12 months.
- Current states and active cases are always kept.
- Transitions keep their evidence facts after events are cleaned up.
- Use bounded maintenance operations with configurable retention values.

### Initial allowlist

Change Intelligence is enabled for both existing merchants (Fred's decision,
2026-10-25). Their owners see Analytics → Changes once the feature is released.
They get no staff powers.

```yaml
MERCHANT_CHANGE_INTELLIGENCE_ENABLED: "true"
MERCHANT_CHANGE_INTELLIGENCE_ALLOWLIST: "mrc_7226ebf0b0b84c81b775,mrc_88d1fb39ebb04b24bb42"
```

| Public ID | Merchant |
|---|---|
| `mrc_7226ebf0b0b84c81b775` | MCBuse |
| `mrc_88d1fb39ebb04b24bb42` | Aci Café |

Public IDs are used because the existing allowlist pattern accepts them and they
are not database keys. The values go into `deploy/cloud-run/api.env.yaml` and the
Changes job environment in Stage 8, and they ship only with Fred's approval of
that release. Until then, local and test environments set the same values.

### Release and rollback

- Append migrations; never rewrite applied ones. Verify fresh and upgraded databases.
- Apply server-only permissions to every new table.
- Create indexes before enabling capture.
- Bootstrap merchants before switching Deep Analytics authority.
- Roll out to the allowlist first.
- Rollback disables new processing and restores legacy reads; records are kept.
- Capture can be disabled independently. A capture gap requires a reconciliation run before freshness is restored.
- **No production deploy without Fred's explicit approval of that release.**

---

## 9. Verification and acceptance

### 9.1 Pure engine

1. Stable baseline → no case.
2. Sustained +50% unit increase (§5.10 numbers) → qualifies day 1, confirmed day 2.
3. Small fluctuations (|z| < 2.5) → no case.
4. High baseline variance: s² > E, so the denominator uses s².
5. E < 5 → `insufficient_history`. E = 0 never divides.
6. Transactions rise while units stay flat → transaction case only. Forecast unchanged.
7. Stock-only propagation → demand calculators not invoked.
8. Threshold-only propagation.
9. Restock resolves stock risk; the demand case stays open.
10. An unchanged intermediate node stops propagation.
11. A change to product A leaves product B's versions and fingerprints unchanged at a fixed clock.
12. The merchant summary updates.
13. Re-running the same local day does not advance confirmation.
14. Recovery (|z| < 1 twice), expiry (7 days), readiness loss (14 days) and reversal.
15. Zero demand, zero stock and negative availability.
16. Void and reassignment affect the correct products, producing `historical_correction`.
17. Clock-only daily rollover.
18. Recording gap: zero merchant sales in the recent week → no decrease cases and forecasts suppressed. Low-stock cases remain.
19. Past recording gap in a baseline week → `building_baseline`, no false increase.
20. Single-day spike (a catering order) → rejected by the spike guard.
21. `Europe/Berlin` 2026-10-25 (25 h) and 2026-03-29 (23 h) local days; `Africa/Accra` ordinary days.
22. Invalid dependency registries.
23. The exact §5.10 arithmetic.
24. Risk ordering: out of stock is shown even when the forecast is unavailable.
25. Settings: defaults, partial JSON override, and rejection of unknown keys and out-of-range values.
26. Baseline weeks: 27 days of history → `building_baseline`; 28–34 days → 3 weeks; ≥ 35 days → 4 weeks; the explanation reports the count.
27. A settings change produces a different fingerprint and a `settings_change` run. Old cases keep the settings that created them.

### 9.2 PostgreSQL integration

Use an explicitly supplied isolated test database. Prove:

- source/event atomicity;
- complete committed parent/child observations, with digital lines resolved through `payment_request_id`;
- event coalescing without lost products;
- uncommitted events are invisible;
- concurrent commits are not skipped;
- no partial publication after a crash;
- idempotent retry;
- only a valid lease can publish, and stale workers are rejected;
- later events remain pending;
- publication and completion are atomic;
- bootstrap and replay do not double-count;
- capture of imports, reservations, archives, voids, restocks and timezone changes;
- invoice-item inserts on unpaid requests produce no events;
- tenant isolation and owner-only access;
- safe retention;
- explicit model-upgrade history;
- "Update now":
  - the merchant picker searches by name and by email, lists only enabled merchants, and is 403 without the permission;
  - a user can hold both `credit_analyst` and `change_intelligence_operator`;
  - 403 for staff without the permission;
  - 404 for merchants and merchant owners;
  - every use is audited;
  - `already_running` within a minute or during processing;
  - no overlap with the hourly run;
  - no change to confirmation timing.

### 9.3 Current-data acceptance

Run against a copy of the current database: a restored dump in an isolated
database, never the hosted one.

**At today's clock (`asOf` = 2026-10-25):**

- Both merchants show `recording_gap` with their last sale date (26 Sep / 28 Sep).
- No demand cases. Forecasts are unavailable with reason `no_recent_activity`.
- Six low-stock cases are labelled "Identified during initial analysis": Butter
  croissant, Ham and cheese sandwich and Sourdough loaf on each merchant.
- Coffee Candy shows `insufficient_history`.
- The UI shows the recording-gap state, not "No changes".

**At a fixed `asOf` = 2026-09-29 01:00 Europe/Berlin (replay):**

- Merchant `424d…`: detection is `ready` for all 10 products, and forecasts are ready.
- Merchant `dfdf…`: detection is `ready` using **3** baseline weeks (33 days
  of history, 27 Aug – 28 Sep), and the explanation says so. Forecasts are ready for
  all products except Coffee Candy.
- With `baselineWeeksMin` overridden to 4, merchant `dfdf…` becomes
  `building_baseline` with "2 more days needed". This proves the setting is applied.

**Backtest replay:** the evaluation export's TypeScript run of 5 Aug – 28 Sep for
`424d…` must reproduce the §2.3 qualifying-evaluation counts. Confirmed-case
counts are reported, with their list, because the TypeScript run models
recovery and expiry, which the reference script does not.

**After a catch-up seed** of a dedicated sample merchant with
`--demand-shift "<Cappuccino sku>:1.5:14"`:

- The Changes page shows a confirmed increase with before/after cover.
- "Review stock" opens that product, and a restock resolves the stock risk while the
  demand case stays open.

### 9.4 Production UI acceptance

**Functionality:**

- all three Analytics destinations and the legacy redirects work;
- direct links and refreshes work;
- URL filters and pagination are preserved;
- before/after figures match saved backend values;
- Deep Analytics and Changes agree;
- inventory actions open the correct product, including one outside the loaded page;
- background updates preserve filters and scroll position.

**State coverage:** loading, empty, filtered-empty, building-baseline,
insufficient-history, recording-gap, pending, processing, delayed, failed,
offline, archived-product and sample-account states.

**Accessibility and responsiveness:**

- keyboard navigation and visible focus;
- accessible names;
- correct heading hierarchy;
- focus restoration;
- status announcements;
- reduced motion;
- 375/768/1280 px layouts;
- no clipping;
- no horizontal page scroll;
- meaning that does not depend on colour.

**Production appearance:**

- no demo, PoC or presentation wording or controls;
- no raw identifiers or diagnostics;
- no hard-coded results;
- no fake progress;
- existing portal components;
- discreet, truthful provenance.

Screenshots of success and non-success states supplement the interaction tests;
they do not replace them.

### 9.5 Real end-to-end path

A separate Playwright configuration with the real API and isolated PostgreSQL:

> Source mutation → durable event → worker → saved states → Changes page →
> inventory action → recalculated resolution.

Existing mocked browser tests remain for UI variations.

### 9.6 Performance gates

Fixture: 100,000 sales and 1,000 products. Extend the existing
`merchant-insights.load.ts`.

| Measure | Initial gate |
|---|---:|
| One-product incremental calculation | p95 ≤ 2 s |
| Stock-only propagation | p95 ≤ 500 ms |
| Daily clock evaluation, 1,000 products | ≤ 30 s |
| Full initialization | ≤ 120 s |
| Source-write p95 regression | ≤ 10% |
| Hourly source-to-visible latency, stock changes | ≤ 65 min |
| "Update now" stock/threshold change to visible | ≤ 2 min, including job start-up |
| Demand case visible after the second qualifying local day | by 02:05 local time |

Measure startup and scheduling separately from calculation. Record hardware,
database size, concurrency, sample counts and cold/warm conditions. These are
proposed gates, not existing claims.

### 9.7 Evaluation report

JSON and Markdown containing:

- labelled detection outcomes on injected-shift fixtures, with a confusion matrix;
- the false-positive count on unshifted data;
- the §2.3 backtest replay;
- expected vs actual affected-node sets;
- propagation and selective-update consistency;
- latency;
- arithmetic correctness;
- 7-day forecast WAPE;
- explanation completeness;
- UI acceptance results.

Generated fixtures prove mechanical correctness. They do not establish real-world
predictive accuracy.

---

## 10. Implementation sequence

Complete the stages in order. A stage is not complete because its files exist.

| Stage | Work | Exit gate |
|---|---|---|
| 0 — Contract and checklist | Recheck the repo; write `docs/plans/change-intelligence-checklist.md` mapping every requirement to work and evidence; record differences from §2.1; shared contract skeletons; named test scenarios | Every requirement mapped; no hidden product decisions |
| 1 — Pure engine | Registry, schemas, settings and validation, topological execution, fingerprints, clock/timezone, readiness, detection, confirmation, forecasts | All §9.1 tests pass; §5.10 exact |
| 2 — Schema and capture | Migrations, permissions, indexes, `data_provenance`, durable work, §4.2 triggers | Migration and capture tests pass; source-write overhead measured |
| 3 — Worker and persistence | Loaders, bootstrap, leases, atomic publication, retries, daily clock work, reconciliation, states, transitions, cases | Real-database concurrency, failure and correction tests pass |
| 4 — API and compatibility | Routes, DTOs, owner scoping, pagination, product-by-id, proxy allowlist, Deep Analytics adapter and legacy suppression | Contract/security tests pass; one forecast authority |
| 5 — Production merchant UI | Shared nav, list and detail, filters, explanations, inventory deep link, polling, accessibility, every §3.8 state | §9.4 passes |
| 6 — Operations and fixtures | Worker job, monitoring, operator commands, staff "Update now" (permission, API, staff portal button, audit, job trigger), seeder extensions, retention, evaluation export | Protections work; only permitted staff can use "Update now"; seeder refuses ordinary merchants |
| 7 — Full verification | §9.3 current-data acceptance, §9.5 E2E, benchmarks, regressions, backup/restore, rollback, requirement-to-evidence matrix | Every requirement verified, failed or explicitly blocked; local, mocked and hosted evidence kept separate |
| 8 — Controlled release | **After Fred approves:** deploy schema/capture, enable the initial allowlist (MCBuse, Aci Café), bootstrap, switch reads, verify scheduling and hosted E2E | Hosted operation passes core acceptance and monitoring |

### Final implementation report

- files changed and migrations added;
- test and benchmark results;
- the UI checklist with screenshots;
- local versus hosted evidence;
- configuration and operational commands;
- remaining failures and limitations;
- links to the acceptance report and runbook.

### Mandatory instructions for the implementing agent

- Build the durable engine before polishing explanations.
- Build a finished merchant interface, not a demonstration dashboard.
- Do not hard-code scenario outcomes into the API or UI.
- Do not replace selective propagation with full recalculation and claim equivalence.
- Do not infer units from transaction counts.
- Do not use an LLM to choose numerical results.
- Do not treat missing history or a recording gap as a healthy baseline or as a decline.
- Do not publish partially updated state.
- Do not mix generated records into ordinary merchant accounts.
- Do not expose raw infrastructure diagnostics in the merchant interface.
- Do not use visual polish to hide missing functionality or failure states.
- Keep payment, supplier and task-management expansion outside this scope.
- Follow `.agents/skills/` for TDD and commit checks.
- Continue through the verification gates and report failures honestly.
- If the repository changes materially, reconcile this contract before making incompatible changes.

**The completed feature must be reliable on actual merchant records, clear
enough for everyday use and fully integrated into the production portal.**
