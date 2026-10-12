# Scoin Store — Implementation Plan

> Created: 2026-10-08  
> Deadline: 2026-10-12 23:59 PDT (~4 days)  
> Event: Crypto World's Fair Hackathon (Colosseum)

---

## Priority approach

Given the 4-day deadline, the plan prioritises a **demo-able end-to-end story** over feature breadth. Each phase is a vertical slice that can be demoed independently. Phases are ordered by dependency and demo impact.

---

## Phase 0: Green Baseline + Test Setup
**Size: S (2–3 hours) | Blocked by: nothing**

| Task | Files | Acceptance |
|---|---|---|
| 0.1 Install jest + @testing-library/react-native | `package.json`, `jest.config.js` | `pnpm test` runs and exits clean |
| 0.2 Fix lint warnings (unused imports, import order) | `app/(flows)/cashout/checkout.native.tsx`, `app/(flows)/send/success.tsx`, `app/(guest)/auth/index.tsx`, `app/receive.tsx` | 0 warnings |
| 0.3 Add `.env` to `.gitignore` | `.gitignore`, remove committed `.env` | `git status` shows no `.env` |
| 0.4 Set up basic i18n structure | `lib/i18n/`, `lib/i18n/en.ts`, `lib/i18n/index.ts` | All new user-facing strings go through `t()` |
| 0.5 Create `lib/money.ts` with integer-safe amount type | `lib/money.ts` | Unit test: no float ops on amounts |

---

## Phase 1: Domain & Data Layer
**Size: M (3–4 hours) | Blocked by: Phase 0**

| Task | Files | Acceptance |
|---|---|---|
| 1.1 Stablecoin model (Zod): id, name, ticker, network, contractAddress, issuer, complianceStatus, currency, decimals, reserveDisclosure, attestationUrl | `features/scoin-store/models.ts` | Types match API registry response |
| 1.2 Issuer model: org name, slug, verificationStatus, lifecycleStatus | `features/scoin-store/models.ts` | Types match API issuer profile |
| 1.3 Compliance status enum: draft, in_review, needs_changes, approved, rejected, published, delisted | `features/scoin-store/models.ts` | State machine documented |
| 1.4 Repository: fetchRegistry, fetchSubmissions, createSubmission, updateSubmission, submitForReview | `features/scoin-store/repository.ts` | Calls real API endpoints (`/registry/stablecoins`, `/issuer/*`) |
| 1.5 React Query hooks: useRegistry, useIssuerProfile, useSubmissions, mutation hooks | `features/scoin-store/hooks.ts` | Data loads, caches, and error states work |
| 1.6 Payment instruction model: payer, payee, amount, stablecoinId, timestamp, nonce, signature, expiry | `features/offline/models.ts` | Round-trip serialisation test passes |
| 1.7 Outbox model: instruction + status (queued, signing, signed, sending, sent, synced, failed) | `features/offline/models.ts` | State transitions documented |
| 1.8 Connectivity mode enum: online, poor, offline | `features/offline/models.ts`, `hooks/use-connectivity-mode.ts` | Tri-state detection with debounce |

---

## Phase 2: Scoin Store Browse & Detail
**Size: M (3–4 hours) | Blocked by: Phase 1**

| Task | Files | Acceptance |
|---|---|---|
| 2.1 Replace hardcoded `SUPPORTED_ASSETS` with `useRegistry()` hook | `app/(tabs)/explore.tsx` | Shows stablecoins from API registry |
| 2.2 Add search bar and filter chips (currency, network, status) | `app/(tabs)/explore.tsx` | User can filter by local currency or network |
| 2.3 Stablecoin detail screen: full info, issuer card, compliance badge, reserve/attestation links | `app/(flows)/scoin-store/detail.tsx` | Tapping a card navigates to detail |
| 2.4 Compliance status badge component | `components/ui/ComplianceBadge.tsx` | Correct colour per status |
| 2.5 Seed mock registry data: 6-8 local-currency stablecoins (cGHS, cXOF, cNGN, cKES, cTRY, USDC, EURC) | `features/scoin-store/mock-data.ts` | Store looks populated for demos |

