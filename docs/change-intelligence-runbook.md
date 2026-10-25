# Change Intelligence runbook

Operations for the Changes engine (plan `docs/plans/change-intelligence-plan.md` §8).
How it relates to the legacy engine: `docs/merchant-analytics-intelligence.md`.

> **Approval gate.** Nothing in this runbook is run against the hosted project or the
> hosted database without Fred's explicit approval of that release: no job or scheduler
> creation, no IAM grant, no hosted seed, no allowlist change, no deploy. The `api.env.yaml`
> keys and `changes-job.env.yaml` are files only until Stage 8 is approved.

## 1. What runs where

| Piece | Where | Cadence |
|---|---|---|
| Source capture | `change_capture_*` triggers (migration `0038`) write `merchant_change_events` in the same transaction as the sale, product or merchant change | every write |
| Processing | Cloud Run job `mcbuse-api-changes`: `node dist/src/change-intelligence/change-worker.js` | Cloud Scheduler `0 * * * *` UTC, plus one execution per staff "Update now" |
| Daily evaluation | Inside the hourly execution, for each merchant whose local day rolled over | first execution after local midnight |
| Retention | Same job with `--retention` | daily, `30 3 * * *` UTC |
| Reads | The API (`/merchants/me/changes*`, Deep Analytics adapter) | on request |

The API never processes changes. Every execution claims merchants one at a time with a
120-second lease (renewed every 30 s), so the hourly run, an "Update now" run and an
engineer's CLI run never process the same merchant at the same time.

## 2. Configuration

| Key | API | Job | Meaning |
|---|:-:|:-:|---|
| `MERCHANT_CHANGE_INTELLIGENCE_ENABLED` | ✓ | ✓ | `true` turns the feature on; anything else is off |
| `MERCHANT_CHANGE_INTELLIGENCE_ALLOWLIST` | ✓ | ✓ | merchant UUIDs or public IDs, comma-separated; empty = every active merchant |
| `MERCHANT_CHANGE_INTELLIGENCE_SETTINGS` | ✓ | ✓ | optional JSON overrides of §5.11; invalid values refuse to start |
| `CHANGE_INTELLIGENCE_JOB_NAME` | ✓ | | Cloud Run job that "Update now" starts; unset locally |
| `CHANGE_INTELLIGENCE_BUDGET_MS` | | ✓ | execution budget; processing stops at 80 % and the rest stays queued (default 45 min, job file 40 min) |
| `CHANGE_INTELLIGENCE_RETENTION_EVENT_DAYS` | | ✓ | processed event detail, default 90 (min 1) |
| `CHANGE_INTELLIGENCE_RETENTION_HISTORY_DAYS` | | ✓ | runs, node transitions, resolved cases, default 365 (min 30) |
| `CHANGE_INTELLIGENCE_RETENTION_BATCH_SIZE` / `_MAX_BATCHES` | | ✓ | bounded deletes per table per execution, default 1000 × 50 |

The API and the job must carry the **same** enabled flag, allowlist and settings: the worker
and the read APIs use the same availability check (`ChangeIntelligenceConfig.isEnabledFor`).

Initial allowlist (plan §8, Fred 2026-10-25): `mrc_7226ebf0b0b84c81b775` (MCBuse),
`mrc_88d1fb39ebb04b24bb42` (Aci Café). Files: `deploy/cloud-run/api.env.yaml` (API) and
`deploy/cloud-run/changes-job.env.yaml` (job overrides). They ship only with the approved
Stage 8 release.

## 3. Engineer commands (CLI)

From `apps/api`. Locally always export an isolated database first; `apps/api/.env` points at
the hosted database and must not be used:

```bash
export DATABASE_URL=postgres://fred@localhost:5432/mcbuse_ci_test DATABASE_SSL=disable
export NODE_ENV=test   # the worker then ignores apps/api/.env entirely
export MERCHANT_CHANGE_INTELLIGENCE_ENABLED=true MERCHANT_CHANGE_INTELLIGENCE_ALLOWLIST=<ids>
```

| Purpose | Command |
|---|---|
| Hourly execution (what the job runs) | `pnpm changes:ops` |
| Process one merchant now | `pnpm changes:ops --merchant <uuid or public id>` |
| Retry failed work, then run | `pnpm changes:ops --retry-failed [--merchant <ref>]` |
| Rebuild after a model upgrade | `pnpm changes:ops --rebuild model_upgrade [--merchant <ref>]` |
| Full reconciliation (e.g. after a capture gap) | `pnpm changes:ops --rebuild reconciliation [--merchant <ref>]` |
| Retention | `pnpm changes:ops --retention` |
| Evaluation evidence (§9.7, §2.3 backtest) | `pnpm changes:evaluate --database-url <restored copy> --merchant <ref> [--from 2026-08-05 --to 2026-09-28 --trials 20]` |

