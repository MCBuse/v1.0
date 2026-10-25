#!/usr/bin/env bash
# Change Intelligence release checks (plan §8 "Release and rollback", Stage 7):
#   migrations  fresh-from-zero and upgrade-from-0037 both reach 0039 with the same schema
#   backup      pg_dump of the test database -> restore into a scratch database -> the worker
#               runs and the API reads work on the restored copy; pending events and revisions intact;
#               the API survives its idle database connections being terminated (database.module.ts
#               pool error handler) and reconnects
#
#   apps/api$ scripts/change-intelligence-release-checks.sh [migrations|backup|all]
#
# Local PostgreSQL only (PGHOST=localhost). Never point this at apps/api/.env's database: every
# command below gets an explicit DATABASE_URL and NODE_ENV=test, so .env is never read.
# Rollback (flag off) and capture-off are integration tests: src/change-intelligence/change-resilience.int-spec.ts.
set -euo pipefail
cd "$(dirname "$0")/.."

PGHOST=${PGHOST:-localhost} PGPORT=${PGPORT:-5432} PGUSER=${PGUSER:-$(whoami)}
export PGHOST PGPORT PGUSER
[ "$PGHOST" = localhost ] || [ "$PGHOST" = 127.0.0.1 ] || { echo "local PostgreSQL only" >&2; exit 2; }
SOURCE_DB=${SOURCE_DB:-mcbuse_ci_test}
API_PORT=${API_PORT:-3406}
WORK=$(mktemp -d)
url() { echo "postgres://$PGUSER@$PGHOST:$PGPORT/$1"; }
psqlq() { psql -X -v ON_ERROR_STOP=1 -At -d "$1" -c "$2"; }
step() { printf '\n== %s\n' "$*"; }
API_PID=
MERCHANT=
cleanup() {
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null || true
  # Also on failure: never leave the seeded merchant or the scratch database behind.
  if [ -n "$MERCHANT" ]; then step "clean up the seeded merchant in $SOURCE_DB"; remove_merchant "$MERCHANT" || true; fi
  dropdb --if-exists mcbuse_ci_restore 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

migrations() {
  step "fresh database, migrations 0000-0039"
  dropdb --if-exists mcbuse_ci_fresh && createdb mcbuse_ci_fresh
  DATABASE_URL=$(url mcbuse_ci_fresh) DATABASE_SSL=false npx drizzle-kit migrate --config drizzle.config.ts 2>&1 | tr '\r' '\n' | grep -o 'migrations applied successfully' | head -1
  psqlq mcbuse_ci_fresh "SELECT 'applied migrations: ' || count(*) FROM drizzle.__drizzle_migrations"

  step "upgrade database: migrations 0000-0037, existing rows, then 0038-0039"
  dropdb --if-exists mcbuse_ci_upgrade && createdb mcbuse_ci_upgrade
  cp -R drizzle "$WORK/drizzle0037"
  node -e '
    const f = process.argv[1], fs = require("fs"), j = JSON.parse(fs.readFileSync(f));
    j.entries = j.entries.filter((e) => e.idx <= 37); fs.writeFileSync(f, JSON.stringify(j));
    console.log("journal truncated to", j.entries.at(-1).tag);' "$WORK/drizzle0037/meta/_journal.json"
  cat > "$WORK/drizzle0037.config.ts" <<EOF
export default { out: '$WORK/drizzle0037', dialect: 'postgresql', dbCredentials: { url: '$(url mcbuse_ci_upgrade)' } };
EOF
  npx drizzle-kit migrate --config "$WORK/drizzle0037.config.ts" 2>&1 | tr '\r' '\n' | grep -o 'migrations applied successfully' | head -1
  psqlq mcbuse_ci_upgrade "SELECT 'at 0037, applied: ' || count(*) FROM drizzle.__drizzle_migrations"
  # Rows that 0038 must keep: a staff permission (0038 changes its primary key) and a product.
  psqlq mcbuse_ci_upgrade "
    WITH u AS (INSERT INTO users (email, username, first_name, last_name) VALUES ('upgrade@mcbuse.test', 'upgradecheck', 'Up', 'Grade') RETURNING id),
    s AS (INSERT INTO staff_permissions (user_id, permission) SELECT id, 'credit_analyst' FROM u RETURNING user_id)
    SELECT 'seeded staff permission for ' || user_id FROM s"
  DATABASE_URL=$(url mcbuse_ci_upgrade) DATABASE_SSL=false npx drizzle-kit migrate --config drizzle.config.ts 2>&1 | tr '\r' '\n' | grep -o 'migrations applied successfully' | head -1
  psqlq mcbuse_ci_upgrade "SELECT 'after upgrade, applied: ' || count(*) FROM drizzle.__drizzle_migrations"
  psqlq mcbuse_ci_upgrade "INSERT INTO staff_permissions (user_id, permission) SELECT user_id, 'change_intelligence_operator' FROM staff_permissions WHERE permission = 'credit_analyst'" >/dev/null
  psqlq mcbuse_ci_upgrade "SELECT 'permissions kept/added: ' || string_agg(permission, ', ' ORDER BY permission) FROM staff_permissions"
  psqlq mcbuse_ci_upgrade "SELECT 'capture triggers: ' || count(*) FROM pg_trigger WHERE tgname LIKE 'change_capture_%' AND tgenabled = 'O'"
  psqlq mcbuse_ci_upgrade "SELECT 'RLS on change tables: ' || count(*) FILTER (WHERE relrowsecurity) || '/' || count(*) FROM pg_class WHERE relname LIKE 'merchant_change_%' AND relkind = 'r'"

  step "schema of fresh vs upgraded (pg_dump --schema-only, diff)"
  for db in mcbuse_ci_fresh mcbuse_ci_upgrade; do
    pg_dump --schema-only --no-owner --no-privileges "$db" | grep -v '^--' | grep -v '^\\restrict\|^\\unrestrict' > "$WORK/$db.sql"
  done
  if diff -u "$WORK/mcbuse_ci_fresh.sql" "$WORK/mcbuse_ci_upgrade.sql" > "$WORK/schema.diff"; then
    echo "schemas identical ($(wc -l < "$WORK/mcbuse_ci_fresh.sql") lines)"
  else
    echo "SCHEMA DIFFERS:"; cat "$WORK/schema.diff"; exit 1
  fi
  dropdb mcbuse_ci_fresh && dropdb mcbuse_ci_upgrade
}

worker() { # worker <db> <merchant id> [args…]
  local db=$1 merchant=$2; shift 2
  env NODE_ENV=test DATABASE_URL="$(url "$db")" DATABASE_SSL=false \
    MERCHANT_CHANGE_INTELLIGENCE_ENABLED=true MERCHANT_CHANGE_INTELLIGENCE_ALLOWLIST="$merchant" \
    npx ts-node -T src/change-intelligence/change-worker.ts "$@" 2>&1 | grep -o '"type":"change_intelligence_execution".*"processed":[0-9]*,"failed":[0-9]*' | sed 's/,"captureLag.*"processed"/ … "processed"/'
}

state() { # state <db> <merchant id>
  psqlq "$1" "SELECT 'work requested/processed: ' || requested_revision || '/' || processed_revision || ', bootstrap ' || bootstrap_status FROM merchant_change_work WHERE merchant_id = '$2'"
  psqlq "$1" "SELECT 'events: ' || coalesce(string_agg(status || '=' || n, ', ' ORDER BY status), 'none') FROM (SELECT status, count(*) n FROM merchant_change_events WHERE merchant_id = '$2' GROUP BY status) e"
  psqlq "$1" "SELECT 'runs ' || (SELECT count(*) FROM merchant_change_runs WHERE merchant_id = '$2') || ', states ' || (SELECT count(*) FROM merchant_change_states WHERE merchant_id = '$2') || ', transitions ' || (SELECT count(*) FROM merchant_change_transitions WHERE merchant_id = '$2') || ', cases ' || (SELECT count(*) FROM merchant_change_cases WHERE merchant_id = '$2')"
  psqlq "$1" "SELECT 'state fingerprint: ' || md5(string_agg(node_key || coalesce(product_id::text, '') || fingerprint || version, ',' ORDER BY node_key, product_id)) FROM merchant_change_states WHERE merchant_id = '$2'"
}

backup() {
  step "seed a merchant in $SOURCE_DB, initialize it, leave one event pending"
  local out
  out=$(DATABASE_URL=$(url "$SOURCE_DB") npx ts-node -T -e '
    import { Pool } from "pg"; import { drizzle } from "drizzle-orm/node-postgres"; import * as bcrypt from "bcrypt";
    import * as schema from "./src/database/schema"; import { createMerchantFixture } from "./src/database/testing/merchant-fixture";
    (async () => {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL }); const db = drizzle(pool, { schema });
      const f = await createMerchantFixture(db, "Backup");
      await pool.query("UPDATE users SET password_hash = $2 WHERE id = $1", [f.userId, await bcrypt.hash("Backup-Check-1", 10)]);
      const { rows } = await pool.query(`INSERT INTO merchant_products (merchant_id, name, unit_price_minor, on_hand_quantity, low_stock_threshold, created_at)
        VALUES ($1, $2, 250, 3, 5, now() - interval $$60 days$$), ($1, $3, 250, 400, 5, now() - interval $$60 days$$) RETURNING id`, [f.merchantId, "Croissant", "Latte"]);
      for (const p of rows) await pool.query(`WITH s AS (INSERT INTO merchant_cash_sales (merchant_id, receipt_number, amount_minor, occurred_at, actor_user_id, idempotency_key)
          SELECT $1, $$CS-$$ || substr(md5(random()::text), 1, 20), 1000, date_trunc($$day$$, now()) - make_interval(days => d) + interval $$12 hours$$, $2, gen_random_uuid()::text
          FROM generate_series(1, 35) d RETURNING id)
        INSERT INTO merchant_cash_sale_items (cash_sale_id, product_id, type, name, quantity, unit_price_minor, line_total_minor)
        SELECT id, $3, $$product$$, $$Line$$, 4, 250, 1000 FROM s`, [f.merchantId, f.userId, p.id]);
      const { rows: [u] } = await pool.query("SELECT email FROM users WHERE id = $1", [f.userId]);
      console.log(f.merchantId, u.email, rows[1].id); await pool.end();
    })();')
  read -r MERCHANT EMAIL LATTE <<< "$out"
  echo "merchant $MERCHANT ($EMAIL)"
  worker "$SOURCE_DB" "$MERCHANT" --merchant "$MERCHANT"
  psqlq "$SOURCE_DB" "UPDATE merchant_products SET on_hand_quantity = 2 WHERE id = '$LATTE'" >/dev/null
  echo "source after a stock write (not processed):"; state "$SOURCE_DB" "$MERCHANT" | tee "$WORK/source.txt"

  step "pg_dump $SOURCE_DB -> restore into mcbuse_ci_restore"
  pg_dump -Fc --no-owner "$SOURCE_DB" > "$WORK/backup.dump"
  echo "dump: $(du -h "$WORK/backup.dump" | cut -f1)"
  dropdb --if-exists mcbuse_ci_restore && createdb mcbuse_ci_restore
  pg_restore --no-owner --exit-on-error -d mcbuse_ci_restore "$WORK/backup.dump"
  echo "restored:"; state mcbuse_ci_restore "$MERCHANT" | tee "$WORK/restored.txt"
  diff -u "$WORK/source.txt" "$WORK/restored.txt" && echo "pending events, revisions, runs, states, transitions and cases identical"
  psqlq mcbuse_ci_restore "SELECT 'capture triggers enabled on restore: ' || count(*) FROM pg_trigger WHERE tgname LIKE 'change_capture_%' AND tgenabled = 'O'"

  step "API reads on the restored copy (port $API_PORT)"
  env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test PORT="$API_PORT" HOST=127.0.0.1 API_PREFIX=api/v1 \
    DATABASE_URL="$(url mcbuse_ci_restore)" DATABASE_SSL=false \
    JWT_ACCESS_SECRET=restore-check-access-0123456789 JWT_REFRESH_SECRET=restore-check-refresh-0123456789 \
    JWT_ACCESS_EXPIRES_IN=1h JWT_REFRESH_EXPIRES_IN=7d OTP_PROVIDER=mock PRIVY_APP_ID=local \
    SOLANA_RPC_URL=http://127.0.0.1:1 SOLANA_NETWORK=devnet SOLANA_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU \
    STRIPE_SECRET_KEY=sk_test_unused MOONPAY_SECRET_KEY=unused \
    SOLANA_KEYPAIR_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000001 \
    ONRAMP_PROVIDER=mock OFFRAMP_PROVIDER=mock SWAP_PROVIDER=mock TRANSFER_PROVIDER=mock FINANCIAL_MODE=mock \
    MERCHANT_PORTAL_ENABLED=true MERCHANT_CHANGE_INTELLIGENCE_ENABLED=true MERCHANT_CHANGE_INTELLIGENCE_ALLOWLIST="$MERCHANT" \
    THROTTLE_TTL=60000 THROTTLE_LIMIT=100000 node dist/src/main.js > "$WORK/api.log" 2>&1 &
  API_PID=$!
  local api="http://127.0.0.1:$API_PORT/api/v1" token
  for _ in $(seq 1 60); do curl -sf -o /dev/null "$api/health" 2>/dev/null && break; curl -s -o /dev/null "$api/auth/login" 2>/dev/null && break; sleep 1; done
  token=$(curl -sf -X POST "$api/auth/login" -H 'content-type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"Backup-Check-1\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken' || true)
  [ -n "$token" ] && [ "$token" != undefined ] || { echo "LOGIN FAILED; API log:"; tail -30 "$WORK/api.log"; exit 1; }
  status() { curl -sf "$api/merchants/me/changes/status" -H "authorization: Bearer $token" | node -pe '
    const s = JSON.parse(require("fs").readFileSync(0)); `status: available=${s.available} initialized=${s.initialized} processing=${s.processing} activeChanges=${s.summary.activeChanges}`'; }
  status
  step "terminate the API's database connections (restart/failover); the API must survive"
  psqlq mcbuse_ci_restore "SELECT 'terminated connections: ' || count(*) FROM (SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'mcbuse_ci_restore' AND pid <> pg_backend_pid()) t"
  sleep 1
  kill -0 "$API_PID" 2>/dev/null || { echo "API PROCESS EXITED"; tail -20 "$WORK/api.log"; exit 1; }
  grep -o 'Idle database connection lost ([A-Z0-9_]*)' "$WORK/api.log" | sort | uniq -c
  echo "API alive after termination; reads reconnect:"
  echo "changes list: $(curl -sf "$api/merchants/me/changes" -H "authorization: Bearer $token" | node -pe 'JSON.parse(require("fs").readFileSync(0)).items.map(i => i.type + ":" + i.productName).join(", ")')"

  step "worker on the restored copy processes the pending event"
  worker mcbuse_ci_restore "$MERCHANT"
  state mcbuse_ci_restore "$MERCHANT"
  status
  kill "$API_PID"; API_PID=
}

remove_merchant() { # remove_merchant <merchant id> — deletes a seeded merchant from $SOURCE_DB
  DATABASE_URL=$(url "$SOURCE_DB") npx ts-node -T -e '
    import { Pool } from "pg"; import { drizzle } from "drizzle-orm/node-postgres"; import * as schema from "./src/database/schema";
    import { destroyMerchantFixture } from "./src/database/testing/merchant-fixture";
    (async () => { const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      const { rows: [r] } = await pool.query("SELECT m.id, mm.user_id FROM merchants m JOIN merchant_memberships mm ON mm.merchant_id = m.id WHERE m.id = $1", [process.argv[1]]);
      const w = await pool.query("SELECT id, type FROM wallets WHERE user_id = $1", [r.user_id]);
      await destroyMerchantFixture(drizzle(pool, { schema }), { label: "Backup", userId: r.user_id, merchantId: r.id,
        holdingWalletId: w.rows.find((x) => x.type === "savings").id, routineWalletId: w.rows.find((x) => x.type === "routine").id });
      console.log("removed", r.id); await pool.end(); })();' "$1"
}

case "${1:-all}" in
  migrations) migrations ;;
  backup) backup ;;
  all) migrations; backup ;;
  remove-merchant) remove_merchant "$2" ;;
  *) echo "usage: $0 [migrations|backup|all|remove-merchant <id>]" >&2; exit 2 ;;
esac
