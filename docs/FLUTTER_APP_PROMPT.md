# MCBuse Flutter App — Full Project Context Prompt

> Copy everything below this line into the agent/team building the Flutter app. It is self-contained: no access to the original monorepo is required.

---

You are building **MCBuse**, a stablecoin-native consumer payments app (CashApp-style) in **Flutter**. It is a rebuild of an existing Expo/React Native app. The backend already exists and must not be changed — you are building a client against a fixed API contract described below.

## 1. Product Overview

MCBuse lets users hold, send, and receive money instantly using stablecoins on Solana, while the UI **never exposes crypto concepts**. Balances in USDC/EURC are always displayed as **USD/EUR** with `$`/`€` symbols — never show token tickers to users.

- **Custodial model**: the backend generates and holds all Solana keys. The app never signs transactions, never handles seed phrases, and has no on-device wallet.
- Every user has **two accounts** (two Solana wallets created automatically at signup):
  - **Routine Account** (`routine`) — spending account. All P2P payments (QR/NFC/username) go routine → routine.
  - **Holding Account** (`savings`) — savings account. On-ramp deposits land here; off-ramp (cash out) and currency swaps happen here. The API type is `savings`, but the UI always calls it "Holding".
- **Supported currencies**: exactly `USDC` and `EURC` (both 6 decimals). Displayed as "USD"/"$" and "EUR"/"€".
- **Money movement types** (ledger `type` enum): `on_ramp` (fiat → Holding), `off_ramp` (Holding → fiat), `internal` (Routine ↔ Holding), `p2p` (user → user), `swap` (USDC ↔ EURC inside Holding).
- **Ramps**: Top Up via Stripe Checkout (WebView); Cash Out via Stripe Connect Express payouts (primary) or MoonPay sell widget (secondary).
- **Payments**: QR codes and NFC both carry the same payload: `mcbuse://pay?nonce=<uuid>&v=1[&amount=<baseUnits>&currency=<USDC|EURC>]`. Payment execution is always `POST /payments` with the nonce.

## 2. Critical Domain Rules (non-negotiable)

1. **All monetary amounts are strings of integer base units, 6 decimals.** `"1000000"` = 1.00 USD. Requests send base-unit strings; responses return base-unit strings. **Never use doubles/floats for money.** Use `BigInt` for all arithmetic and format only at the display layer.
2. Fiat amounts for ramp sessions (`fiatAmount`) are **decimal strings** (e.g. `"25.00"`), not base units. Everything else is base units.
3. User-entered amounts must be **cent-denominated** (multiples of 10,000 base units) and ≥ 0.01.
4. The API uses **strict validation**: any unknown field in a JSON body returns HTTP 400. Send exactly the documented fields.
5. Error envelope for all failures:
   ```json
   { "statusCode": 400, "message": "string or string[]", "timestamp": "...", "correlationId": "...", "path": "..." }
   ```
   `message` may be an array (validation errors). You may send an `x-correlation-id` header for tracing; the server echoes/generates one.
6. **No push notifications or WebSockets exist.** All status updates are done by **polling** (intervals noted per flow below).
7. DB balances are the source of truth. On-chain Solana details (tx signatures, pubkeys) are displayed but never computed client-side.

## 3. Backend API Contract

- **Base URL**: `https://mcbuse-api.fly.dev/api/v1` (production), `http://<lan-host>:4000/api/v1` (local dev). All paths below are relative to the base.
- **Swagger UI** available at `/api/docs` on the same host.
- **Auth**: `Authorization: Bearer <accessToken>` on every request except public ones.
  - Access token: JWT, **15 min** expiry. Refresh token: **7 days**, **rotating** — every `POST /auth/refresh` returns a *new pair* and immediately revokes the old refresh token. Always persist the newly returned pair atomically.
  - On any 401 (except from `/auth/refresh` itself): perform a **single-flight refresh** (dedupe concurrent 401s into one refresh call), then replay the failed request. If refresh fails: clear the session and route to the auth stack.
  - Store tokens in **secure storage** (Keychain/Keystore via `flutter_secure_storage`). Nothing else needs persistence.
8. Routes marked "Verified" additionally require a verified email; the server currently auto-verifies at signup, but handle a 403 `"Email verification required..."` defensively (show a blocking message).

### 3.1 Auth (public unless noted)