---

## Phase 3: Issuance Flow (Issuer Role)
**Size: M (4–5 hours) | Blocked by: Phase 2**

| Task | Files | Acceptance |
|---|---|---|
| 3.1 Issuer profile screen (org, memberships, submissions list) | `app/(flows)/scoin-store/issuer-profile.tsx` | Shows issuer's own submissions |
| 3.2 Create submission form: name, ticker, network, contract, reserve, attestation | `app/(flows)/scoin-store/create-submission.tsx` | Validates with Zod, posts to API |
| 3.3 Submission detail with compliance state timeline | `app/(flows)/scoin-store/submission-detail.tsx` | Shows state transitions + review events |
| 3.4 Edit draft / needs_changes submission | `app/(flows)/scoin-store/edit-submission.tsx` | PATCH to API, version bump |
| 3.5 Submit for review action | `app/(flows)/scoin-store/submission-detail.tsx` | Button triggers state transition |
| 3.6 Compliance state machine visualisation (timeline with status dots) | `components/ui/ComplianceTimeline.tsx` | Each state change visible with timestamp |

---

## Phase 4: Consumption Flow (User/Fintech)
**Size: S (2–3 hours) | Blocked by: Phase 2**

| Task | Files | Acceptance |
|---|---|---|
| 4.1 "Add to Wallet" button on stablecoin detail (published stablecoins only) | `app/(flows)/scoin-store/detail.tsx` | ASSUMPTION: adds stablecoin to user's visible currencies. Does not create new on-chain accounts in MVP. |
| 4.2 Currency selector in send/payment flows shows Store stablecoins | `app/(flows)/send/index.tsx`, payment flows | User can select a Store stablecoin for payment |
| 4.3 Update wallet display to show Store stablecoins | `app/(tabs)/index.tsx` | Balances for added stablecoins appear on home |

> **ASSUMPTION:** For the hackathon MVP, "consumption" means the stablecoin becomes visible and selectable in the user's wallet UI. Actual on-chain settlement for non-USDC/EURC tokens requires backend token program integration that won't exist in 4 days. Mock the transfer provider for new stablecoins.

---

## Phase 5: Offline Payment — Mode 1 & 2 (Poor/Intermittent)
**Size: L (5–6 hours) | Blocked by: Phase 1**

| Task | Files | Acceptance |
|---|---|---|
| 5.1 Key generation + secure storage (Ed25519 keypair in SecureStore) | `lib/crypto/keys.ts` | Keys never leave SecureStore; unit test |
| 5.2 Payment instruction signing (Ed25519) | `lib/crypto/signing.ts` | Sign → verify round-trip test passes |
| 5.3 Payment instruction verification | `lib/crypto/signing.ts` | Rejects: tampered, expired, wrong nonce |
| 5.4 Encrypted local outbox (SQLite via expo-sqlite) | `features/offline/outbox.ts` | Instructions persist across app restart |
| 5.5 Outbox sync service: retry with exponential backoff, idempotency keys | `features/offline/sync.ts` | Duplicate sync does not double-spend (test) |
| 5.6 Connectivity mode hook upgrade: online ↔ poor ↔ offline with debounce | `hooks/use-connectivity-mode.ts` | Correct mode under toggled airplane mode |
| 5.7 ConnectivityIndicator component (replaces OfflineBanner) | `components/ui/ConnectivityIndicator.tsx` | Shows mode with icon + colour |
| 5.8 Payment flow modification: if poor/offline, sign locally → outbox → show pending | Modified: `app/(flows)/send/confirm.tsx`, `app/(flows)/send/success.tsx` | Payment completes locally when offline |
| 5.9 Activity screen shows offline-pending and syncing states | `app/(tabs)/activity.tsx` | States are visually distinct |
| 5.10 Unit tests: signing, outbox CRUD, sync idempotency | `features/offline/__tests__/` | All pass |

---

## Phase 6: Offline Payment — Mode 3 (No Internet, QR + SMS)
**Size: L (5–6 hours) | Blocked by: Phase 5**

