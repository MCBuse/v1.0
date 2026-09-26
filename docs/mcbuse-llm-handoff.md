# MCBuse Product and Engineering Hand-off

**Audience:** An LLM or engineer starting work in this repository without the conversation history

**Repository snapshot checked:** 2026-09-26, Africa/Accra

**Purpose:** Preserve product intent, engineering context, evidence boundaries, and the active merchant-demo specification in one place.

> Treat this as an orientation and decision record, not proof that every described capability is currently deployed. Recheck the working tree, code, environment, and dated evidence before changing or making claims about the product.

## Start here

Before acting:

1. Read the repository [AGENTS.md](../AGENTS.md).
2. Run `git status --short`, inspect the relevant diffs, and confirm the current branch and commit. This document records only a dated snapshot.
3. Classify statements as **user/stakeholder direction**, **present in code**, **verified in a dated environment**, **proposed**, or **unknown**. Never treat one category as another.
4. Check that the latest user request still authorizes the proposed work. This hand-off records the merchant UI requirements; it does not authorize deploying, seeding production data, changing credit policy, or exposing staff-only results.

## 1. Product direction and success

### What MCBuse is

MCBuse is a **merchant data and financial intelligence company**. Its near-term product captures fragmented activity from under-documented, small merchants and turns the available records into understandable analytics and portable evidence. Payments and stablecoins are a data-generation wedge, not the whole company identity.

The merchant should gain:

- A clearer, source-aware record of business activity.
- Useful views of recorded sales and inventory activity.
- An honest picture of what information is available or missing for an assessment.
- A portable assessment/evidence PDF the merchant can download or share.

Authorized financial institutions may use merchant-authorized evidence as an input to their own process. MCBuse does not approve loans or replace a lender's assessment, policy, or decision.

### Product horizons

- **Immediate wedge:** demonstrate merchant activity capture, trustworthy records, useful analytics, explainable assessment evidence, and merchant-controlled sharing.
- **Longer-term opportunity:** provide authorized institutions with better, consented merchant data and intelligence; potentially become distribution and payments infrastructure for approved stablecoin issuers.
- The longer-term institutional and issuer platform is strategy, not a claim that those capabilities are already shipped. Keep marketplace, multi-issuer onboarding, foreign-exchange/liquidity routing, and jurisdiction-dependent settlement outside a bounded demo unless separately approved.

### Demo success

The stakeholder target is a sharp walkthrough of about three minutes. The presenter should move through the merchant's activity capture, analytics, credit assessment, and Finance Match sharing without explaining irrelevant controls or unavailable metrics. Reuse real, meaningful data where it exists. Every displayed number and score must be traceable to its source and period.

The fuller Colosseum build scope describes a real USDC payment on Solana devnet becoming a verified merchant record, analytics, readiness evidence, and a shareable proof. Read its [hackathon scope](colosseum-hackathon-scope.md) for that larger submission narrative; the more recent merchant UI direction below governs how the portal should be presented.

## 2. Stakeholder-approved merchant demo specification

The recent meeting clarified that the requested changes are primarily about organizing and presenting existing merchant capabilities. The meeting transcript was attached outside the repository at `/Users/fred/.codex/attachments/5684352c-1918-458a-9546-921db033904e/Pasted text.txt`; the key decisions are reproduced here so this file remains useful without that attachment. Kabe's later Payment message adds Part VII. If a newer direct user instruction changes one of these details, follow the newer instruction and update this document.

### Primary navigation

Order the merchant menu as:

1. Overview
2. Inventory
3. Payment
4. Analytics
5. Credit Assessment
6. Finance Match

### Overview

Present four clearly labelled, visually distinct, clickable summary blocks:

- **Payment:** useful current payment/sales summary already supported by the product.
- **Analytics:** a meaningful available analytics summary.
- **Credit Assessment:** most recent result/profile and additional information only where present.
- **Finance Match:** most recent saved PDF or sharing activity where present.

Keep the page concise and make each block an obvious route into its pillar. Remove the Business Insights panel from the demo Overview and avoid duplicating the full detail pages there. Do not invent a summary metric to fill a block.

### Inventory

Keep the merchant-facing capture story focused on:

- Manual Inventory.
- Imported Inventory (spreadsheet import, such as supported Excel/CSV files).

Remove Inventory Analytics from the Inventory page; inventory analysis belongs in Analytics. Product operations that already exist need not be expanded for the demo. Inventory is analytics evidence, not collateral.

### Analytics

Under **General Analytics**, provide actual tabs (not links that only scroll down the page) for:

- Transaction Analytics.
- Inventory Analytics.
- Combined Transaction and Inventory Analytics.

Keep **Deep Analytics** as a separate destination only to the extent that its outputs can be demonstrated clearly. Remove text-only or “Unavailable” clutter from the demo path; do not conceal real data limitations by fabricating results.

