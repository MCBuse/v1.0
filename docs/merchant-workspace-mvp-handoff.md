# Merchant Workspace MVP handoff

## Implemented workspace capabilities

- Primary navigation: Overview, Payment, Analytics, Credit Assessment, and Finance Match.
- The global Create request drawer supports both fast amount requests and
  itemised product/custom-line invoices, retaining the QR/status in the same
  workflow.
- Combined merchant activity: finalized MCBuse payments plus merchant-recorded cash sales.
- Cash-sale recording, historical sale time, stock-already-accounted-for option, audited void, and one private support document.
- CSV/XLSX inventory and settlement imports with preview, repeat-import protection, an explicit stock-snapshot choice, source mapping, and payout allocations.
- Product stock movements captured from the workspace upgrade onward, with 7/30-day product performance, source-aware digital/cash totals, and current stock.
- Transactions expose evidence source, verification status, and environment separately so merchant-entered, imported, live, test, synthetic, and unknown records are not conflated.
- Transactions and Analytics can filter the combined activity by evidence source and environment. The selected filters apply to totals, comparisons, trends, and product metrics.
- Overview's recent-activity panel uses that same combined activity feed, including merchant-recorded cash sales.
- Overview's headline sales and trend figures also use combined recorded activity; it separately shows payment exceptions, the active low-stock-product count, and the versioned evidence-readiness stage.
- Analytics groups 7/30-day ranges by day, 90-day ranges by week, and custom ranges over 180 days by month.
- Finance packages use the same period-scoped product-performance calculation as Analytics; a 90-day package cannot silently substitute 30-day product metrics.
- New MCBuse payment receipts persist the configured transfer environment: mock transfers are synthetic, devnet transfers are test, and mainnet transfers are live. Historical records remain `unknown`.
- Versioned `readiness-rules-v1` assessment, business profile/consent, payout reconciliation with distinct lifecycle/reconciliation states, PDF/ZIP packages, and SMTP package submission.
- Buyer receipt retrieval after finalization, including reopening a merchant receipt from the payment flow and Activity.

## Database migration

Apply the additive Drizzle migrations in sequence, after a verified database backup:

1. `0010_merchant_workspace_mvp.sql`
2. `0011_merchant_finance_packages.sql`
3. `0012_merchant_receipt_snapshot.sql`
4. `0013_merchant_stock_movements.sql`
5. `0014_merchant_cash_sale_attachments.sql`
6. `0015_merchant_finance_package_artifacts.sql`
7. `0016_cash_sale_idempotency_fingerprint.sql`
8. `0017_finance_package_idempotency.sql`
9. `0018_finance_email_idempotency.sql`
10. `0019_merchant_transaction_evidence_environment.sql`

`0013` creates a labelled opening balance for existing products at upgrade time. It does not claim to reconstruct historical stock movements.

## Required runtime configuration

Set these only as deployment secrets:

