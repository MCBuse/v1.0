# MCBuse — Fiat Top-up & Full Stablecoin Flow (Plan Mode)

## Context

This is a fintech monorepo (pnpm + Turborepo).

- Mobile: Expo Router (file-based routing)
- Backend: NestJS
- Blockchain: Solana devnet (SPL token transfers via @solana/web3.js + @solana/spl-token)
- Stablecoin provider: Circle (MCP server available)
- Database: Postgres + drizzle
- The codebase has been built incrementally. Structure may be inconsistent.
- DO NOT generate any code in this step. Explore and plan only.

---

## Available Tools

A Circle MCP server is available. Use it actively during exploration:

- Inspect existing Circle wallets and their balances
- Verify wallet IDs referenced in the codebase against what
  actually exists in the Circle account
- Check actual Circle API response shapes for: createPaymentIntent,
  transfer, swap, payout — so TypeScript interfaces are written
  to match reality, not assumptions
- Confirm devnet USDC and EURC mint addresses
- Check supported swap pairs and minimum swap amounts
- Check supported payout methods and required fields for card off-ramp

CONSTRAINT during exploration:
Do NOT create wallets, execute transfers, or mutate any Circle
state during this phase. Read and inspect only.

---

## Step 1 — Explore the codebase and Circle account

Read and summarise what currently exists. For every area below,
note: file path, what it does, what is incomplete or broken.
If something does not exist, say so explicitly.
Do not assume — read the actual files.

### 1a. Mobile (apps/mobile)

- the existing top-up screen is at apps/mobile/app/topup.tsx
- the wallet dashboard is at apps/mobile/app/(tabs)/index.tsx
- the full app/ directory tree (Expo Router structure) is at apps/mobile/app
- the QR scanner screen is at apps/mobile/app/scan.tsx
- the send/transfer screen is at apps/mobile/app/(flows)/send/index.tsx
- find the API client calls being made from mobile — what endpoints
  are called and from which screens

### 1b. API (apps/api/src)

- Wallet module: controller, service, entities — what endpoints exist (find at apps/api/src/wallets/wallet.module.ts)
- Circle module: if it exists, which methods are implemented (find at apps/api/src/onramp & apps/api/src/offramp)
- Payments module: if it exists, what it handles (find at apps/api/src/payments/payment.module.ts)
- Solana module: if it exists, what is implemented (find at apps/api/src/solana/solana.module.ts)
- Ledger module: if it exists, how entries are written (find at apps/api/src/ledger/ledger.module.ts)
- Any existing top-up, on-ramp, swap, or off-ramp endpoint
- Database entities: wallet entity, transaction entity,
  ledger entry entity — read the actual column definitions

### 1c. Shared packages (packages/)

<!-- - types/: what wallet, transaction, payment, QR payload types exist
- api-client/: what API calls are defined and typed
- utils/: what currency, QR, or validation helpers exist -->

### 1d. Circle account (via Circle MCP)

- List all wallets currently on this Circle account
- Note wallet IDs, balances, and currency for each
- Cross-reference against any wallet IDs found in the codebase
  or .env files — flag any mismatches
- Confirm devnet USDC mint address
- Confirm devnet EURC mint address
- Check what payment intent methods are available (card, etc.)
- Check swap API — supported pairs and minimum amounts
- Check payout API — supported destination types

### 1e. Environment

- Read .env.example or any .env files (non-secret keys only)
- Note which Circle, Solana, and Supabase keys are configured
- Flag any missing environment variables needed for the flows below

---

## Step 2 — Map the full user flow against what exists

For each flow below, identify:

- What already works end-to-end
- What is partially implemented
- What is missing entirely
- What is broken or inconsistent

### FLOW A — Buy stablecoins (on-ramp to savings wallet)

1. User taps "Add funds" on savings wallet screen
2. Selects currency: USDC or EURC
3. Selects amount
4. Selects payment method: card (Stripe/Circle) or mobile money
   (Pawapay — can be mocked for now)
5. Circle processes the payment and mints stablecoin
6. USDC or EURC credited to user's SAVINGS wallet
7. Transaction written to ledger (debit: fiat source, credit: savings wallet)
8. User sees updated savings wallet balance + transaction in history

### FLOW B — Internal sweep (savings → routine)

1. User taps "Move to Routine" from savings wallet
2. Selects amount and currency
3. Confirms
4. Internal ledger transfer: debit savings, credit routine
5. No Solana transaction — this is an internal ledger move
6. Both wallet balances update on screen immediately

### FLOW C — Spend from routine wallet

Three entry points, same execution path:

C1. Scan QR

- User taps scan → camera opens
- Decodes QR payload (v, type, recipient_id, amount, currency,
  nonce, expires_at, reference)
