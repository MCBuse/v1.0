# Seeding the hosted demo merchant (devnet)

Creates a demo café on the hosted platform (`api.mcbuse.com`, devnet sandbox)
with 90 days of trading history for the hackathon demo:

- MCBuse payments start 35 days ago, and since then about 70% of sales are digital.
  Before that the café took cash only ("joined MCBuse five weeks ago").
- Every digital sale is a real itemised invoice paid on devnet by a seed customer.
  Afterwards its timestamps are moved to the planned sale time.
- About 1,300 sales in total, around 300 of them digital (≈ €1,800).
- The optional business details are declared too (a €3,000 12-month working-capital
  request, assets above debts), then an assessment is run.

Verified end to end on a local copy (same history, the real scoring service, and the
production `CREDIT_INPUT_DEFAULTS`): **credit score 726 (Good), financial profile
69.4 / 100 (Good), data confidence High, 7 of 7 payment history checks met**. The last 30
days show 67.7% digital sales by value. Expect small differences on production, because
sale times follow the day the script runs. The external bureau fields are left empty on
purpose.
Devnet payments are recorded as `test` evidence, and the credit model counts only live
payments. So the score comes from the cash sales and the business profile; the digital
sales drive the analytics and the payment history checklist.

## Money

- Treasury `82ihqm…XqV4` (checked 2026-09-28): **53.32 USDC, 24.81 SOL** on devnet.
- The seed customer is funded **once with 45 USDC** through a Stripe test checkout. That
  moves 45 USDC out of the treasury.
- Whenever that float runs low, the demo merchant sends what it has received back to the
  customer (a "payback", about 40 in total). These show in the merchant's account history
  as outgoing transfers. They are not sales and don't touch the Transactions list or analytics.
- Fees are paid by the treasury (a few thousandths of a SOL in total).

## Steps (run on your Mac, from `apps/api`)

```bash
export MCBUSE_GCP_PROJECT_ID=…            # the GCP project behind api.mcbuse.com
export DATABASE_URL="$(gcloud secrets versions access latest --secret=DATABASE_URL --project=$MCBUSE_GCP_PROJECT_ID)"
export DATABASE_SSL=no-verify
DB_HOST="$(node -e 'console.log(new URL(process.argv[1]).hostname)' "$DATABASE_URL")"

# 1. The demo login (skip if it already exists)
curl -s -X POST https://api.mcbuse.com/api/v1/auth/signup \
  -H 'content-type: application/json' \
  -d '{"email":"e.aci@mcbuse.com","password":"Pass123$1","firstName":"Aci","lastName":"Café","username":"aci_cafe"}'

# 2. Make it a merchant
pnpm merchant:provision -- --email e.aci@mcbuse.com --business-name "Aci Café"

# 3. Seed (about 1–1.5 hours; it can be re-run safely if it stops)
SEED_EMAIL=e.aci@mcbuse.com SEED_PASSWORD='Pass123$1' \
node scripts/seed-local-overview-demo.mjs \
  --api https://api.mcbuse.com/api/v1 --allow-host api.mcbuse.com \
  --database-url "$DATABASE_URL" --allow-db-host "$DB_HOST" \
  --mode sandbox --days 90 --digital-days 35 --volume 0.7 \
  --float-usdc 45 --full-profile \
  --manifest ./seed-manifest-aci.json
```

Early in step 3 the script prints a **Stripe test checkout link**. Open it and pay with a
Stripe test card (for example `4242 4242 4242 4242`, any future date, any CVC). The script
waits until the 45 test USDC has arrived, then carries on.

Then sign in at https://merchant.mcbuse.com as `e.aci@mcbuse.com`.

## Notes

- Deploy this branch's API and portal first, so the demo shows the new Payment,
  Inventory and Credit Assessment screens.
- Re-running is safe: finished sales are skipped, and the manifest (`seed-manifest-aci.json`,
  gitignored) records what was done. Keep it until the demo is over.
- Only this merchant's rows are changed by the SQL step. Every payment id is checked
  against the merchant before anything is moved, all in one transaction.
- Before launch: remove this merchant's data (see `docs/go-live-checklist.md` §2).