| Endpoint | Body | Response |
|---|---|---|
| `POST /auth/signup` | `{ email? , phone?, password, firstName, lastName, username }` — email XOR phone required; phone E.164 `/^\+?[1-9]\d{6,14}$/`; password min 8 with upper+lower+digit+special; username `/^[a-z0-9_]{3,30}$/` | 201 `{ accessToken, refreshToken }`; 409 on username conflict includes `suggestions[]` |
| `POST /auth/login` | `{ email, password }` | `{ accessToken, refreshToken }` |
| `POST /auth/login/phone` | `{ phone, password }` | `{ accessToken, refreshToken }` |
| `POST /auth/refresh` | `{ refreshToken }` | new `{ accessToken, refreshToken }` (rotation) |
| `POST /auth/logout` (JWT) | `{ refreshToken }` | 204 |
| `POST /auth/forgot-password` | `{ email? }` or `{ phone? }` | 204 always (anti-enumeration) |
| `POST /auth/reset-password` | `{ email?/phone?, code (6 digits), newPassword }` | 204; 400 `Invalid or expired reset code` |
| `POST /auth/phone/send-otp` (JWT) | `{ phone }` | 204 |
| `POST /auth/phone/verify-otp` (JWT) | `{ phone, code (6) }` | 204 |

Failed logins: 10 attempts → account locked 30 minutes. OTP provider is mock in dev — code `123456` always passes outside production.

### 3.2 Users

| Endpoint | Notes |
|---|---|
| `GET /users/username-availability?username=` (public) | `{ username, available, suggestions[] }` — debounce ~350ms while typing |
| `GET /users/me` (JWT) | `{ id, email, phone, pendingPhone, username, primaryCurrency ('USDC'\|'EURC'), firstName, lastName, isEmailVerified, isPhoneVerified, isActive, createdAt, updatedAt }` |
| `PATCH /users/me` (JWT) | body `{ username?, primaryCurrency? }`; 409 + suggestions on conflict |
| `GET /users/resolve-username?username=` (JWT) | `{ username, displayName }`; 404 if unknown/inactive |

### 3.3 Wallets & Transactions (JWT + Verified)

| Endpoint | Notes |
|---|---|
| `GET /wallets` | `{ savings: {...}, routine: {...} }`, each `{ id, userId, type, solanaPubkey, isActive, createdAt, balances: [{ currency, available, pending }] }` (amounts are strings) |
| `GET /wallets/:type/balance?currency=USDC` | type ∈ `savings|routine` → `{ currency, available, pending }` |
| `POST /wallets/transfer` | `{ fromWalletType, toWalletType, amount, currency }` (types must differ) → `{ from, to, currency, amount, idempotencyKey }` |
| `GET /transactions` | query: `walletType?`, `currency?`, `type?` (`on_ramp\|off_ramp\|internal\|p2p\|swap`), `from?`/`to?` (ISO), `limit?` (1–100, default 20), `offset?` → `{ data: LedgerEntry[], limit, offset }` |
| `GET /transactions/summary?walletType=` | `{ summary: { [currency]: { credited, debited } } }` |

`LedgerEntry`: `{ id, debitWalletId, creditWalletId, amount, currency, direction ('credit'|'debit'|'neutral'), type, status ('pending'|'completed'|'failed'), solanaTxSignature?, paymentRequestId?, idempotencyKey, metadata, createdAt }`. Derive display direction by comparing debit/credit wallet IDs against the user's own wallet IDs.

### 3.4 Payment Requests & Payments (JWT + Verified)

| Endpoint | Notes |
|---|---|
| `POST /payment-requests` | `{ type: 'static'\|'dynamic', amount? (base-unit string), currency? (required for dynamic), description? (≤100), lineItems? (1–50 of { name (1–60), quantity (1–999), unitAmount (base-unit string) }), expiresInSeconds? (30–86400, dynamic only, default 300) }` → sanitized request + `qrString` |
| `GET /payment-requests?status=&type=&limit=&offset=` | list own requests |
| `GET /payment-requests/resolve?nonce=` | request + `creatorWallet { id, solanaPubkey, type }` + `recipient { username, displayName }`; 400 if not pending/expired |
| `GET /payment-requests/:id` | owner only — used to poll invoice status |
| `POST /payment-requests/:id/cancel` | → `{ id, status: 'cancelled' }` |
| `POST /payments` | `{ nonce (uuid), amount?, currency? }` — amount+currency required for **static** requests, omitted for **dynamic** → `{ txSignature, amount, currency, payerWalletId, payeeWalletId, idempotencyKey, paymentRequestId }` |
| `POST /payments/username` | `{ username (with/without @), amount, currency }` → same + `recipient { username, displayName }` |

