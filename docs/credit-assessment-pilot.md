# Credit assessment pilot implementation

The merchant portal contains business credit-profile declarations, separate pilot consent, evidence readiness, confidence, missing inputs and public financial-profile results. `/staff/credit-assessments` is a separately authorized staff workspace in the same Next.js app. Python computes scores; NestJS enforces who can see them.

## Data and access

Apply migration `0033_credit_assessment_pilot` before starting the updated API. It adds server-only credit profiles, staff permissions, pilot enrollments and staff assessment snapshots. Existing assessments and finance packages are retained unchanged. New merchant assessment JSON adds optional `credit` results and snapshots the declared profile and inputs. Experimental results live exclusively in `staff_credit_assessments`; that table is never queried by merchant history or finance exports.

Use existing registered user accounts. From `apps/api`:

```sh
pnpm credit:provision -- grant analyst@example.com
pnpm credit:provision -- revoke analyst@example.com
pnpm credit:provision -- enroll MERCHANT_UUID
pnpm credit:provision -- unenroll MERCHANT_UUID
```

Provisioning is operator-only. It cannot grant merchant consent. The merchant independently opts into `credit_pilot_assessment` version `2026-09-credit-pilot-v1` on Business profile. Staff reads, runs, history and detail require active permission and, for real merchants, active enrollment plus active pilot consent. Revocation blocks subsequent requests, including old assessment reads. Staff-only accounts do not need a wallet or merchant membership. Operations and staff access are audited without logging sensitive input values.

Public routes added beneath `/merchants/me`: GET/PATCH `credit-profile` (PATCH body `{data: ...}`) and GET/POST `credit-pilot-consent` (POST `{active: boolean}`). Private staff routes: GET `/staff/me`, GET `/staff/credit-assessments/merchants`, GET `/staff/credit-assessments/model`, GET/POST `/staff/credit-assessments`, and GET `/staff/credit-assessments/:id`. POST requires an idempotency key and exactly one `merchantId` or a supported `exampleId`. Synthetic history is the default; real history requires an explicitly selected authorized merchant.

## Evidence definitions

New readiness calculations use a rolling 90-day interval, and the exact from/to values are saved. Current unresolved critical exceptions remain readiness blockers even if raised before the window. Historical snapshots are not recalculated. A finance package can contain a selected older assessment and a different sales period; both periods are explicitly retained.

Credit financial inputs use only finalized, live-environment, EUR payments inside the interval. Cash declarations, imported records, synthetic/test/unknown-environment and non-EUR payments are disclosed separately and excluded from verified sales. Readiness describes all observed finalized payment records; the credit integrity summary identifies the stricter source subset used for financial inputs.

Sales and declared money remain integer cents in database/profile payloads. The Python adapter converts to EUR major units without whole-euro rounding; unsafe totals are unavailable. Average ticket is verified sales/count. Basket variation uses population standard deviation/mean. Active-day ratio uses merchant-local calendar dates from first qualifying transaction through the assessment date. Revenue trend is an ordinary least-squares slope of daily verified sales, including zero-sale days, divided by mean daily sales times 100; fewer than two days or a non-positive mean is unavailable. The rolling interval can touch partial local calendar days.

Exception rate counts distinct affected payment requests per payment attempt. Critical unresolved ratio is current open critical exceptions raised in the period divided by payment attempts in the period. Ratios above 100 or without a denominator are unavailable. Attempts lack environment classification, so mixed transaction environments suppress processing reliability metrics. Capture quality reuses the existing capture-quality calculation. Finality is finalized attempts/attempts. Debt-to-sales uses declared debt against verified sales and retains the declared provenance.

Historical capture-quality trend and payment retry success are unavailable because sufficient event history is not retained. Verified margin is unavailable because there is no verified supplier-spending source. Missing values are never zero-filled. Consequently actual merchants normally receive null scores but still receive evidence summaries and confidence when the Python service is available. Confidence measures submitted-field completeness and processing quality, not independent verification, repayment ability or credit approval.

## Reconciliation for George

- Adopt the HTML/API four-constraint model and policy overlay for the internal pilot. Keep the notebook's original reproduction alongside it as comparison evidence.
- Four-constraint reproduction: train AUC approximately 0.674912; test AUC 0.660697. Original notebook: train 0.677412; test 0.664809. These are synthetic-data results only.
- Confirm a default prediction horizon, appropriate training observation period and future category coverage before any real-outcome validation.
- Revisit the `Sufficient` floor grade, policy bonuses and the effect of optional declared information on confidence before a merchant-facing risk release.
- Define verified supplier-spending coverage and an appropriate financial metric before enabling margin. Current source material's sales-minus-supplier-spending formula is not implemented as verified profit.

## Rollout and rollback

Local verification results and their limits are recorded in [the pilot verification report](reviews/credit-pilot-local-verification-2026-09-21.json). Browser checks use a fixture API; separate integration checks exercise NestJS, the real Python service and an isolated database. Production deployment and live Cloud Run authentication have not been performed.

Local validation precedes deployment. Release order: database migration; private scoring service; API with matching token/audience; portal; explicitly provisioned analysts and enrolled merchants. Verify unauthenticated service calls fail, staff-only sign-in works, a synthetic assessment succeeds, and merchants cannot retrieve staff results through any history/export route. Observe scoring-service errors/latency and audit records; do not log raw input snapshots or tokens.

Rollback access immediately by revoking analyst permission or unenrolling a merchant. Disable scoring by removing API scoring configuration; readiness remains available and new assessments mark scoring unavailable. Retain immutable historical assessments. Do not roll back by dropping tables containing audit evidence.