### Credit Assessment

The intended merchant flow is one action and one form:

1. **Run credit assessment** opens a popup/drawer form.
2. Its first section shows the merchant-specific parameters computed by George's system from available business activity. These are the derived assessment inputs, not a raw list of all transactions.
3. Its second section collects merchant-entered **Additional Information**, including collateral and other relevant business/owner declarations. Use the information currently collected in the Business Profile/Content flow where appropriate.
4. One **Run assessment** action saves the result and creates its PDF.
5. The result/PDF presents the available financial profile/score, profile details, and Additional Information. Missing required inputs remain explicitly missing; never impute them or show a misleading score.
6. Show approximately the latest ten saved assessment PDFs/runs.

Remove the visible **Business Profile and Consent** and **Reconciliation** tabs from the merchant-facing assessment navigation. This is a presentation decision: preserve the consent, revocation, audit, and authorization controls required by the backend and applicable policy. Present required consent unobtrusively in the assessment flow if needed.

The user direction is to use the current George assessment for the demo. The implemented public merchant result described in the repo is a **0–100 financial profile score**, available only when required inputs exist. George's **300–850 experimental credit risk score and default probability are staff-only** and must not appear in the merchant UI, merchant history, PDF, or Finance Match package. See [credit assessment pilot boundaries](credit-assessment-pilot.md).

### Finance Match

Make the page a simple list of roughly the ten latest saved assessment PDFs, each with **Download** and **Email** actions. Keep recipient confirmation inside the email action. Remove the separate reporting-period selector, package preparation/generation, and preview workflow from the main demo page. The assessment PDF is created as part of the assessment flow and then shared here.

Do not state that an email reached an inbox based only on SMTP acceptance. Report the actual delivery evidence available.

### Payment

Organize Payment into **four** clearly separated outer blocks. The original note said “five,” but named four after asking to delete End of Day; the user confirmed that four is intended.

1. **Accounts**
   - Holding Account: Add money, Move money, Withdraw money.
   - Routine Account: Move money.
2. **Process Payments**
   - Digital Payment.
   - Itemized Invoices.
   - Cash Payment.
3. **Today's Payment Activity**
   - Processed Payments: Digital Receipts and Cash Payments.
   - Money Movement Status.
   - On the Counter.
   - Payment Request Status (Fast Payment Requests).
4. **Transactions Data**
   - Transactions.
   - Receipts.

   Update 2026-09-26 (Frederick): Transactions and Receipts are record views, not a workflow step, so they now sit as two secondary buttons in the Payment page header (top right) instead of a fourth block at the bottom. The page therefore has three framed blocks.

Distinguish each block with a clear, consistent border/demarcation, as on Overview. Delete the **End of Day** block: processed payments already cover that activity and money can be moved under Accounts.

## 3. Trust, evidence, analytics, and credit rules

### Evidence provenance

Keep source, verification, and environment separate in UI, APIs, exports, and explanations:

- Finalized live-chain payment: verified activity when chain and application evidence support it.
- Devnet/test payment: test activity, not a real merchant sale.
- Cash sale: merchant-recorded/declaration, not independently verified digital settlement.
- Imported data: imported evidence with its source and import context.
- Synthetic fixture: demonstration data; label it and isolate it from production merchant data.
- Unknown historical source/environment: retain as unknown. Do not infer or relabel it.

Analytics and activity lists include every record regardless of environment (decision by Frederick, 2026-09-26): the former "Records"/environment filter was removed from the API and portal. Environment stays visible as a per-record provenance label; only the filter is gone. The Digital/Cash source filter remains.

Do not add synthetic transactions to production to improve a demo, and do not wipe or reset existing data to make room for demo fixtures. Prefer verified records from an approved demo account. If those are inadequate, use an isolated, clearly labelled demo environment or present the data limitation honestly.

### Analytics claims

Analytics describe recorded activity. They do not establish complete turnover, profit, expenses, purchasing costs, affordability, full cash flow, or causation unless the needed inputs are actually collected and verified. Forecasts, anomalies, and replenishment suggestions are operational signals, not facts about future performance. Read [merchant analytics boundaries](merchant-analytics-intelligence.md) before changing calculations or copy.

Deterministic calculations are authoritative for totals and evidence. AI narration may explain available calculations; it must not invent facts, imply causation, or conceal freshness/data-quality limits.

### Credit and sharing