Rules: static requests never expire and are reusable (stay `pending`); dynamic requests are one-shot and expire (default 300s). Statuses: `pending | completed | expired | cancelled`. QR payload: `mcbuse://pay?nonce=<uuid>&v=1[&amount&currency]`. Self-payment is rejected. Payer always pays from **Routine**; requests are always created against the creator's **Routine** wallet.

### 3.5 NFC (backend ready — client is greenfield)

| Endpoint | Notes |
|---|---|
| `POST /nfc/session` (JWT + Verified) | `{ amount, currency, description?, expiresInSeconds? (10–3600, default 60) }` → `{ id, nonce, nfcPayload, qrString, amount, currency, description, expiresAt }` |
| `GET /nfc/resolve?nonce=` (public — nonce is the secret) | same shape as payment-request resolve + `nfcPayload` |

`nfcPayload` is the `mcbuse://pay?...` URI, intended as an **NDEF URI record**. Flow: merchant creates session → emulates/writes NDEF → payer reads tag → parse nonce → resolve → confirm → `POST /payments { nonce }`. See §8 for Flutter guidance.

### 3.6 Onramp — Top Up (JWT + Verified)

| Endpoint | Notes |
|---|---|
| `POST /onramp/sessions` | `{ provider?: 'stripe' (default) \| 'moonpay', fiatAmount (decimal string), fiatCurrency: 'USD'\|'EUR' }` → `{ provider, widgetUrl, transactionId, internalReference }`. MoonPay enforces min €20 |
| `GET /onramp/transactions/:id` | poll every ~3s → `{ id, provider, status, fiatAmount, fiatCurrency, cryptoAmount, cryptoCurrency, network, walletAddress, txHash, createdAt, updatedAt }` |
| `GET /onramp/transactions?limit=` | history (1–50) |

Statuses: `pending | processing | completed | failed | cancelled | expired`. Flow: create session → open `widgetUrl` in a WebView → intercept any navigation to `mcbuse://` (the API redirects to `mcbuse://onramp/complete` or `mcbuse://onramp/cancel`) → close WebView → poll transaction until terminal. Funds land in **Holding** as USDC. (Legacy `POST /onramp` exists for mock/direct flows — do not use.)

### 3.7 Offramp — Cash Out (JWT + Verified)

| Endpoint | Notes |
|---|---|
| `POST /offramp/stripe/onboarding-link` | → `{ url, expiresAt }` — Stripe Connect Express onboarding; open in system browser/auth session with return deep link `mcbuse://offramp/connect/return` |
| `GET /offramp/stripe/account-status` | `{ accountId, payoutsEnabled, detailsSubmitted, requirementsDue[] }` — gate Cash Out on `payoutsEnabled` |
| `POST /offramp/sessions` | `{ provider?: 'stripe' (default) \| 'moonpay', cryptoAmount (base-unit string), cryptoCurrency?: 'USDC', fiatCurrency?: 'USD'\|'EUR' (Stripe = USD only) }` |
| `POST /offramp/sessions/:id/signature` | `{ url }` → `{ signature }` — MoonPay widget URL signing round-trip |
| `POST /offramp/sessions/:id/deposit` | MoonPay only: `{ transactionId, cryptoCurrencyCode, cryptoCurrencyAmount, cryptoCurrencyAmountSmallestDenomination, depositWalletAddress, depositWalletAddressTag?, fiatCurrencyCode?, fiatCurrencyAmount? }` → `{ depositId }` (backend sends the USDC on-chain from custody) |
| `GET /offramp/transactions/:id` | poll every ~3s |
| `GET /offramp/transactions?limit=` | history |

Session response shapes: **stripe** → `{ transactionId, internalReference, provider, stripePayoutId, stripeTransferId, depositTxHash, fiatAmount, fiatCurrency, status }` (no checkout step — go straight to a polling status screen). **moonpay** → `{ transactionId, internalReference, provider, environment, params: { apiKey, baseCurrencyCode, baseCurrencyAmount, lockAmount, quoteCurrencyCode, refundWalletAddress, externalTransactionId, externalCustomerId } }` (feed into the MoonPay sell widget).