| Task | Files | Acceptance |
|---|---|---|
| 6.1 Payment instruction compact encoding (binary → base64url) | `lib/crypto/encoding.ts` | Round-trip test; fits in 160-char SMS |
| 6.2 SMS splitting/reassembly for long instructions | `lib/crypto/encoding.ts` | Multi-part SMS round-trip test |
| 6.3 QR-based offline instruction exchange (buyer shows, merchant scans) | `app/(flows)/offline-pay/send-qr.tsx`, `app/(flows)/offline-pay/scan-instruction.tsx` | Merchant receives valid signed instruction |
| 6.4 SMS instruction transport (Android: `expo-sms`; iOS: pre-filled composer) | `features/offline/sms-transport.ts` | Android sends automatically; iOS opens composer |
| 6.5 Merchant receives instruction → validates → sends via SMS to infrastructure | `app/(flows)/offline-pay/merchant-receive.tsx` | Merchant sees confirmation after SMS sent |
| 6.6 Document payment instruction format | `docs/scoin/PAYMENT_INSTRUCTION.md` | Complete spec: fields, encoding, signing, SMS format |
| 6.7 NFC tap exchange (Android only, via react-native-nfc-manager) | `features/offline/nfc-transport.ts` | NDEF message carries payment instruction |
| 6.8 Unit tests: encoding round-trip, SMS split/reassemble, instruction validation | `features/offline/__tests__/` | All pass |

---

## Phase 7: Role-Aware Navigation
**Size: S (2–3 hours) | Blocked by: Phase 3, Phase 4**

| Task | Files | Acceptance |
|---|---|---|
| 7.1 Role detection from user profile / issuer membership | `features/auth/hooks.ts`, `store/app-store.ts` | App knows if user is issuer, fintech, consumer, merchant |
| 7.2 Conditional tab and flow visibility | `app/(tabs)/_layout.tsx`, navigation guards | Issuer sees submission screens; consumer sees browse + pay; merchant sees receive + offline accept |
| 7.3 Role switcher for demo (users with multiple roles) | `components/ui/RoleSwitcher.tsx` | Quick role toggle in profile or demo panel |

---

## Phase 8: Demo Mode
**Size: M (3–4 hours) | Blocked by: Phase 6**

| Task | Files | Acceptance |
|---|---|---|
| 8.1 Demo mode toggle in profile/settings | `store/demo-store.ts`, `app/(tabs)/profile.tsx` | Visible "[DEMO]" badge when active |
| 8.2 Connectivity simulator (online ↔ poor ↔ offline toggle) | `store/demo-store.ts`, `hooks/use-connectivity-mode.ts` | Overrides real NetInfo |
| 8.3 SMS delivery simulator (mock send + mock infrastructure response) | `features/offline/sms-transport.ts` (mock implementation) | Simulates full SMS → auth → settle cycle |
| 8.4 Seed data: 6-8 local-currency stablecoins, 3 issuers, mock balances | `features/scoin-store/mock-data.ts` | Store populated on demo mode enable |
| 8.5 Pre-built demo script / walkthrough hints | `components/ui/DemoOverlay.tsx` | Optional hint overlay for the 60-second video |

---

## Phase 9: Analytics & Polish
**Size: S (2–3 hours) | Blocked by: all above**

| Task | Files | Acceptance |
|---|---|---|
| 9.1 Analytics event definitions for Store and offline activity | `lib/analytics/events.ts` | Events: store_browse, store_detail_view, submission_created, payment_offline_queued, payment_synced, etc. |
| 9.2 Consent prompt for analytics | `app/(guest)/onboarding.tsx` or first-launch | No events fire without consent |
| 9.3 Ensure no transaction fees appear in any payment flow | Grep + manual review | Zero fee lines anywhere |
| 9.4 Verify all UI copy says "Crypto World's Fair Hackathon" | Grep for "Eternal" | Zero occurrences |
| 9.5 Update README with run/test/demo instructions | `README.md` (mobile-specific) | New dev can run from clean checkout |
| 9.6 Final STATUS.md update | `docs/scoin/STATUS.md` | All acceptance criteria evidenced |

---

## Time estimate summary

