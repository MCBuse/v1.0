# MCBuse — Fiat Top-up & Full Stablecoin Flow: Implementation Plan

> Generated: 2026-04-20  
> Status: **Awaiting approval — no code written yet**

---

## Step 1 — Exploration Summary

### 1a. Mobile (`apps/mobile`)

**Screens in `app/(flows)/top-up/`** — Three-screen flow: **index → confirm → success**. All exist and are wired end-to-end.
- `index.tsx`: Uses `AmountInput` component. Currency chips still show **USDC/EURC (stablecoins)** — not fiat USD/EUR. Uses `toBaseUnits` from `lib/currency`. Validates $1–$10,000.
- `confirm.tsx`: Calls `useInitiateOnramp()` from `features/onramp`. Shows Method / Time / Fee rows. Routes to success on completion. ✅ Correct.
- `success.tsx`: Uses `TransactionStatus` component, shows new balance. ✅ Correct.

**`app/topup.tsx`** (root level) — **ORPHAN / DEAD CODE.** Home screen routes to `/(flows)/top-up`, not `/topup`. This file has its own `useTopUp` hook from `features/payments` (wrong feature). Modified in a prior conversation to be fiat-first, but it is unreachable from any navigation path.

**`app/(tabs)/index.tsx`** — Home dashboard. 4 quick actions: Send → `/(flows)/send`, Receive → `/(flows)/receive`, Scan → `/(flows)/scan`, Top Up → `/(flows)/top-up`. Imports `useWallets()` from `features/wallet`. Balance cards split savings/spending by currency. Recent tx list (5 entries). ✅ Solid.

**`app/(tabs)/activity.tsx`** — **STUB.** "Coming soon" placeholder only. No data, no filters.

**`app/(flows)/scan.tsx`** — Full implementation: camera → QR decode → nonce resolution → review/amount → execute → success. ✅