Statuses: `pending | waiting_for_deposit | deposit_submitted | processing | completed | failed | cancelled | requote_required | refund_pending`. Session creation reserves funds (`available → pending` on the Holding balance); failure/cancel releases them. Show the MoonPay `trackerUrl` as an external link when present.

### 3.8 Swap & Rates

| Endpoint | Notes |
|---|---|
| `POST /swap/preview` (JWT + Verified) | `{ fromCurrency, toCurrency, fromAmount }` (currencies differ) → `{ fromCurrency, toCurrency, fromAmount, toAmount, rate, fee, feeCurrency, rateDisplay }` — call live as the user types (debounce recommended) |
| `POST /swap` (JWT + Verified) | same body → adds `{ externalId, status, balances: { [from]: {...}, [to]: {...} } }` |
| `GET /rates` (public) | snapshot of USDC↔EURC / USD↔EUR / USD↔GHS pairs `{ from, to, rate, inverseRate, updatedAt }` |
| `GET /rates/preview?from=&to=&amount=&feePct=` (public) | generic rate preview |

Swap operates on the **Holding** account only. Rates come from ECB (refreshed every 30 min server-side); fee is currently 0 in mock mode, up to 0.5% otherwise — always render the fee returned by preview.

## 4. App Structure & Screens

Navigation model (mirror this in `go_router` or equivalent): a root redirect, a **guest stack**, a **3-tab main shell**, and a **modal flows stack** that slides up over the tabs.

**Boot redirect**: not onboarded → Onboarding; not authenticated → Auth; else → Tabs. (In the RN app the onboarding flag is deliberately not persisted and replays each cold start — decide whether to keep or persist it.)

### Guest stack
1. **Onboarding** — 3 swipeable slides ("Send & receive instantly", "Tap or scan to pay", "Routine + Holding, separated") with dots, Skip, Next/Get Started.
2. **Auth landing** — logo, tagline, social buttons (Apple/Google/Facebook — currently non-functional stubs; keep as stubs or omit), "Continue with Email or Phone", Sign up link.
3. **Login** — email/phone segmented toggle, password with visibility toggle, forgot-password link. Success → OTP screen (see gate note below).
4. **Register** — full name (split first/last), username with live availability + tappable suggestions, email/phone toggle, password + confirm. Success → OTP screen.
5. **OTP** — 6-box input with SMS autofill, auto-submit, 60s resend countdown. **Current RN behavior: tokens from login/signup are held "pending" and only committed to secure storage after entering the dev code `123456` (client-side check; resend is a no-op).** Replicate this dev gate or wire the real `POST /auth/phone/send-otp` / `verify-otp` pair — flag the decision.
6. **Forgot / Reset password** — identifier → 204 → code + new password screen with resend.

### Tabs
1. **Home** — greeting + first name, avatar initial; horizontal snap carousel of two **black account cards** (Routine, Holding) each listing USD/EUR balance rows (primary currency always; the other only if balance > 0); quick actions **Send / Receive / Invoice / Scan / Top Up**; a "HOLDING ACCOUNT" panel with **Move / Swap / Cash Out**; Recent Activity (last 5 ledger entries with type labels: Top Up, Withdrawal, Received, Sent, Swap, Transfer; +/− amounts; status badges); pull-to-refresh; skeleton loaders and empty states.
2. **Activity** — full transaction list (limit 50) with filter chips: All / Top Ups (`on_ramp`) / Payments (`p2p`) / Swaps / Transfers (`internal`) / Cash Out (`off_ramp`) mapped to the `type` query param.
3. **Profile** — avatar, name, @username, share username via native share sheet, primary currency row, Edit Profile. **Add a Sign Out button** (the RN app forgot one — call `POST /auth/logout` with the refresh token, clear secure storage regardless of API result).