| Phase | Est. hours | Cumulative |
|---|---|---|
| 0: Green baseline | 2–3h | 3h |
| 1: Domain/data layer | 3–4h | 7h |
| 2: Store browse/detail | 3–4h | 11h |
| 3: Issuance flow | 4–5h | 16h |
| 4: Consumption flow | 2–3h | 19h |
| 5: Offline mode 1&2 | 5–6h | 25h |
| 6: Offline mode 3 (QR+SMS) | 5–6h | 31h |
| 7: Role navigation | 2–3h | 34h |
| 8: Demo mode | 3–4h | 38h |
| 9: Analytics & polish | 2–3h | 41h |

**Total: ~35–41 hours of implementation.** Tight for 4 days but feasible with focused execution. Phases 0–5 + 8 are the minimum viable demo (~25h).

---

## Open Questions (need your input before proceeding)

### Q1: Missing PDFs
The four architecture PDFs are not in `docs/scoin/`. Should I proceed with the email spec alone, or can you provide them?

### Q2: Blockchain / stablecoin standard
The existing code targets **Solana Devnet** with **Circle's USDC/EURC (SPL tokens)**. For the Scoin Store's local-currency stablecoins (cGHS, cXOF, etc.), should I:
- **(a)** Mock them entirely on the mobile side (no on-chain representation), or
- **(b)** Deploy test SPL tokens on devnet to represent them, or
- **(c)** Use a different standard/chain?

ASSUMPTION until answered: **(a)** — mock data for the Store catalogue, with real USDC/EURC for actual payment execution.

### Q3: Client-side signing for offline payments
The current wallet model is **fully custodial** (keys server-side). Offline payments require client-side signing. Options:
- **(a)** Generate a separate **offline signing keypair** on the device (not the wallet keypair), used only for payment instruction authentication — not for on-chain token transfers. Settlement still happens server-side when synced.
- **(b)** Move wallet keys to the device (breaks custodial model).

ASSUMPTION until answered: **(a)** — device-local Ed25519 keypair for instruction signing; actual settlement remains custodial + server-side.

### Q4: SMS gateway
For Mode 3 (no internet), should SMS be sent:
- **(a)** By the **phone's own SMS app** (expo-sms, requires cellular), or
- **(b)** By a **server-side gateway** (Twilio, requires the *merchant's* phone to have internet, which contradicts "no internet")?

ASSUMPTION until answered: **(a)** — the merchant's device sends SMS natively. The payment infrastructure server stays online to receive it.

### Q5: Real vs. mock compliance
The backend has compliance states and review workflow. Should compliance checks (KYC/KYB, sanctions screening) be:
- **(a)** Modelled as states with manual admin transitions (current backend approach), or
- **(b)** Integrated with a real compliance provider?

ASSUMPTION until answered: **(a)** — state machine with interface, mock implementation, clear documentation of what a real integration would need.

### Q6: Scope cut for 4-day deadline
If time is tight, what should I prioritise?
- **Must have:** Store browse + detail, basic issuance flow, offline mode 1&2, demo mode
- **Nice to have:** Mode 3 (QR+SMS), NFC, full role navigation, analytics
- **Can defer:** i18n, comprehensive tests beyond critical paths

### Q7: Any conflicts with the issuers-dashboard?
There's an `apps/issuers-dashboard/` (Next.js) in the repo. Is that the issuer's web portal? Should the mobile issuer flow duplicate it or complement it (e.g., mobile shows status, web does full management)?

---

## Assumptions register

| ID | Assumption | Flagged in |
|---|---|---|
| A1 | Local-currency stablecoins are mock data only (no on-chain tokens) | Q2 |
| A2 | Offline signing uses a device-local keypair, not the custodial wallet key | Q3 |
| A3 | SMS sent by phone's native SMS, not server gateway | Q4 |
| A4 | Compliance is state-machine + manual admin, no real KYC provider | Q5 |
| A5 | "Add to Wallet" in consumption flow means UI visibility, not on-chain account creation | Phase 4 |
| A6 | Hackathon name: "Crypto World's Fair Hackathon" (not Eternal Hackathon) | Spec §1 |
