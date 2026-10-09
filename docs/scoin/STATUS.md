# Scoin Store — Status Report

> Audited: 2026-10-08  
> Auditor: Claude (automated audit of `apps/mobile/` and `apps/api/`)

---

## 1. Stack

| Layer | Technology |
|---|---|
| Framework | Expo SDK 54, React Native 0.81.5 (new architecture) |
| Language | TypeScript (strict) |
| Navigation | expo-router v6 (file-based), @react-navigation/bottom-tabs |
| State (client) | Zustand v5 |
| State (server) | @tanstack/react-query v5 |
| Styling | @shopify/restyle v2 (typed theme system) |
| Networking | Axios with JWT interceptors, automatic token refresh |
| Validation | Zod v3 + react-hook-form v7 |
| Storage | expo-secure-store (tokens), no offline persistence layer |
| Tests | **None** — no test framework installed, zero test files |
| CI | **None** — no GitHub Actions or CI config |
| Target platforms | Android (prebuilt), iOS (Expo managed), Web (partial) |
| Build | `npx expo start`, EAS Build profiles (dev/preview/prod) |
| Blockchain | Solana Devnet (USDC + EURC via SPL tokens, custodial) |
| Backend | NestJS + Drizzle ORM + PostgreSQL at `apps/api/` |

### How to run

```bash
cd apps/mobile
pnpm install
npx expo start          # dev server
npx expo run:android    # native Android
```

---

## 2. Structure

```
apps/mobile/
  app/                    # Expo Router screens
    (guest)/              # Onboarding + auth (login, register, OTP, reset)
    (tabs)/               # 4 tabs: Home, Activity, Profile, Store
    (flows)/              # Modal flows: send, receive, scan, invoice,
                          #   top-up, transfer, swap, cashout, receipt
  components/ui/          # 15+ reusable components (Button, Card, Input, etc.)
  features/               # Domain modules (repository pattern)
    auth/ wallets/ transactions/ payments/ transfer/ swap/ onramp/ offramp/ users/
  hooks/                  # useNetworkStatus, useColorScheme, useThemeColor
  lib/
    api/                  # Axios client, auth session, error handling, QueryClient
    currency.ts           # Amount formatting, base-unit conversions
    validation/           # Zod schemas
  store/                  # Zustand: onboarding flag, auth state
  theme/                  # Restyle tokens, light/dark themes
```

---

## 3. Feature Inventory — Scoin Store

| # | Feature (from spec §3.2) | Status | Evidence |
|---|---|---|---|
| 3.2a | Browse & discover stablecoins | **Stub** | `app/(tabs)/explore.tsx` — static list of 2 hardcoded assets (USDC, EURC). No filtering, no detail page, no backend integration. |
| 3.2b | Issuance flow (issuer-facing) | **Missing** | Backend has full issuer submission workflow (`apps/api/src/issuers/`). Mobile app has **zero issuer screens** — no create/edit submission, no status tracking, no compliance states. |
| 3.2c | Consumption flow | **Missing** | No way to select a stablecoin from the Store and add it to wallet/payment flow. Payments hardcoded to USDC/EURC. |
| 3.2d | Compliance surface | **Missing** | Backend has status enums (draft → in_review → approved/rejected/needs_changes). Mobile shows nothing. |
| 3.2e | Wallet & balance integration | **Partial** | Wallet exists with USDC/EURC balances. No connection to Store registry. |
| 3.2f | Role-aware navigation | **Missing** | No role detection, no issuer vs. user vs. fintech navigation. Single user role assumed. |

---

## 4. Feature Inventory — Offline Payment