### Modal flows
1. **Send** — step 1: recipient by @username (resolve) or "Scan QR"; step 2: currency toggle + full-screen number pad → `POST /payments/username`; step 3: success ("$X sent to @user", Done / Send More).
2. **Scan** — camera QR scanner (permission gate, finder overlay, haptic on detect). Parse nonce from `mcbuse://pay?...` (fallback: bare UUID). Resolve → dynamic: review screen (recipient, amount, description, line items) → Confirm & Pay `POST /payments { nonce }`; static: amount entry → `POST /payments { nonce, amount, currency }` → success.
3. **Receive** — auto-create one **static** payment request on open; show its QR (`qrString`) with currency badge; Routine Solana address row (truncated `AbCdEf…UvWxYz`, tap = share/copy); links to Invoice.
4. **Invoice** — dynamic request builder: currency toggle; "Total only" vs "Line items" mode (name, qty stepper 1–999, unit price, live subtotal via BigInt); optional note; Generate → QR screen with **live status polling every 2s** (`GET /payment-requests/:id`) showing Awaiting payment / Paid / Expired / Cancelled; Share, Cancel Invoice, New Invoice. Default expiry 300s.
5. **Top Up** — currency chips, amount input, quick chips 25/50/100/250, min $20 / max $10,000, summary card → create Stripe session → **WebView checkout** (intercept `mcbuse://` navigations) → **status screen polling 3s** with friendly status copy and 5-min soft timeout.
6. **Cash Out** — show Holding USDC available + Max; if Stripe `payoutsEnabled` false, show onboarding card → open onboarding link in in-app browser/auth session, refetch status on return; amount + payout currency → create session → Stripe: straight to status screen; MoonPay: sell widget with URL-signing round-trip and deposit confirmation dialog → status screen (rich status map incl. `waiting_for_deposit`, `requote_required`, `refund_pending`; external tracker link).
7. **Swap** — Holding USD ↔ EUR with flip button, live preview on input, receive-amount/rate/fee rows, number pad → execute → success.
8. **Move (Transfer)** — Routine ↔ Holding, direction flip, currency chips, number pad → `POST /wallets/transfer` → success.
9. **Profile Edit** — username (availability check + suggestions) and primary currency chips → `PATCH /users/me`.

## 5. Design System

CashApp-inspired, aggressively monochrome. Light + dark themes following system.

- **Palette**: black `#000000`, white `#FFFFFF`, 10-step gray ramp (`#F5F5F5` → `#0D0D0D`); semantic red `#FF3B30`, orange `#FF9500`, blue `#007AFF`. Light theme: brand = black, background white, secondary background `#F5F5F5`; success is rendered **black** (monochrome), error/warning keep semantic colors. Dark theme inverts (brand = white). **Account cards are always black with white text in both themes.**
- **Typography**: IBM Plex Sans (400/500/600/700). Variants: display 52/56 bold, h1 28, h2 22 semibold, h3 18 semibold, body 16, caption 13, label 11.
- **Spacing**: 4/8/12/16/20/24/32…80. **Radii**: 4→28, pill 9999. Buttons 40/52/56 tall, inputs 52.
- **Key components to build**: pill Button (primary black / secondary / ghost, loading state), Input with label/error/hint, international PhoneInput (E.164 output), **full-screen NumPad** (large amount display, 3×4 grid, backspace, 2-decimal cap, haptic feedback per key, primary + secondary pill actions), AmountInput (NumPad + USD/EUR pill toggle), 6-box OtpInput with SMS autofill, Avatar (initials + deterministic color hash), Card, ListItem, Badge, BottomSheet, QRDisplay (QR + truncated address), full-screen TransactionStatus (pending/success/error).
- **Icons**: iconsax-style linear icons (use `iconsax_flutter` or closest equivalent). Haptics on numpad keys, tab presses, QR detection.

## 6. Flutter Architecture Guidance

- **HTTP**: `dio` with an auth interceptor implementing the single-flight refresh described in §3. Base URL from `--dart-define` (`API_BASE_URL`), defaulting to the LAN dev URL in debug and `https://mcbuse-api.fly.dev/api/v1` in release.
- **Tokens**: `flutter_secure_storage`; hydrate before first frame decision (splash gate) to avoid flashing the guest stack.
- **State**: Riverpod (or Bloc) with a repository layer per feature (auth, users, wallets, transactions, payments, onramp, offramp, swap). Parse every response into typed models (`freezed` + `json_serializable`); validate enums strictly.
- **Money**: a single `Money` utility built on `BigInt` — parse base-unit strings, format with 2 display decimals, convert display → base units. No doubles anywhere near amounts.
- **Routing**: `go_router` with a redirect guard (auth state), a `StatefulShellRoute` for tabs, and a modal route group for flows. Register the `mcbuse://` scheme (iOS URL Types + Android intent filter) and implement routes for: `mcbuse://pay?nonce=` (open scan/confirm flow — the RN app lacked this; add it), `mcbuse://onramp/complete`, `mcbuse://onramp/cancel`, `mcbuse://offramp/connect/return`, `mcbuse://offramp/connect/refresh`.
- **QR**: `mobile_scanner` for scanning; `qr_flutter` for rendering.
- **WebView**: `webview_flutter` for Stripe Checkout with navigation interception of `mcbuse://` URLs. Stripe Connect onboarding via `flutter_web_auth_2`/custom-tab with the return deep link.
- **MoonPay**: MoonPay ships an official Flutter sell/buy SDK — prefer it and wire `onInitiateDeposit` → `POST /offramp/sessions/:id/deposit` and URL signing → `POST /offramp/sessions/:id/signature`. If the SDK is unsuitable, replicate with a WebView: build the sell widget URL from `params`, get it signed by the API, intercept the deposit event.
- **Polling**: simple periodic providers/timers — invoice 2s, onramp/offramp status 3s, stop on terminal states, soft timeout messaging at ~5 min.