In the job image use `node dist/src/change-intelligence/change-worker.js` with the same flags.
A model upgrade is also picked up automatically: the hourly execution requests a
`model_upgrade` run for every merchant whose stored model version differs.

The evaluation export reads in one `READ ONLY, REPEATABLE READ` transaction and never reads
`.env`; give it a restored copy, never the hosted database. Output goes to
`docs/evaluations/change-intelligence/`.

### Sample accounts (seeder)

`apps/api/scripts/seed-local-overview-demo.mjs` (see its header):

```bash
SEED_EMAIL=sample@example.com SEED_PASSWORD='…' node scripts/seed-local-overview-demo.mjs \
  --api http://127.0.0.1:4000/api/v1 --database-url postgres://fred@localhost:5432/mcbuse_ci_test \
  --mark-sample --digital-share 0 --days 49 --demand-shift "COF-CAP:1.5:14" --no-assess
```

- Refuses to add history to an `ordinary` merchant unless `--mark-sample` is passed.
- `--mark-sample` is refused when the merchant has any `live` digital sale.
- Use a dedicated sample merchant for demand-shift scenarios. Re-running later fills the
  days since the previous run (catch-up); `--undo` voids seeded cash sales.
- Hosted seeding needs `--allow-host` / `--allow-db-host` **and Fred's approval**; seeded hosted
  history is removed before launch (`docs/go-live-checklist.md`).

## 4. Staff "Update now"

For a merchant who reports a stale warning ("I restocked but it still says low stock").
Staff portal: **Staff workspace → Changes: update now** (`/staff/changes`). Pick the merchant by
business name or owner email, give a reason (required, ≤ 200 characters), press **Update now**.

- Access: an active `staff_permissions` row with `change_intelligence_operator`. One user may
  hold it together with `credit_analyst`. Merchants and owners get 404; other users 403.
  Grant (hosted only with approval):

  ```sql
  INSERT INTO staff_permissions (user_id, permission) VALUES ('<user uuid>', 'change_intelligence_operator')
  ON CONFLICT (user_id, permission) DO UPDATE SET active = true, updated_at = now();
  -- revoke: UPDATE staff_permissions SET active = false, updated_at = now() WHERE user_id = '<uuid>' AND permission = 'change_intelligence_operator';
  ```

- What it does: marks the merchant's work due now (recording the staff user, who is copied onto
  the run row), then starts **one execution** of `mcbuse-api-changes` through the Cloud Run Admin
  REST API as the API's own identity (metadata-server token; no SDK). The execution is an
  ordinary hourly run: it processes due work only, with the normal lease and rules.
- Limits: enabled merchants only; at most one start per merchant per minute; `already_running`
  while a lease is live or within that minute.
- It bypasses no rule: sales-trend changes still need their history and two qualifying local
  days. Stock, reservation, threshold, archive and correction changes show sooner.
- Audit: every use writes `audit_logs` (`entity_type = 'change_update_now'`, `entity_id` = merchant,
  `action = change.update_now.queued | change.update_now.already_running`, reason in `metadata`).
- If the job start fails the API answers 503; the work stays due and the next hourly run
  processes it. Locally (no job name) the request is queued and engineers run
  `pnpm changes:ops --merchant <ref>`.

## 5. Cloud Run job, scheduler and IAM (Stage 8, with approval)

Project `mcbuse-hackathon-2026-fno`, region `europe-west1`, runtime identity
`mcbuse-api@<project>.iam.gserviceaccount.com`, as for the legacy analytics job
(`scripts/cloud-run/deploy-analytics-worker.sh`).

