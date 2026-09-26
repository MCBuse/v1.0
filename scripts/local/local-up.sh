#!/usr/bin/env bash
# Boot MCBuse locally: Postgres DB (create + migrate), credit-scoring, API, portal.
# Usage (from repo root):  bash scripts/local/local-up.sh
# Stop everything with Ctrl+C.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
LOG_DIR="$ROOT/tmp/local-logs"
mkdir -p "$LOG_DIR"

echo "==> 1/5 Ensuring database exists (reads apps/api/.env)"
(cd apps/api && node -e '
require("dotenv").config({ path: ".env" });
const { Client } = require("pg");
const name = process.env.DATABASE_NAME;
const c = new Client({
  host: process.env.DATABASE_HOST, port: +process.env.DATABASE_PORT,
  user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD,
  database: "postgres",
});
(async () => {
  await c.connect();
  const r = await c.query("select 1 from pg_database where datname=$1", [name]);
  if (r.rowCount) console.log("   database", name, "already exists");
  else { await c.query(`create database "${name.replace(/"/g, "")}"`); console.log("   created database", name); }
  await c.end();
})().catch(e => { console.error("   Postgres connection failed:", e.message); process.exit(1); });
')

echo "==> 2/5 Running migrations"
pnpm --filter api db:migrate

echo "==> 3/5 Preparing credit-scoring (Python 3.12 venv)"
PY="$(command -v python3.12 || command -v python3)"
if [ ! -d apps/credit-scoring/.venv ]; then
  "$PY" -m venv apps/credit-scoring/.venv
  apps/credit-scoring/.venv/bin/pip install -q -r apps/credit-scoring/requirements.txt
fi
CREDIT_SCORING_TOKEN="$(grep -E '^CREDIT_SCORING_TOKEN=' apps/api/.env | cut -d= -f2-)"
export CREDIT_SCORING_TOKEN

pids=()
cleanup() { echo; echo "==> Stopping..."; kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "==> 4/5 Starting services (logs in tmp/local-logs/)"
(cd apps/credit-scoring && .venv/bin/python -m uvicorn scoring.app:app --host 127.0.0.1 --port 55440) \
  > "$LOG_DIR/scoring.log" 2>&1 & pids+=($!)
pnpm --filter api start:dev > "$LOG_DIR/api.log" 2>&1 & pids+=($!)
pnpm --filter portal dev    > "$LOG_DIR/portal.log" 2>&1 & pids+=($!)

echo "==> 5/5 Waiting for health"
wait_for() { for _ in $(seq 1 90); do curl -fs -o /dev/null "$2" && { echo "   $1 up  -> $2"; return; }; sleep 2; done; echo "   $1 NOT up — see $LOG_DIR"; }
wait_for "scoring" http://127.0.0.1:55440/health
wait_for "api    " http://localhost:4000/api/v1/health || true
wait_for "portal " http://localhost:3001

echo
echo "Portal: http://localhost:3001   (Ctrl+C to stop all)"
wait