## 7. Environment / Config

Only two client config values exist:

- `API_BASE_URL` — e.g. `http://192.168.x.x:4000/api/v1` (dev), `https://mcbuse-api.fly.dev/api/v1` (prod)
- `ONRAMP_REDIRECT_URL` — `mcbuse://onramp/complete` (must match the API's `APP_REDIRECT_URL`)

Permissions: Camera (QR), NFC (Android `android.permission.NFC`; iOS Near Field Communication Tag Reading entitlement + `NFCReaderUsageDescription`), Internet. Android dev builds may need cleartext HTTP for the LAN API.

## 8. NFC (greenfield feature)

The RN app never implemented NFC despite advertising it; the backend contract (§3.5) is ready. Design for Flutter:

- **Payer (read)**: `nfc_manager` — read NDEF URI record, parse `mcbuse://pay?nonce=...`, then reuse the exact QR confirm/pay flow (`GET /nfc/resolve` or `/payment-requests/resolve` → `POST /payments`). Works on iOS (CoreNFC, iPhone 7+) and Android.
- **Merchant (present)**: create session via `POST /nfc/session` (60s TTL) and present via Android **HCE** (e.g. `nfc_host_card_emulation`-style plugin emulating an NDEF tag). **iOS cannot do HCE** — on iOS the merchant path falls back to showing the QR (`qrString` is returned by the same endpoint). Show a countdown matching `expiresAt` and recreate the session on expiry.

## 9. Known Quirks / Decisions Carried From the RN App

1. **OTP gate**: client-side `123456` dev gate; pending tokens committed only after OTP. Keep the pending-token pattern; make the dev bypass config-driven.
2. **No sign-out existed** — add it (Profile).
3. Onboarding replays every cold start (flag intentionally not persisted) — decide and document.
4. Social auth buttons and ToS/Privacy links are stubs.
5. Home notification bell is decorative (no notifications system exists).
6. There were two conversion helper implementations (float and BigInt) — implement **only** BigInt.
7. The RN app had a legacy duplicate Receive screen and unused legacy endpoints (`POST /onramp`, `POST /offramp` direct) — do not carry these over.
8. `mcbuse://pay` had no OS-level deep-link route (QRs only worked via the in-app scanner) — fix this in Flutter (§6).
9. Swap preview fired on every keystroke without debounce — add ~300ms debounce.
10. No KYC flow exists anywhere; do not invent one.
11. Wallet naming: API `savings` = UI "Holding" everywhere.

## 10. Definition of Done (initial release parity)

- Auth: signup, login (email + phone), OTP gate, forgot/reset password, token refresh with rotation, sign out.
- Home with live balances (both accounts, both currencies), recent activity, pull-to-refresh.
- P2P: send by username, static receive QR, dynamic invoice with line items + live status, QR scan & pay (static + dynamic).
- Ramps: Stripe Top Up end-to-end (WebView + polling), Stripe Connect Cash Out (onboarding gate + session + polling), MoonPay Cash Out (widget + signing + deposit + polling).
- Swap and Routine↔Holding transfer.
- Activity list with filters; profile view/edit.
- Deep links registered and handled; dark mode; haptics; loading skeletons; empty and error states with the API error envelope surfaced sensibly.
- NFC: payer tag-read on iOS+Android; merchant HCE on Android with QR fallback on iOS (may ship behind a feature flag).