- `MERCHANT_EVIDENCE_BUCKET` — required private bucket for cash-sale support documents. The API refuses attachment operations when it is absent.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` — SMTP submission. `SMTP_FROM` must be an approved sender.

The SiteGround deployment defaults to `mail.mcbuse.com` over implicit TLS on
port 465, using `f.obeng-nyarko@mcbuse.com` as both authenticated mailbox and
sender. Only `SMTP_PASSWORD` remains a Secret Manager value; do not put it in
this file or Git.

The Cloud Run service account must have least-privilege read/write access to the private evidence bucket. Do not make evidence objects public.

Provision the bucket separately from catalogue media before the API release:

```bash
export MCBUSE_GCP_PROJECT_ID="mcbuse-hackathon-2026-fno"
bash scripts/cloud-run/provision-merchant-evidence.sh
```

## Validation completed locally

- `pnpm --filter api build`
- `pnpm --filter portal check-types`
- `pnpm --filter portal build`
- `pnpm --filter portal test` — 5 tests passed.
- `pnpm --filter api exec jest --runInBand --watchman=false` — 21 suites / 77 tests passed. Watchman is disabled for this command because the local watcher socket is intermittently inaccessible in this environment.
- `pnpm --filter portal test:e2e` — 72 local mock-API checks across mobile, tablet, and desktop passed after the combined Overview summary change.
- `pnpm --filter mobile exec tsc --noEmit`
- `git diff --check`

The package-script form `pnpm --filter api test -- --runInBand` is not valid in this repository because its script already invokes Jest and the extra separator makes Jest interpret `--runInBand` as a test-path pattern. Use the direct Jest command above.

Portal lint still reports three existing warnings in unrelated test scripts: `tests/capture-week2-mobile.mjs` and `tests/render-week2-cards.mjs`.

## Hosted release evidence — 17 September 2026

- Created a non-empty PostgreSQL 17 custom-format pre-migration backup in the
  ignored `backups/` directory, verified its SHA-256 checksum, and read its
  archive index before migration.
- Provisioned `mcbuse-hackathon-2026-fno-merchant-evidence` in `EUROPE-WEST1`
  with uniform bucket-level access and public-access prevention. Only the API
  runtime identity has application object-admin access.
- Cloud Run migration execution `mcbuse-api-migrate-tnptf` completed
  successfully before traffic changed.
- API image digest `sha256:76b446c0adc9dfda94023bc247234ea941d47d2afa074706c11c9f25156f20c1`
  is live as `mcbuse-api-00033-5xq` with 100% traffic. Its health endpoint and
  database report `ok`; unauthenticated `/merchants/me/activity` returns 401.
- Portal image digest `sha256:e0332220360c7521be8fc0e13662c80ba3e06bb838110459b094355f2aed8319`
  is live as `mcbuse-portal-00015-2dx` with 100% traffic. `/sign-in` returns
  200, while Overview, Payment, Analytics, Credit Assessment, and Finance
  Match redirect anonymous visitors to `/sign-in`.
- `merchant:hosted-infra-readiness` passed against the deployed API: database
  health, merchant portal flag, devnet/mock-transfer guardrails, Stripe test
  mode, webhook secret, and exactly one matching Cloud Run Stripe webhook all
  passed.
- SiteGround SMTP is configured on `mail.mcbuse.com:465` with implicit TLS. The
  mailbox password is a Secret Manager reference available only to the API
  runtime identity. One-off Cloud Run execution `mcbuse-smtp-verify-bx4ll`
  completed successfully and emitted `smtp_verify=ok`; it authenticated to SMTP
  without sending a message.
- Hosted finance-package acceptance run `51805dba9a7e4dc8` used a separately
  created demonstration merchant, generated immutable package
  `3b0ee65e-29cd-4ead-905a-8ff07efaf300`, downloaded its PDF and ZIP, and
  submitted one message to each of the three designated test recipients. All
  three delivery attempts are recorded as `accepted_by_smtp`; this confirms
  SiteGround SMTP acceptance, not recipient-inbox delivery. The package is
  explicitly labelled `Evidence incomplete` and `Demonstration data`.
- The acceptance PDF is a one-page A4 PDF (2,201 bytes; SHA-256
  `d8515eee07259e1f217a6559e0b42d50a1a988d36c7b7f6047d917c90b4b2a5c`) and
  was rendered and visually inspected for clipping and readable headings. Its
  ZIP is 3,712 bytes (SHA-256
  `4a272eabc6d6dfef5078ddc1508f9bdaec61bef6fbc91f08c295d8713883ca28`) and
  contains that PDF plus the expected sales, sale-items, summary, source,
  product, payout, allocation, and exception CSV tables.
- A subsequent package-only visual check of the live pagination revision
  generated package `e7d84913-1b7e-4067-9451-287e08b19941` (no email sent).
  Its one-page A4 PDF has the repeated package header and `Page 1 of 1` footer
  with no clipping or blank page.
- A 90-day package-only check generated package
  `9e595df1-6512-4829-8e6c-95deafa89c5f` (no email sent). Its PDF is one A4
  page (2,249 bytes; SHA-256
  `62ba89f9e96600ab0a1d35169b36568ad6399f61dea0574598af92d2703c0c43`), and
  its ZIP is 3,950 bytes (SHA-256
  `fb83ddd506c573d04a77fbf318b1e7d6c037010f8cc1d72024ed5bdc3ef65247`) with
  the PDF plus all eight expected CSV tables. The page was rendered and
  inspected; it is explicitly labelled as incomplete demonstration data.
- Migration execution `mcbuse-api-migrate-ssn72` applied the cash-sale input
  fingerprint successfully. A hosted synthetic replay check then proved that
  the same idempotency key returns its original sale only for equivalent input;
  changing the amount returns HTTP 409. No email was sent in that check.
- Migration execution `mcbuse-api-migrate-d4tjr` applied finance-package
  idempotency. The hosted check confirmed the same replay/conflict contract for
  a generated package: matching input returned the same package and changed
  input returned HTTP 409. No email was sent in that check.
- Migration execution `mcbuse-api-migrate-j7lnc` applied delivery-attempt
  input fingerprinting. The API now protects email idempotency by package,
  recipient, institution, and confirmation state; the SMTP acceptance run was
  not repeated to avoid an additional unsolicited message.
- Migration execution `mcbuse-api-migrate-8zp8m` applied immutable payment
  evidence-environment labelling. It adds the classification field with
  historical records explicitly set to `unknown`; future finalised payments
  record the active mock/devnet/mainnet environment.

## Synthetic fixture

`docs/fixtures/synthetic-inventory-export.csv` has six clearly labelled
demonstration products with stable external IDs, SKUs, EUR minor-unit prices,
stock levels, thresholds, and a snapshot timestamp. It has been structurally
checked for six unique IDs and six unique SKUs. It exercises import behaviour
only and is not evidence of a third-party inventory integration.

## Acceptance dependencies still required

These checks cannot be established from local code or fixtures:

1. An actual inventory export from a named external tool, including a repeated import and a resulting stock change after sale.
2. Settlement evidence with stable payout and payment references, or a written decision to demonstrate reconciliation as synthetic data.
3. Confirmation from a designated test inbox that the accepted SMTP message
   arrived with readable attachments. SMTP message acceptance is now verified,
   but it does not establish inbox delivery.
4. Separate merchant and payer test accounts plus devnet payment prerequisites for the mobile receipt flow.
5. Hosted verification using an authenticated merchant session for binary downloads and private attachment access.

## Current limits before release sign-off

- The local portal Playwright suite now records a passing result with no failed tests across its 72 mobile, tablet, and desktop browser checks. This is local mock-API evidence, not authenticated hosted-browser proof.
- The importer supports interactive mapping for supported CSV/XLSX columns. It still needs a real external-source acceptance file.
- No real source file, recipient-inbox receipt, authenticated portal browser flow, or hosted mobile payment/receipt has been verified yet.
