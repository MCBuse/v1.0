# Go-live checklist

Items that exist only while the credit model is being tested and the hackathon
demo is running. Every one of them must be cleared before real merchants use
the platform.

Find everything tagged for removal:

```sh
grep -rn "GO-LIVE" --exclude-dir=node_modules --exclude-dir=dist .
```

## 1. Assumed credit inputs

- [ ] Delete `CREDIT_INPUT_DEFAULTS` (and its comment) from `deploy/cloud-run/api.env.yaml`.
- [ ] Remove `CREDIT_INPUT_DEFAULTS` from any local `.env` files and from `apps/api/.env.example`.
- [ ] In `apps/api/src/credit-assessment/credit-evidence.service.ts`, remove
      `CONFIGURABLE_INPUTS`, `configuredInputDefaults()`, the constructor warning and the
      `configured` handling in `build()`; delete `credit-input-defaults.spec.ts`.
      Alternatively replace the defaults with real measurements for each input.
- [ ] Confirm no saved assessment you intend to keep has `configured_input` provenance.

## 2. Seeded history

- [ ] Reset the production database. `--undo` only voids seeded cash sales: seeded digital
      sales are settled payments (with ledger entries and a seed customer account,
      `seed-payer-…@example.com`) and only a reset removes them.
- [ ] Seeded digital sales are recorded with evidence environment `test` unless the seeder
      ran with `--evidence-environment synthetic|live`. Relabel or remove them before any
      real assessment is shown to a lender.
- [ ] Archive/remove the seeded café products if the account is kept.
- [ ] Delete local `seed-manifest*.json` files.

## 3. Launch deploy

- [ ] Deploy with `MCBUSE_GO_LIVE=1 scripts/cloud-run/deploy.sh …` — the script refuses to
      deploy while `CREDIT_INPUT_DEFAULTS` is still in the env file.
- [ ] Check API logs: the `CREDIT_INPUT_DEFAULTS active` warning must not appear.
- [ ] Run an assessment for a real merchant and confirm unmeasured inputs show as unavailable.