- Validates: not expired, correct format, status is pending
- Shows payment confirmation screen: amount, recipient, currency
- User confirms
- Solana SPL token transfer from routine wallet to recipient routine wallet
- Payment request marked as paid
- Ledger entry written
- User sees success + transaction in history

C2. Send to user

- User taps "Send" → enters recipient (username, phone, or wallet address)
- Enters amount and selects currency (USDC or EURC)
- Confirms
- Solana SPL token transfer from routine wallet to recipient routine wallet
- Ledger entry written
- Both parties notified

C3. NFC tap (if NFC module exists — implement as stub if not)

- Receiver broadcasts payment request via NFC
- Sender's app receives it
- Same confirmation + execution path as QR from this point

### FLOW D — Swap (inside savings wallet only)

1. User is on savings wallet screen
2. Taps "Swap"
3. Selects direction: USDC → EURC or EURC → USDC
4. Enters amount (validate against Circle minimum swap amount)
5. Sees: exchange rate, estimated output, fee
6. Confirms
7. Circle executes swap
8. Ledger entries written:
   - DEBIT: savings wallet source currency
   - CREDIT: savings wallet target currency
   - FEE: recorded separately
9. Both balances update on savings wallet screen

CONSTRAINT: Swap is only available from the savings wallet.
The routine wallet has no swap option.

### FLOW E — Off-ramp (stablecoin → card)

1. User is on savings wallet screen
2. Taps "Cash out"
3. Selects currency to cash out (USDC or EURC)
4. Enters amount
5. Selects destination: saved card or enter new card details
6. Confirms
7. Circle converts stablecoin and initiates fiat payout to card
8. Transaction status: pending → processing → completed (async)
9. Ledger entry written on initiation, updated on completion
10. User notified when funds arrive

---

## Step 3 — Wallet rules (enforce in every file touched)

These are architectural constraints. Flag any existing code
that violates them.

SAVINGS wallet:

- Receives on-ramp (fiat → stablecoin)
- Executes off-ramp (stablecoin → fiat)
- Executes swaps (USDC ↔ EURC)
- Source for internal sweep to routine
- NEVER used for QR payments, NFC, or P2P sends

ROUTINE wallet:

- Receives sweep from savings
- Used exclusively for: QR payments, NFC, P2P sends
- NEVER directly receives fiat
- NEVER used for swaps or off-ramp

LEDGER:

- Every balance change produces exactly two ledger entries
  (one debit, one credit)
- Ledger entries are append-only — never updated or deleted
- Swaps produce four entries (two currencies × debit + credit)
- wallets.balance is a denormalised cache — always reconcile
  against ledger sum
- All amounts stored as DECIMAL(18,6) — never float

TRANSACTIONS:

- Every transaction has an idempotency_key (unique constraint)
- Status machine: pending → processing → completed | failed | reversed
- Solana transactions store the txSignature
- Circle transactions store the Circle transaction ID

---

## Step 4 — Present the implementation plan

After completing Steps 1–3, present a structured plan:

### 4a. What to modify

For each file that needs changes:

- File path
- Current state (one line)
- What changes and why
- Risk of touching it (low / medium / high)

### 4b. What to create

For each new file:

- File path
- Purpose
- Key functions or endpoints it will expose

### 4c. Shared types needed

List any types that need to be added or updated in packages/types
and packages/api-client. Be specific — name the interfaces.

### 4d. Environment variables needed

List any .env keys that must be added before implementation.

### 4e. Implementation order

List files in the order they should be built, with the reason
each depends on the previous. Format:

1. [file path] — [why first]
2. [file path] — [depends on 1 because...]
   ...

### 4f. Open questions for Frederick

List anything that requires a decision before implementation
can proceed. Be specific — no vague questions.

### 4g. Risks and conflicts

Flag any existing code that:

- Conflicts with the wallet separation rules
- Uses incorrect amount types (float instead of decimal)
- Has missing idempotency handling
- Will break when new endpoints are added

---

## Step 5 — Wait for approval

Do NOT write any code until Frederick reviews and approves
the plan from Step 4.

After approval, implement in the order from 4e.
After completing each file, stop and confirm before
proceeding to the next.

When implementing:

- Read the existing file fully before editing
- Use str_replace for modifications — do not rewrite whole files
- Use Circle MCP to verify API call shapes before writing service code
- Add JSDoc comments on all public service methods
- Every new API endpoint must have: auth guard, input validation
  (class-validator), error handling, and ledger entry on success
- Every new mobile screen must handle: loading state, error state,
  empty state, and success state
- If a feature already exists and works well, requiring no updates, do not touch it.
- If a feature exists but is broken, fix it and ensure it works as expected.
- If a feature does not exist, create it and ensure it works as expected.
- If a feature is partially implemented, complete it and ensure it works as expected.