- `readiness-rules-v1` is evidence completeness/readiness, not a score or lending decision.
- George's serving model may return a 0–100 financial profile only with its required fields. Missing inputs stay null/unavailable and are named.
- The 300–850 experimental risk output is staff-only, uses synthetic training data, and lacks real repayment/default validation. Never expose it to merchants or lenders through exports.
- **Cash sales count in the credit model's sales inputs** (decision by Frederick, 2026-09-26): days with sales, number of sales, average sale, sale-size variability, total sales and sales trend use live EUR MCBuse payments plus merchant-recorded cash (voided cash excluded). Their provenance says so (`mcbuse_live_payments_and_merchant_cash` / `merchant_recorded_cash`) and cash stays described as merchant-recorded, not independently verified. Test/devnet/synthetic payments and imported batches remain excluded; payment-reliability inputs (exception rate, capture quality, finality) and the `readiness-rules-v1` checklist still count MCBuse payments only. Model input names are unchanged (scoring contract).
- Consent does not prove the evidence is accurate; confidence does not prove repayment ability.
- Merchant assessment and finance artifacts should remain tied to the assessment and its dated input snapshot. Do not silently regenerate or change an older assessment when business information changes.
- Avoid sensitive raw inputs in logs. Preserve server-side access checks, consent status/revocation behavior, and audit evidence when changing presentation.

## 4. Engineering map

This is a pnpm/Turborepo monorepo:

| Area | Main technology | Responsibility |
| --- | --- | --- |
| `apps/api/` | NestJS, TypeScript, Drizzle, PostgreSQL | Authentication, merchant records, payments, wallet/ledger operations, data capture, assessment orchestration, finance artifacts, authorization. |
| `apps/portal/` | Next.js, React, TypeScript, Tailwind | Merchant and staff web experience; API calls go through server-side route handlers. |
| `apps/mobile/` | Expo, React Native | Consumer wallet/payment application and mobile payment surfaces. |
| `apps/credit-scoring/` | Python scoring service | George model evaluation; private service called by the API, never directly by the browser. |
| `packages/shared/`, `packages/ui/` | TypeScript/React | Cross-app contracts/types and shared UI primitives. |

### Domain boundaries and flow

- The custodial wallet ledger records asset movement. Merchant activity has a separate data-capture domain with merchant ownership, evidence source, environment, status, and provenance. Do not use wallet balances as a substitute for merchant sales history.
- Merchant activity can include finalized MCBuse payments and clearly distinguished merchant-recorded cash/imported records. The API normalizes and scopes records; the portal presents them; analytics computes derived views; the assessment service snapshots available inputs and result; Finance Match serves the saved PDF and email operation.
- NestJS owns authentication, authorization, merchant consent, evidence selection, persistence, snapshots, and exports. The private Python service evaluates the model. Browser clients must not call the scoring service directly.
- Amounts are handled with explicit currency and integer minor-unit representations at application boundaries; do not introduce floating-point monetary arithmetic.
- Keep detailed transaction/personal information off-chain. The product's on-chain story concerns payment verification and minimal integrity evidence, not public merchant records.

### Development and deployment entry points

From the repository root:

- `pnpm dev` starts workspace applications.
- `pnpm build`, `pnpm check-types`, and `pnpm lint` are root workspace checks.
- `pnpm --filter api start:dev` starts the API.
- `pnpm --filter portal dev` starts the portal on port 3001.
- API and portal deploy independently through the documented Cloud Run scripts. The scoring service has its own private Cloud Run deployment path.

Read the root [README](../README.md), [portal runtime/deployment notes](../apps/portal/README.md), [API deployment guide](cloud-run-api-deployment.md), and relevant subsystem guides before changing setup or release behavior. Never copy credentials, tokens, private keys, raw secrets, or production data into this hand-off.

## 5. Repository and evidence state at hand-off

### Local worktree snapshot

At inspection on 2026-09-26, the checkout was on branch `main` at `f158a45`, matching `origin/main`. **26 tracked files were already modified before this hand-off document was created**: six API files, eighteen portal files/tests, one credit-pilot document, and one shared type file. The changes span assessment, finance, inventory, navigation, Overview, Analytics, and their tests.

Those pre-existing changes have not been verified as a complete implementation of the latest stakeholder flow. They are not a claim of acceptance or deployment. The receiving LLM must re-read the live `git status` and diffs, preserve unrelated user changes, and avoid assuming this snapshot is still current. This document itself is a new file added after that 26-file count.

### Historical hosted evidence

The repository contains useful, dated evidence. It does not prove the live system remains in that state on the hand-off date:

- [Merchant workspace MVP hand-off](merchant-workspace-mvp-handoff.md) records a merchant portal/API hosted release and acceptance evidence from 2026-09-17.
- [Credit pilot hosted verification](reviews/credit-pilot-hosted-verification-2026-09-21.json) records API, portal, and private Python-service revisions and checks from 2026-09-21.
- [Finance package hosted acceptance](reviews/merchant-finance-hosted-acceptance-2026-09-21.json) records a saved PDF/ZIP and SMTP/inbox evidence from 2026-09-21. Its notes distinguish SMTP acceptance from verified attachment hashes.
- [Analytics intelligence guide](merchant-analytics-intelligence.md) records a 2026-09-19 hosted pilot and its feature-flag boundaries.