```bash
PROJECT=mcbuse-hackathon-2026-fno REGION=europe-west1
SA=mcbuse-api@${PROJECT}.iam.gserviceaccount.com
SCHED_SA=mcbuse-changes-scheduler@${PROJECT}.iam.gserviceaccount.com
IMAGE=$(gcloud run services describe mcbuse-api --project=$PROJECT --region=$REGION \
  --format='value(spec.template.spec.containers[0].image)')

# Job environment = api.env.yaml with the job overrides applied.
ENV_FILE=$(mktemp)
grep -v -E '^(DATABASE_POOL_MAX|MERCHANT_CHANGE_INTELLIGENCE_[A-Z_]+|CHANGE_INTELLIGENCE_JOB_NAME):' \
  deploy/cloud-run/api.env.yaml > "$ENV_FILE"
cat deploy/cloud-run/changes-job.env.yaml >> "$ENV_FILE"

# 1. The job (one task, no Cloud Run retries: the worker records and schedules its own retries).
gcloud run jobs deploy mcbuse-api-changes --project=$PROJECT --region=$REGION \
  --image="$IMAGE" --service-account=$SA --env-vars-file="$ENV_FILE" \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest \
  --command=node --args=dist/src/change-intelligence/change-worker.js \
  --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=50m --memory=512Mi --cpu=1

# 2. Hourly schedule, UTC.
gcloud iam service-accounts create mcbuse-changes-scheduler --project=$PROJECT \
  --display-name="MCBuse Changes scheduler"
gcloud run jobs add-iam-policy-binding mcbuse-api-changes --project=$PROJECT --region=$REGION \
  --member=serviceAccount:$SCHED_SA --role=roles/run.invoker
gcloud scheduler jobs create http mcbuse-api-changes-hourly --project=$PROJECT --location=$REGION \
  --schedule="0 * * * *" --time-zone=UTC --http-method=POST \
  --uri="https://run.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/jobs/mcbuse-api-changes:run" \
  --oauth-service-account-email=$SCHED_SA --oauth-token-scope=https://www.googleapis.com/auth/cloud-platform

# 3. Daily retention: same job, argument override (needs run.jobs.runWithOverrides → roles/run.developer on this job only).
gcloud run jobs add-iam-policy-binding mcbuse-api-changes --project=$PROJECT --region=$REGION \
  --member=serviceAccount:$SCHED_SA --role=roles/run.developer
gcloud scheduler jobs create http mcbuse-api-changes-retention --project=$PROJECT --location=$REGION \
  --schedule="30 3 * * *" --time-zone=UTC --http-method=POST \
  --uri="https://run.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/jobs/mcbuse-api-changes:run" \
  --headers=Content-Type=application/json \
  --message-body='{"overrides":{"containerOverrides":[{"args":["dist/src/change-intelligence/change-worker.js","--retention"]}]}}' \
  --oauth-service-account-email=$SCHED_SA --oauth-token-scope=https://www.googleapis.com/auth/cloud-platform

# 4. "Update now": the API identity may run this one job (run.jobs.run), nothing else.
gcloud run jobs add-iam-policy-binding mcbuse-api-changes --project=$PROJECT --region=$REGION \
  --member=serviceAccount:$SA --role=roles/run.invoker
```

The binding in step 4 is on the job resource, not the project, so the API identity can start
only `mcbuse-api-changes` and cannot change it. The API then needs
`CHANGE_INTELLIGENCE_JOB_NAME=mcbuse-api-changes` (already in `api.env.yaml`); it derives the
project and region from the metadata server.

Release order (plan §8): migrations `0038`–`0039` → API with the flags → job and one manual
execution (`gcloud run jobs execute mcbuse-api-changes --wait`) to bootstrap both merchants →
check `/merchants/me/changes/status` shows `initialized` → enable the schedulers.

## 6. Monitoring

Each execution prints one JSON line (Cloud Logging `jsonPayload`):

```json
{"severity":"INFO","type":"change_intelligence_execution","mode":"tick","modelVersion":"change-intelligence-v1",
 "asOf":"…","durationMs":812,"queue":{"depth":0,"processing":0,"retrying":0,"oldestDueAgeSeconds":null},
 "captureLagSeconds":null,"scheduled":{"initialization":0,"modelUpgrade":0,"settingsChange":0,"clock":2},
 "processed":2,"failed":0,"failedMerchantIds":[],"exhaustedMerchantIds":[],"retries":0,"leaseLosses":0,
 "events":14,"products":21,"nodes":{"evaluated":120,"changed":9,"skipped":105,"blocked":6},
 "readiness":{"ready":180,"building_baseline":10},"lastSuccessAt":"…","missedDailyEvaluationMerchantIds":[],
 "runIds":["…","…"]}
```

`severity` is `ERROR` and the process exits non-zero when any merchant failed. A failing
merchant also gets a `change_intelligence_merchant_failure` line (`WARNING`) with its run id
and error. Retention prints `type: change_intelligence_retention`.

Measures (§8): queue depth and oldest age (`queue.*`), failed merchants (`failedMerchantIds`,
`exhaustedMerchantIds`), capture lag (`captureLagSeconds`, age of the oldest unprocessed source
event), run duration (`durationMs`), events/products/nodes, evaluated/changed/skipped
(`nodes`), retries and lease losses, readiness counts, last success, model version and run ids.

### Log-based metrics and alerts (define at Stage 8; not created yet)

Base filter: `resource.type="cloud_run_job" AND resource.labels.job_name="mcbuse-api-changes" AND jsonPayload.type="change_intelligence_execution"`.

| Metric | Type | Value / filter addition |
|---|---|---|
| `changes/execution_success` | counter | `AND jsonPayload.failed=0 AND jsonPayload.mode="tick"` |
| `changes/queue_oldest_due_seconds` | distribution | `jsonPayload.queue.oldestDueAgeSeconds` |
| `changes/queue_depth` | distribution | `jsonPayload.queue.depth` |
| `changes/exhausted_merchants` | counter | `AND jsonPayload.exhaustedMerchantIds:*` |
| `changes/lease_losses` | distribution | `jsonPayload.leaseLosses` |
| `changes/serialization_retries` | distribution | `jsonPayload.retries` |
| `changes/missed_daily_evaluation` | counter | `AND jsonPayload.missedDailyEvaluationMerchantIds:*` |

