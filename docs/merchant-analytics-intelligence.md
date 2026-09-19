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

1. Back up the database and apply migration `0020_merchant_analytics_intelligence.sql`.
2. Deploy API and portal with intelligence flags disabled.
3. Add a newly rotated `GROQ_API_KEY` secret.
4. Set a non-empty pilot merchant allowlist and run `scripts/cloud-run/deploy-analytics-worker.sh`.
5. Validate deterministic snapshots before setting `MERCHANT_AI_NARRATION_ENABLED=true` on the worker.
6. Monitor job duration, snapshot age, failed merchants, database load, narration cache growth, and deterministic fallback rate.

Disabling the intelligence flags and restoring the prior application revision is sufficient for rollback. The additive tables may remain in place.