Some older hand-offs describe different branches or report that no release had occurred. In particular, [the revised merchant plan hand-off](revised-merchant-plan-handoff.md) is a dated snapshot from a separate workstream. Use its technical findings where relevant, but resolve deployment status from the newest verifiable artifact and a fresh live check—not by copying its old summary.

### Current demo task status (updated 2026-09-26, `5df213a`)

All §2 pages are implemented in code: navigation order, Overview, Inventory, Analytics, Credit Assessment, Finance Match and Payment. Notable implementation choices:

- **Analytics:** `/analytics` opens General Analytics (real tabs, `?tab=inventory|combined`); Deep analytics is `/analytics/deep` (business insights plus weekday patterns only). Shared shadcn-style filter bar: period, group by, source.
- **Credit Assessment:** one "Run credit assessment" drawer: (1) activity-derived inputs, read-only, from `GET merchants/me/credit-inputs` over the same 90-day window as a run; (2) Additional information; (3) inline consent plus one "Run assessment" that saves declarations, runs, and creates the PDF. A status colour language (green available, amber you can add, blue builds with sales, grey not measured) is used on the latest-assessment view and the drawer.
- **Finance Match:** latest PDF first (Email to a lender · View PDF · Download), earlier PDFs and sent emails as history tabs; no period selector or preview workflow. Email status never claims inbox delivery.
- **Evidence PDF:** redesigned for human readers (`apps/api/src/data-capture/finance-report-pdf.ts`). Stored PDFs are immutable, so only new ones use the new layout.
- **Labels:** plain-language labels live in `packages/shared/src/credit-labels.ts` for the portal. The API keeps a runtime copy (`apps/api/src/credit-assessment/credit-labels.ts`) because `@repo/shared` has no build step and may only be imported for *types* by the API; a parity test guards the copy.

Not yet done:

- **Browser tests:** the Playwright suite has not been run against these changes.
- **Integration tests:** database-backed API integration specs (including the new cash-inputs case) have not been run.
- **Deployment:** nothing is deployed. The portal and API must be released together, because the API now rejects the removed `environment` query parameter.

Open decisions:

- Should the readiness checklist count cash sales?
- Should the Payment capture-quality tile stay on the Overview?
- Should "Sale lines without a product" move to General Analytics' Inventory tab?
- Should the staff pilot's consent requirement be dropped on the backend?

## 6. How to continue safely and effectively

1. Confirm the latest user request and inspect repository status before touching code.
2. Use the meeting/UI specification above for merchant-demo intent; use current code to determine actual behavior; use dated reports only for the exact checks they document.
3. Prefer focused presentation changes that reuse real existing data over expanding product scope for a three-minute demo.
4. Keep score semantics, consent, authorization, provenance, idempotency, auditability, and immutable assessment snapshots intact while changing UI flow.
5. If demo evidence is missing, explain what is missing or use an isolated labelled fixture. Never claim a synthetic, mock, or devnet event is a live merchant sale.
6. Before reporting a release, verify build and relevant acceptance flows against the intended environment, then record the exact revision, timestamp, and evidence. A local build, API response, SMTP acceptance, or code diff alone does not prove hosted user success.

### Useful verification commands

Choose focused commands for the changed subsystem and environment; do not run destructive cleanup commands against real or shared data.

```sh
pnpm --filter api build
pnpm --filter portal check-types
pnpm --filter portal test
pnpm --filter portal test:e2e
pnpm --filter api exec jest --runInBand --watchman=false
git diff --check
```

The commands are options, not evidence that they have been run for the current worktree. The user’s current request determines whether implementation or test execution is authorized.

## 7. Source guide

- [Repository setup and architecture](../README.md)
- [Repository agent instructions](../AGENTS.md)
- [Colosseum build scope and broader demo story](colosseum-hackathon-scope.md)
- [Plain-language Colosseum product brief](colosseum-hackathon-non-technical-brief.md)
- [Merchant workspace capabilities and dated acceptance](merchant-workspace-mvp-handoff.md)
- [Credit model, consent, input, and access boundaries](credit-assessment-pilot.md)
- [Analytics calculation and AI-narration boundaries](merchant-analytics-intelligence.md)
- [Cloud Run API deployment notes](cloud-run-api-deployment.md)
- [Dated credit and Finance Match hosted evidence](reviews/credit-pilot-hosted-verification-2026-09-21.json), [Finance Match acceptance](reviews/merchant-finance-hosted-acceptance-2026-09-21.json)

When these sources disagree, preserve their dates and scope. New user direction controls the requested product outcome; code controls what currently exists; direct dated verification controls only the environment and time it observed.