Example: `gcloud logging metrics create changes_execution_success --project=$PROJECT --description="Successful Changes executions" --log-filter='<base filter> AND jsonPayload.failed=0 AND jsonPayload.mode="tick"'`.

| Alert | Condition |
|---|---|
| No successful scheduled run | `changes/execution_success` absent for 75 minutes |
| Eligible pending work too old | max `queue_oldest_due_seconds` > 4500 (75 min) |
| Retries exhausted | `changes/exhausted_merchants` > 0 (any) |
| Repeated lease or serialization failures | sum `lease_losses` > 0 in two consecutive executions, or sum `serialization_retries` ≥ 6 per hour |
| Backlog growing | `queue_depth` increasing over 3 consecutive executions (MQL `align delta(3h) > 0` on the max) |
| Missed daily evaluation | `changes/missed_daily_evaluation` > 0 (the worker reports a merchant whose local yesterday is not evaluated by 02:00 local) |

## 7. Retention

`pnpm changes:ops --retention` (daily in the job). Bounded: at most `BATCH_SIZE × MAX_BATCHES`
rows per table per execution; `complete: false` in the log means the next execution continues.

Deleted: processed/resolved event detail older than 90 days; resolved cases older than 12
months together with their own transitions; node transitions older than 12 months; runs
older than 12 months that nothing references.
Kept always: unprocessed events, current states, active cases and every transition of a case
that still exists, the transition a case points to, runs referenced by states, transitions or
events, and each merchant's latest successful run. Case transitions keep their evidence facts
after the events are gone. Node transitions behind an active case older than 12 months may go;
the detail page's impact trail then shows fewer steps (it tolerates missing nodes).

## 8. Rollback

1. **Disable processing**: pause both schedulers
   (`gcloud scheduler jobs pause mcbuse-api-changes-hourly …`), then set
   `MERCHANT_CHANGE_INTELLIGENCE_ENABLED=false` on the job and the API (or remove the merchant
   from both allowlists). The Changes pages then report "not enabled"; Deep Analytics reads the
   legacy engine again for those merchants (the adapter is authoritative only while enabled and
   initialized). All Change Intelligence records are kept.
2. **Disable capture independently** (stops event writes; source writes are unaffected):

   ```sql
   ALTER TABLE merchant_transactions DISABLE TRIGGER change_capture_transactions_insert,
     DISABLE TRIGGER change_capture_transactions_update, DISABLE TRIGGER change_capture_transactions_delete;
   ALTER TABLE merchant_cash_sales DISABLE TRIGGER change_capture_cash_sales_insert,
     DISABLE TRIGGER change_capture_cash_sales_update, DISABLE TRIGGER change_capture_cash_sales_delete;
   ALTER TABLE merchant_cash_sale_items DISABLE TRIGGER change_capture_cash_sale_items_update,
     DISABLE TRIGGER change_capture_cash_sale_items_delete;
   ALTER TABLE merchant_products DISABLE TRIGGER change_capture_products_insert,
     DISABLE TRIGGER change_capture_products_update, DISABLE TRIGGER change_capture_products_delete;
   ALTER TABLE merchant_import_batches DISABLE TRIGGER change_capture_import_batches_update;
   ALTER TABLE merchants DISABLE TRIGGER change_capture_merchants_update;
   ```

   (`ALTER TABLE … ENABLE TRIGGER …` with the same names to restore. Name triggers explicitly;
   `DISABLE TRIGGER ALL` would also disable the legacy analytics and integrity triggers.)
3. **After re-enabling capture** a gap exists: run
   `node dist/src/change-intelligence/change-worker.js --rebuild reconciliation` (or the CLI
   equivalent) before treating results as fresh. Note: a reconciliation recomputes minimums and
   risk but does not open "stock threshold changed" cases for threshold edits made during the gap
   (see the evaluation report's propagation findings).
4. **Application rollback**: restore the previous API revision. Migrations `0038`/`0039` are
   additive and stay.

## 9. Local verification

```bash
cd apps/api
export DATABASE_URL=postgres://fred@localhost:5432/mcbuse_ci_test DATABASE_SSL=disable
pnpm db:migrate
npx jest src/change-intelligence
npx jest --config ./jest-integration.json --runInBand --watchman=false src/change-intelligence src/credit-assessment
pnpm build
cd ../portal && pnpm check-types && npx vitest run lib/server && pnpm exec playwright test tests/staff-changes.spec.ts
```
