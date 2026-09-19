# Merchant analytics and business intelligence

## Boundaries

General Analytics reports recorded activity. It does not claim complete turnover, profit, purchasing cost, cash flow, or causation. Stock value uses current selling prices. Historical category reporting uses the product's current category.

Business intelligence reads committed merchant records and writes derived snapshots. It never changes payments, invoices, stock, evidence packages, or credit-readiness results. Forecasts and anomalies are operational signals for review.

## Feature flags

- `MERCHANT_GENERAL_ANALYTICS_ENABLED`: set to `false` to disable the expanded analytics endpoint. Defaults to enabled when unset.
- `MERCHANT_INTELLIGENCE_ENABLED`: must be `true` for the worker and insights endpoint.
- `MERCHANT_INTELLIGENCE_ALLOWLIST`: optional comma-separated merchant database IDs or public IDs. Empty means every active merchant.
- `MERCHANT_AI_NARRATION_ENABLED`: must be `true` before the worker calls Groq.
- `GROQ_API_KEY`: Secret Manager value exposed only to the analytics Cloud Run job.

Keep Groq credentials in Secret Manager. Do not copy them into `.env`, `api.env.yaml`, shell history, source control, or logs. Existing credentials are managed separately and are not changed by this rollout.

## Worker scheduling

The worker runs every six hours at 00:00, 06:00, 12:00 and 18:00 UTC (also Ghana time). This is four scheduled runs per day. Ordinary sales and inventory reports do not depend on this worker schedule.

Run fresh insights on demand from the repository root, without changing the schedule:

```bash
pnpm analytics:run
```

The command waits for the Cloud Run execution to finish. It defaults to project `mcbuse-hackathon-2026-fno`, region `europe-west1`, and job `mcbuse-api-analytics`. Override these with `MCBUSE_GCP_PROJECT_ID`, `MCBUSE_GCP_REGION`, and `MCBUSE_RUN_SERVICE` as needed. Google Cloud Console's Cloud Run job page also offers **Execute**.

The deployment script defaults to `MCBUSE_ANALYTICS_SCHEDULER_ENABLED=true` and cron expression `0 */6 * * *`. Set that flag to `false` to pause, or override `MCBUSE_ANALYTICS_SCHEDULE` to change the interval. The existing Scheduler resource retains its historical `every-10-minutes` name to avoid duplicate jobs.

`MERCHANT_INTELLIGENCE_STALE_AFTER_MINUTES` controls when the insights API marks data delayed. Its default is 375 minutes: six hours plus a 15-minute execution grace period. Existing insights retain their actual calculation timestamp; a manual run refreshes them sooner. Keep this threshold longer than the chosen schedule.

## Calculation rules

- Performance compares the last seven complete merchant-local days with the preceding seven.
- Seven-day forecasts require at least 28 days of activity and use the previous four matching weekdays.
- Product forecasts require at least 10 linked units in the last 28 complete days.
- Volume anomalies require four matching weekdays, a difference of at least five transactions, at least 50% of the mean, and more than three standard deviations.
- Product anomalies use the same baseline with a minimum three-unit difference.
- Payment-mix signals require at least 20 transactions in both seven-day periods and a 20 percentage-point change.
- Replenishment suggestions use projected seven-day demand plus the configured low-stock threshold. They exclude supplier lead times and incoming orders.

## Local verification

```bash
pnpm --filter api build
pnpm --filter api exec jest --runInBand --watchman=false
pnpm --filter api merchant:analytics-load
pnpm --filter portal check-types
pnpm --filter portal test
pnpm --filter portal build
pnpm --filter mobile exec tsc --noEmit
git diff --check
```

The local load command exercises 100,000 transactions and 1,000 products and fails if calculation exceeds five minutes. Payment API p95 must be measured in the pilot environment before expanding the allowlist.

## Release

1. Back up the database and apply migrations `0020_merchant_analytics_intelligence.sql` through `0022_narration_calculation_version.sql`.
2. Deploy API and portal with intelligence flags disabled.
3. Add a new `GROQ_API_KEY` secret version without changing separately managed existing credentials.
4. Set a non-empty pilot merchant allowlist and run `scripts/cloud-run/deploy-analytics-worker.sh`.
5. Validate deterministic snapshots before setting `MERCHANT_AI_NARRATION_ENABLED=true` on the worker.
6. Monitor job duration, snapshot age, failed merchants, database load, narration cache growth, and deterministic fallback rate.

Disabling the intelligence flags and restoring the prior application revision is sufficient for rollback. The additive tables may remain in place.

## Hosted pilot evidence — 19 September 2026

- A PostgreSQL 17 custom-format backup was created before migration. Its SHA-256 checksum and archive index were verified.
- Migration execution `mcbuse-api-migrate-hhjhl` completed before API revision `mcbuse-api-00039-g9v` received traffic.
- Portal revision `mcbuse-portal-00024-trb` preserves `merchant.mcbuse.com` as the canonical origin and uses `api.mcbuse.com/api/v1`.
- The API keeps intelligence and AI narration disabled. General Analytics is enabled. The separate `mcbuse-api-analytics` job enables intelligence for two demonstration merchants and uses a database pool maximum of two.
- Cloud Scheduler invokes the job every ten minutes. Scheduled execution `mcbuse-api-analytics-sch5r` and manually triggered Scheduler execution `mcbuse-api-analytics-k8m9r` each completed successfully.
- Four worker runs completed with two merchants processed and zero failures. The latest snapshots use `merchant-intelligence-v1`; no production activity met the materiality thresholds for an active insight.
- `GROQ_API_KEY` version 1 is enabled in Secret Manager. The analytics runtime has accessor permission on that secret. A minimal strict-schema request to `openai/gpt-oss-20b` returned HTTP 200 with schema-valid JSON and tools disabled. Existing Groq credentials were not revoked or changed.
- The hosted infrastructure readiness check passed all nine payment and deployment guardrails after release. The API and database report healthy, unauthenticated insights return 401, the portal sign-in returns 200, and protected Overview redirects to the canonical sign-in URL.
- The 100,000-transaction and 1,000-product local calculation completed in 36.026 seconds. Payment API p95 degradation under that database workload remains an expansion gate; keep the pilot allowlist in place until it is measured and is no more than 10%.
