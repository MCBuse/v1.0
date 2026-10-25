# Change Intelligence performance (plan §9.6, Stage 7B)

Local measurements, 2026-10-25. Raw results: `performance.json` (run B, the reference run) and
`performance-repeat.json` (run A, same code, 5 minutes earlier). Reproduce with `pnpm changes:load`
(see the runbook §9). Hosted-only gates are Stage 8 evidence.

## Conditions

| | |
|---|---|
| Hardware | Apple M1 Pro, 10 logical CPUs, 16 GiB, macOS; Postgres on the same machine |
| Software | Node v24.11.1; PostgreSQL 16.9 (Homebrew, `shared_buffers` 128 MB) |
| Database | `mcbuse_ci_perf`, re-created from zero (migrations 0000–0039) before each run; 144 MB after the fixture, 288 MB at the end (Change Intelligence tables 140 MB) |
| Fixture | 1 merchant, 1,000 products (32 more for the HTTP writes), 100,000 sales over 90 days: 75,000 cash sales (90,000 lines) + 25,000 finalized digital sales. Europe/Berlin. 44,440 sale lines fall in the engine's windows |
| Worker concurrency | one merchant, sequential runs, real services (claim → REPEATABLE READ load → pure evaluation → publish), no Nest bootstrap, pool max 4 |
| HTTP concurrency | 1 and 8 concurrent clients against a local API (`node dist/src/main.js`, port 3405, `NODE_ENV=test`) |
| Samples | 40 incremental, 40 stock-only, 5 daily clock runs, 3 initializations; HTTP: 1,000 per arm (5 interleaved off/on blocks of 200, after 100 warm-up writes) |
| Cold / warm | the first initialization is the first run in the process (cold); the rest are warm. Fixture data is freshly loaded and `ANALYZE`d |
| Machine load | **not quiet**: other agents ran builds, E2E suites and a second PostgreSQL on the same machine. Load average 21–94 (10 CPUs) during the runs |

## Results

| Measure | Gate | Run B | Run A | Result |
|---|---:|---:|---:|---|
| One-product incremental (a sale), p95 | ≤ 2 s | 204 ms (p50 191, max 291) | 300 ms (p50 204, max 571) | **pass** |
| Stock-only propagation, p95 | ≤ 500 ms | 215 ms (p50 195, max 257) | 491 ms (p50 213, max 734) | **pass** (run A's tail is machine load) |
| Daily clock, 1,000 products (max of 5) | ≤ 30 s | 1.06 s | 1.21 s | **pass** |
| Full initialization (cold; warm) | ≤ 120 s | 1.72 s; 1.67 s, 1.54 s | 1.67 s; 1.56 s, 1.79 s | **pass** |
| Source-write p95 regression, HTTP | ≤ 10 % | see below | see below | **not established** (noise exceeds the gate) |

Nodes evaluated per run: incremental 7–9, stock-only 4–6 of 12,386 node instances; clock 7,646;
initialization 12,002. Steady-state stock-only breakdown (run B): load 145 ms, evaluation 30 ms,
publication ≈ 20–30 ms, claim ≈ 1 ms.

Startup, measured separately from calculation:

| | |
|---|---|
| Worker config + first query; `enqueueScheduled` | 23 ms; 27 ms |
| Worker process: start, empty tick, exit (`node dist/src/change-intelligence/change-worker.js`) | 721 ms cold, 442 / 342 ms warm |
| API process: spawn → `/health` 200 | 3.39 s cold, 1.34 / 1.42 s warm |

### Source writes through the HTTP API (capture triggers on vs off)

p95 in ms, off → on (regression %); p50 regression in brackets.

| Operation | Concurrency | Run B | Run A |
|---|---:|---|---|
| `POST /merchants/me/cash-sales` | 1 | 43.7 → 47.1 (+7.7 %) [+27.6 %] | 33.0 → 27.2 (−17.7 %) [−10.6 %] |
| `POST /merchants/me/products/:id/stock-adjustments` | 1 | 24.1 → 17.5 (−27.6 %) [−42.5 %] | 19.8 → 29.7 (+50.2 %) [+15.4 %] |
| `POST /merchants/me/cash-sales` | 8 | 33.0 → 39.3 (+19.2 %) [+4.9 %] | 36.9 → 39.4 (+6.8 %) [+4.9 %] |
| `POST /merchants/me/products/:id/stock-adjustments` | 8 | 16.4 → 19.5 (+18.9 %) [−0.4 %] | 18.8 → 18.9 (+0.4 %) [+5.2 %] |

The same operation changes sign between two identical runs (stock adjustment at concurrency 1:
−28 % then +50 %), so on this machine the run-to-run noise is several times the 10 % gate and
the gate can neither pass nor fail here. What the numbers do bound: the medians differ by a few
milliseconds at most, and at concurrency 8 the p50 overhead is ≤ 5 %. The capture triggers add
one event insert and one work-row update per source write (in the same transaction). **Unmet:
repeat on a quiet machine or the hosted Cloud SQL instance (Stage 8)** — the command is unchanged.

## Fixes made in Stage 7B

Before (first measured run, same fixture): stock-only p95 9.2 s (p50 1.66 s), incremental p95
4.2 s; steady state ≈ 490 ms per stock-only run (load 350 ms, evaluation 115 ms).

1. **Product load** (`change-source.loader.ts`): the first-sale CTE was inlined by PostgreSQL as a
   per-product subquery that re-joined every sale line for each of the 1,032 products (92,640 index
   lookups, 235 ms). `WITH first_sale AS MATERIALIZED` + `LEFT JOIN`: 25 ms. Same rows.
2. **Local dates** (`engine/local-time.ts`): `localDate` called `Intl.formatToParts` for every sale
   line on every run (≈ 78 ms per run). Now memoized per UTC hour when the whole hour lies on one
   local date (hours containing a local midnight are always computed); guarded by a
   minute-by-minute equivalence test across DST changes and +05:45 / −03:30 / 30-minute-DST zones.
   Evaluation 115 → 30–40 ms.

Remaining cost is the full sale window (44,440 lines) loaded on every run, including stock-only
ones (~100 ms). Not changed: it is within the gates, and loading only affected products would
change the engine's input contract.

## Hosted-only gates (Stage 8 evidence)

| Gate | Locally measurable component | Stage 8 measurement |
|---|---|---|
| Hourly source-to-visible latency, stock changes ≤ 65 min | schedule cadence 60 min + one stock-only run ≈ 0.2 s + worker start-up 0.3–0.7 s | Cloud Scheduler → job execution → `lastSuccessfulAnalysisAt` |
| "Update now" stock/threshold change visible ≤ 2 min | stock-only run ≈ 0.2 s; worker process start-up 0.3–0.7 s locally | Cloud Run job cold start + run, from the staff request to the Changes status |
| Demand case visible after the second qualifying local day, by 02:05 local | daily clock run for 1,000 products ≈ 1.1 s | scheduler timing per merchant timezone in production logs |