| # | Feature (from spec §3.3) | Status | Evidence |
|---|---|---|---|
| 3.3-M1/2 | Poor/intermittent connectivity (local queue + sync) | **Missing** | No outbox, no local storage of pending payments, no sync mechanism. Only: React Query pauses when offline. |
| 3.3-M3 | No-internet (QR/NFC → SMS instruction) | **Missing** | No SMS transport, no payment instruction format, no compact encoding. |
| 3.3a | Signed payment instruction format | **Missing** | No client-side signing. All crypto is server-side custodial. |
| 3.3b | Local encrypted outbox | **Missing** | No outbox pattern anywhere. |
| 3.3c | Connectivity modes (online/poor/offline) | **Stub** | `useNetworkStatus` returns boolean connected/disconnected. No tri-state. No mode switching. |
| 3.3d | OfflineBanner | **Partial** | `OfflineBanner.tsx` shows red banner when disconnected. No mode indicator, no manual override. |
| 3.3e | QR exchange for offline payment | **Partial** | QR generation and scanning exist for online payments (`app/(flows)/receive.tsx`, `scan.tsx`). Not adapted for offline instruction exchange. |
| 3.3f | NFC exchange | **Stub** | `react-native-nfc-manager` installed, Android permission declared. Zero NFC code in mobile source. Backend has NFC session endpoints. |
| 3.3g | SMS instruction transport | **Missing** | No SMS sending capability. Twilio is backend-only for OTP. |
| 3.3h | Payment states (pending/syncing/settled/failed) | **Partial** | Transaction model has pending/completed/failed. No "syncing" or offline-specific states. |

---

## 5. Backend & Chain Integration

| What | Status |
|---|---|
| Blockchain target | **Solana Devnet** (confirmed in code: devnet RPC, devnet mints) |
| Token standard | SPL Token (transferChecked instruction) |
| Wallet model | **Custodial** — keys generated and encrypted server-side (AES-256-GCM), stored in DB |
| Supported currencies | USDC + EURC only (hardcoded in DTOs, schema enums, mobile UI) |
| Issuer API | **Fully implemented** — CRUD submissions, review workflow, public registry endpoint |
| Payment API | **Fully implemented** — QR/NFC/username-based P2P, idempotency, ledger |
| NFC API | **Fully implemented** — session creation, nonce resolution |
| Registry API | `GET /registry/stablecoins` — returns published stablecoins (public, no auth) |
| Offline support (API) | **None** — no sync endpoints, no instruction verification |
| SMS transport (API) | **None** — Twilio used only for OTP |

---

## 6. Quality Baseline

| Check | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | **Pass** — zero errors |
| ESLint | **Pass** — 0 errors, 7 warnings (unused imports, import order) |
| Tests | **N/A** — no test framework, zero test files |
| Build (Expo) | Assumed working (EAS profiles configured, Android prebuilt present) |

---

## 7. Risks and Tech Debt

1. **No tests at all.** No jest, no testing-library, no detox. Adding a test framework is prerequisite for any signing/outbox/idempotency work.
2. **`.env` committed to git** — contains developer LAN IP. Should be in `.gitignore`.
3. **`debug.keystore` committed** — Android debug key in repo (low risk but bad practice).
4. **No i18n** — all strings hardcoded in English. Adding i18n structure is needed for Francophone markets.
5. **Custodial-only model** — all signing is server-side. Client-side signing for offline payments requires a new key management approach.
6. **Hardcoded devnet mints** in explore screen and API transfer provider.
7. **Duplicate `receive.tsx`** at root and in `(flows)/` — potential routing conflict.
8. **No offline persistence** — React Query cache is in-memory only.
9. **Web token storage is in-memory** — tokens lost on reload (known, low priority for mobile-first).

---

## 8. Gaps Against Architecture (PDFs not available)

> **Note:** The four architecture PDFs (`mcbuse_eternal_visual_architecture.pdf`, `mcbuse_eternal_scale_architecture.pdf`, `MCBuse Offline Payment Concept.pdf`, `MCBuse Business & Revenue Model.pdf`) were **not found** in `docs/scoin/` or anywhere in the repo. Gap analysis against the PDFs cannot be completed until they are provided.

**Gaps derivable from the email spec alone:**

1. No Scoin Store browse/discover with filtering, search, detail pages
2. No issuer submission flow on mobile
3. No compliance status display
4. No consumption flow (Store → wallet → payment)
5. No offline payment infrastructure (outbox, signing, sync, SMS)
6. No role-aware navigation (issuer vs. user vs. fintech vs. merchant)
7. No connectivity tri-state (online/poor/offline)
8. No demo mode
9. No analytics event capture for Store or offline activity
10. No i18n structure
11. Registry stablecoins disconnected from payment system (hardcoded USDC/EURC only)