**`app/(flows)/receive.tsx`** — Creates static payment request on mount, shows QR. Currency toggle is visual only (doesn't affect QR payload since static QR is currency-agnostic). ✅

**`app/(flows)/send/index.tsx`** — **INCOMPLETE.** Renders "Scan to pay" illustration + "Open Camera" CTA only. No direct username/phone P2P send.

**`app/(flows)/send/confirm.tsx`** — Handles both static and dynamic QR payment confirmation. Receives `nonce`, `amount`, `currency`, `recipientAddress`, `isStatic` as params. This is the QR payment review screen routed from scan.

**Missing screens (do not exist at all):**
- Swap (USDC ↔ EURC)
- Off-ramp / Cash out
- Internal transfer (savings → routine "Move")

**Duplicate feature modules:**

| Module | Used by | Schema |
|---|---|---|
| `features/wallet/` | Home screen, receive screen | `savings?`, `routine?` (both optional) |
| `features/wallets/` | Onramp models imports `balanceSchema` | `savings`, `routine` (both required — will throw if user has no wallets) |

Both call `GET /wallets` with the same React Query key `['wallets']`. Coherence hazard — two hooks with the same key but different return types and strictness.

**Mobile → API calls inventory:**

| API Call | Feature module | Screen |
|---|---|---|
| `GET /wallets` | `features/wallet` | Home, Receive |
| `POST /onramp` | `features/onramp` | Top-up confirm |
| `POST /payment-requests` | `features/payments` | Receive |
| `GET /payment-requests/resolve` | `features/payments` | Scan |
| `POST /payments` | `features/payments` | Scan, Send confirm |
| `GET /transactions` | `features/transactions` | Home (recent 5) |
| `POST /wallets/transfer` | **MISSING** | no screen |
| `POST /swap/preview`, `POST /swap` | **MISSING** | no screen |
| `POST /offramp` | **MISSING** | no screen |

---

### 1b. API (`apps/api/src`)

All modules registered in `AppModule`. All endpoints guarded with `VerifiedEmailGuard`.

| Module | Endpoints | Status |
|---|---|---|
| `WalletsModule` | `GET /wallets`, `GET /wallets/:type/balance`, `POST /wallets/transfer` | ✅ Complete |
| `OnRampModule` | `POST /onramp` | ✅ Mock works. Circle provider = `NotImplementedException` stub |
| `OffRampModule` | `POST /offramp` | ✅ Mock works. Circle provider = `NotImplementedException` stub |
| `SwapModule` | `POST /swap/preview`, `POST /swap` | ✅ Mock works. Jupiter provider untested |
| `PaymentsModule` | `POST /payments` | ✅ Mock + Solana provider |
| `PaymentRequestsModule` | `POST /payment-requests`, `GET /payment-requests/resolve`, CRUD | ✅ Complete |
| `NfcModule` | `POST /nfc/session`, `GET /nfc/resolve` | ✅ Complete (no mobile UI yet) |
| `TransactionsModule` | `GET /transactions`, `GET /transactions/summary` | ✅ Complete |
| `LedgerModule` | Internal service only | ✅ |
| `SolanaModule` | Keypair generation + SPL token balance | ✅ |

**Circle providers — both stubs:**
- `circle-onramp.provider.ts` — `throw new NotImplementedException(...)`. Comment references `POST /v1/payments` (Circle Payments API).
- `circle-offramp.provider.ts` — `throw new NotImplementedException(...)`. Comment references `POST /v1/payouts` (Circle Payouts API).

**No webhook handler exists** for async Circle settlement notifications.

---

### 1c. Shared packages

`@repo/shared` and `@repo/ui` are listed in CLAUDE.md but not imported anywhere in the mobile app. All shared logic lives in `apps/mobile/features/`, `apps/mobile/lib/`, and `apps/mobile/components/`. No packages migration needed.

---

### 1d. Circle account

The Circle MCP server is a **documentation-only tool** — it has no API access tools and cannot inspect actual Circle account state (no `list_wallets`, `get_balance`, etc.).

From documentation research:
- **Circle Mint** (institutional) is required for fiat → USDC/EURC conversion. Requires an approved business account with KYC/AML.
- **Circle Payments API** (`POST /v1/payments`) handles card/wire on-ramp — this is what `circle-onramp.provider.ts` intends to use.
- **Circle Payouts API** (`POST /v1/payouts`) handles bank/card off-ramp — this is what `circle-offramp.provider.ts` intends to use.
- No Circle wallet IDs are referenced in the codebase or `.env.example`. The architecture uses Solana custodial wallets managed by the API; Circle acts as the fiat rail only.

---

### 1e. Environment

From `.env.example`:

| Variable | Value | Status |
|---|---|---|
| `ONRAMP_PROVIDER` | `mock` | ✅ Works for demo |
| `OFFRAMP_PROVIDER` | `mock` | ✅ Works for demo |
| `SWAP_PROVIDER` | `mock` | ✅ Works for demo |
| `CIRCLE_API_KEY` | *(empty)* | ⚠️ Needed for Circle integration |
| `SOLANA_RPC_URL` | `https://api.devnet.solana.com` | ✅ |
| `SOLANA_KEYPAIR_ENCRYPTION_KEY` | `0000...000` (64 zeros) | 🔴 **Insecure placeholder** |

---

## Step 2 — Flow vs. Reality

### Flow A — On-ramp (fiat → savings wallet)
- **API**: ✅ Complete with mock. Circle stub exists but throws.
- **Mobile**: ✅ 3-screen flow works end-to-end. Minor issue: currency chips say USDC/EURC not USD/EUR in the amount entry screen.
- **Overall**: Works with mock. Circle integration pending.

### Flow B — Internal sweep (savings → routine)
- **API**: ✅ `POST /wallets/transfer` fully implemented.
- **Mobile**: ❌ **Entirely missing.** No screen, no feature module.
- **Overall**: API ready, mobile not started.

### Flow C — QR Payment (scan & receive)
- **API**: ✅ Full round-trip works.
- **Mobile**: ✅ Receive (static QR) + Scan (full flow) both work. Send screen just redirects to Scan — no standalone P2P by username/address.
- **Overall**: Works end-to-end for QR path.

### Flow D — Swap (savings wallet only)
- **API**: ✅ Preview + execute both work with mock.
- **Mobile**: ❌ **Entirely missing.** No screen, no feature module.
- **Overall**: API ready, mobile not started.

### Flow E — Off-ramp (savings → fiat)
- **API**: ✅ `POST /offramp` works with mock. Circle stub exists but throws.
- **Mobile**: ❌ **Entirely missing.** No screen, no feature module.
- **Overall**: API ready (mock), mobile not started.

---

## Step 3 — Wallet Rule Violations

| Rule | Status | Detail |
|---|---|---|
| On-ramp only to savings | ✅ | `onramp.service` loads `wallets['savings']` |
| Off-ramp only from savings | ✅ | `offramp.service` loads `wallets['savings']` |
| Swap only in savings | ✅ | `swap.service` loads `wallets['savings']` |
| P2P only from routine | ✅ | `payments.service` queries `type = 'routine'` |
| Payment requests linked to routine | ✅ | `payment-requests.service` uses `wallets['routine']` |
| Amounts as integers (no float) | ✅ DB / ⚠️ UI | `parseFloat(amount)` in `/(flows)/top-up/index.tsx` — UI validation only, not stored |
| Every change = two ledger entries | ⚠️ | On-ramp, off-ramp, swap write one entry with `debitWalletId === creditWalletId`. P2P correctly uses different wallet IDs. |
| Swaps = four ledger entries | ❌ | `swap.service` writes **one entry** for the debit currency only. Credit-side (received currency) has no dedicated entry. |
| Idempotency key unique constraint | ✅ | `.unique()` on `ledgerEntries.idempotencyKey` |
| Solana tx signature stored | ✅ | `solanaTxSignature` field in ledger entry |
| `reversed` status in state machine | ❌ | Not in schema. Schema has `pending \| completed \| failed` only. |
| `SOLANA_KEYPAIR_ENCRYPTION_KEY` non-zero | 🔴 | All-zeros placeholder — encrypted keypairs are trivially decryptable |

---

## Step 4 — Implementation Plan

### 4a. What to modify

| File | Current state | Change | Risk |
|---|---|---|---|
| `apps/mobile/app/(flows)/top-up/index.tsx` | Currency chips show USDC/EURC | Change chips to show USD/EUR; map to USDC/EURC before calling API. Replace `parseFloat` validation with string-safe alternative. | Low |
| `apps/mobile/app/(tabs)/activity.tsx` | "Coming soon" stub | Implement full paginated transaction list with type and currency filters | Low–Medium |
| `apps/mobile/features/wallet/` | Duplicate of `features/wallets/` with looser schema | **Consolidate into `features/wallets/`**. Update all imports (home screen, receive screen). Delete `features/wallet/`. | Medium |
| `apps/mobile/app/topup.tsx` | Orphan screen, unreachable from navigation | **Delete.** Dead code using a cross-feature hook. | Low |
| `apps/api/src/swap/swap.service.ts` | Writes one ledger entry for swap (debit currency only) | Add a second ledger entry for the credit side (`toCurrency`), debitWalletId = creditWalletId = savings | Low |
| `apps/mobile/app/(tabs)/index.tsx` | 4 quick actions, no entry points for Swap / Cash Out / Move | Add navigation entry points once new screens exist | Medium |

---

### 4b. What to create

**Mobile feature modules** (each: `models.ts`, `repository.ts`, `hooks.ts`, `index.ts`):

| Path | Purpose | Key exports |
|---|---|---|
| `apps/mobile/features/transfer/` | Internal wallet transfer | `useInternalTransfer()` → `POST /wallets/transfer` |
| `apps/mobile/features/swap/` | USDC ↔ EURC swap | `useSwapPreview()` → `POST /swap/preview`, `useExecuteSwap()` → `POST /swap` |
| `apps/mobile/features/offramp/` | Stablecoin → fiat cash out | `useInitiateOfframp()` → `POST /offramp` |

**Mobile screens:**

| Path | Purpose | Notes |
|---|---|---|
| `apps/mobile/app/(flows)/transfer/index.tsx` | Move money from savings to routine | Select currency, amount, confirm. Uses `useInternalTransfer()`. |
| `apps/mobile/app/(flows)/swap/index.tsx` | Swap USDC ↔ EURC | From/to selector, amount, live preview via `useSwapPreview()`, confirm execute. |
| `apps/mobile/app/(flows)/cashout/index.tsx` | Off-ramp stablecoin to fiat | Select currency, amount, destination stub, confirm. Uses `useInitiateOfframp()`. |

---

### 4c. Types needed

All types live inside mobile feature modules — no shared packages involved.

| Module | Types to define |
|---|---|
| `features/transfer/models.ts` | `TransferInput { fromWalletType, toWalletType, amount, currency }`, `TransferResponse { from, to, currency, amount, idempotencyKey }` |
| `features/swap/models.ts` | `SwapPreviewInput`, `SwapPreviewResponse { fromCurrency, toCurrency, fromAmount, toAmount, rate, fee, feeCurrency }`, `SwapExecuteInput`, `SwapExecuteResponse { ...preview, externalId, status, balances }` |
| `features/offramp/models.ts` | `OfframpInput { amount, currency, bankAccountRef? }`, `OfframpResponse { externalId, status, amount, currency, estimatedSettlement, balance }` |

---

### 4d. Environment variables needed

**For hackathon demo (mock providers):** No new variables needed.

**For real Circle integration (future):**

| Variable | Purpose |
|---|---|
| `CIRCLE_API_KEY` | Already in `.env.example`. Needs a real value. |
| `CIRCLE_ENTITY_SECRET` | Required by Circle developer-controlled wallets SDK |
| `CIRCLE_WALLET_SET_ID` | Treasury wallet set for on-ramp/off-ramp flows |

**Immediate security fix (regardless of Circle):**

| Variable | Action |
|---|---|
| `SOLANA_KEYPAIR_ENCRYPTION_KEY` | Must be changed to a real 32-byte random hex value **before** any production or live-demo use. If real user wallets already exist in the DB, changing this key will break decryption of existing keypairs — coordinate carefully. |

---

### 4e. Implementation order

```
1.  apps/mobile/features/wallets/               Consolidate wallet module. All subsequent
                                                features depend on correct wallet data hooks.

2.  apps/mobile/app/topup.tsx                   Delete orphan. Clean slate before adding
                                                new screens.

3.  apps/mobile/app/(flows)/top-up/index.tsx    Fix currency chips (USD/EUR not USDC/EURC).
                                                Small change, high user-facing impact.

4.  apps/mobile/features/transfer/              Transfer module (hooks/repo/models) before screen.

5.  apps/mobile/app/(flows)/transfer/index.tsx  Internal transfer screen. Depends on #4.

6.  apps/mobile/features/swap/                  Swap module before screen.

7.  apps/mobile/app/(flows)/swap/index.tsx      Swap screen. Depends on #6.

8.  apps/mobile/features/offramp/               Off-ramp module before screen.

9.  apps/mobile/app/(flows)/cashout/index.tsx   Cash-out screen. Depends on #8.

10. apps/mobile/app/(tabs)/index.tsx            Add navigation entry points for Transfer,
                                                Swap, Cash Out. Depends on #5, #7, #9.

11. apps/mobile/app/(tabs)/activity.tsx         Full transaction list. Benefits from all
                                                transaction types being reachable first.

12. apps/api/src/swap/swap.service.ts           Add second ledger entry for credit side of swap.
                                                Pure API fix, no mobile dependency.

13. apps/api/src/onramp/providers/              Circle on-ramp implementation.
    circle-onramp.provider.ts                   Only after Circle account confirmed. Not blocking
                                                hackathon.

14. apps/api/src/offramp/providers/             Circle off-ramp. Same as above.
    circle-offramp.provider.ts
```

---

### 4f. Open questions

**Q1 — Navigation entry points for Swap and Cash Out**
The home screen has 4 quick actions (Send, Receive, Scan, Top Up). Adding Move, Swap, and Cash Out is 7 total. Do you want a dedicated "Savings" section on the home screen with its own action row, or should these surface from tapping a balance card?

**Q2 — Internal transfer direction**
Is "Move" always one-directional (savings → routine) or should it support both directions? The API supports `fromWalletType / toWalletType` either way.

**Q3 — Off-ramp destination UI**
The API accepts an optional `bankAccountRef`. With the mock provider it is ignored. For the hackathon demo, should the Cash Out screen show a "linked bank account" stub (hardcoded), an empty card detail form, or just amount + currency + confirm?

**Q4 — `app/topup.tsx` deletion**
This file was modified in a prior session to be fiat-first, but it is dead code — the home screen never routes to `/topup`. Safe to delete?

**Q5 — `SOLANA_KEYPAIR_ENCRYPTION_KEY`**
Is the dev database currently populated with real user wallets (registered accounts)? If yes, changing this key from all-zeros will break decryption of their keypairs. Needs coordination before touching.

**Q6 — Circle integration scope**
Is real Circle fiat integration (card on-ramp, bank off-ramp) a hackathon deliverable, or is mock sufficient? Implementing Circle requires a verified Circle Mint business account and at least a day of API integration work.

---

### 4g. Risks and conflicts

| Risk | Severity | Detail |
|---|---|---|
| `features/wallet` vs `features/wallets` duplicate | Medium | Same React Query key `['wallets']`, different response schemas. Stricter schema in `features/wallets` will throw a Zod parse error if the user has no wallets — a real state during signup. |
| `app/topup.tsx` dead code + cross-feature hook | Low | Uses `useTopUp` from `features/payments` — misleading and differs from `features/onramp`. No navigation path reaches it, so no runtime impact. |
| Swap writes only one ledger entry | Medium | Credit side of a swap (received currency) produces no ledger entry. `transactions/summary` will undercount credited amounts for swap operations. Fixable without schema changes. |
| `SOLANA_KEYPAIR_ENCRYPTION_KEY = 0x00...00` | **High** | Any keypair encrypted with the zero key is trivially decryptable. Must be fixed before production or live-demo use. |
| `walletsResponseSchema` marks both wallets required | Medium | If a user has only one wallet (partial creation failure), the strict schema will throw and crash screens using `features/wallets`. Should be made optional with a clear error state. |
| No Circle webhook endpoint | Low (hackathon) | Async Circle settlements will never update DB state without a webhook handler. Irrelevant with mock provider; blocking for real Circle integration. |

---

## Step 5 — Approval gate

No code will be written until this plan is reviewed and approved.

After approval, implementation proceeds in the order from §4e.  
After completing each file, work stops for confirmation before proceeding to the next.
