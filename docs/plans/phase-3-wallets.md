# Phase 3: Wallets & Ledger

## Goal

Create dual wallets (savings + routine) for every user, generate Solana keypairs server-side, encrypt them at rest with AES-256-GCM, initialise USDC and EURC balances, and expose a Savings ↔ Routine internal transfer. This is the financial core everything else builds on.

## Files

### Solana Keypair Service
- `apps/api/src/solana/solana.module.ts` — module, exports SolanaService
- `apps/api/src/solana/solana.service.ts` — keypair generation, AES-256-GCM encrypt/decrypt, SPL token transfer (mock adapter wired later)

### Wallets Module
- `apps/api/src/wallets/wallets.module.ts`
- `apps/api/src/wallets/wallets.service.ts` — createWalletPair, findByUserId, getBalance, internal transfer
- `apps/api/src/wallets/wallets.controller.ts` — GET /wallets, GET /wallets/:type/balance, POST /wallets/transfer
- `apps/api/src/wallets/dto/internal-transfer.dto.ts` — fromWalletType, toWalletType, amount (string, bigint-safe), currency

### Ledger Module
- `apps/api/src/ledger/ledger.module.ts`
- `apps/api/src/ledger/ledger.service.ts` — recordEntry (double-entry), getHistory

### Auth Integration
- `apps/api/src/auth/auth.service.ts` — **modify**: call walletsService.createWalletPair after signup
- `apps/api/src/auth/auth.module.ts` — **modify**: import WalletsModule

### Config
- `apps/api/src/config/config.validation.ts` — already has SOLANA_KEYPAIR_ENCRYPTION_KEY (optional)
- `apps/api/.env.example` — **modify**: document SOLANA_KEYPAIR_ENCRYPTION_KEY format (64-char hex = 32 bytes)
- `apps/api/.env` — **modify**: add a dev encryption key

## Steps

### Step 1: Install dependencies
```
@solana/web3.js @solana/spl-token
```

**Verify:** `pnpm install` succeeds, build passes.

### Step 2: Solana service (keypair + encryption)
Create `SolanaService` with:
- `generateKeypair()` — `Keypair.generate()`, returns `{ publicKey: string, encryptedKeypair: string }`
- `encryptKeypair(secretKey: Uint8Array): string` — AES-256-GCM, key from env, returns `iv:authTag:ciphertext` (hex-encoded)
- `decryptKeypair(encrypted: string): Keypair` — reverse of above
- `getTokenBalance(walletPubkey: string, mint: string): Promise<bigint>` — reads SPL token account balance from chain

Config: `SOLANA_KEYPAIR_ENCRYPTION_KEY` must be 64 hex chars (32 bytes). Validate this in the service constructor, throw on startup if invalid or wrong length.

**Verify:** Unit logic: encrypt → decrypt round-trip returns identical secret key bytes.

### Step 3: Wallet creation service
`WalletsService.createWalletPair(userId)`:
1. Call `solanaService.generateKeypair()` × 2 (savings, routine)
2. Insert both wallet rows (type, solanaPubkey, encryptedKeypair)
3. Insert 4 balance rows (savings×USDC, savings×EURC, routine×USDC, routine×EURC) — all zero
4. Return both wallet objects (no encryptedKeypair in response)

`WalletsService.findByUserId(userId)` — returns both wallets with balances.

`WalletsService.getBalance(walletId, currency)` — returns `{ available: string, pending: string }` (bigint serialised as string).

**Verify:** createWalletPair inserts 2 wallets + 4 balances.

### Step 4: Wire wallet creation into signup
Modify `AuthService.signup()` to call `walletsService.createWalletPair(user.id)` after creating the user. Signup now atomically creates user + wallets + balances.

**Verify:** POST /auth/signup creates user + 2 wallets + 4 balance rows.

### Step 5: Internal transfer (Savings ↔ Routine)
`WalletsService.internalTransfer(userId, dto)`:
1. Load source and destination wallets, verify both belong to userId
2. Check `VerifiedEmailGuard` (enforced at controller level)
3. Load source balance, verify `available >= amount`
4. In a DB transaction:
   - Deduct from source `available`
   - Add to dest `available`
   - Insert ledger entry (type: INTERNAL, status: COMPLETED)
5. Return updated balances

Amount represented as `bigint` internally. DTO accepts amount as string (e.g. `"1000000"` = 1 USDC at 6 decimals), parse with `BigInt()`.

**Verify:** Transfer of 1 USDC deducts from savings, credits routine. Ledger entry created.

### Step 6: Wallets controller
Endpoints (all protected + VerifiedEmailGuard):
- `GET /wallets` — returns both wallets with balances (no encryptedKeypair ever)
- `GET /wallets/:type/balance` — `:type` = 'savings' | 'routine'
- `POST /wallets/transfer` — internal Savings ↔ Routine transfer

DTOs with class-validator. Swagger `@ApiTags('wallets')`, `@ApiBearerAuth('access-token')`.

**Verify:** GET /wallets returns { savings: {..., balances: [{currency, available, pending}]}, routine: {...} }.

### Step 7: Ledger service
`LedgerService.recordEntry(data)` — inserts a double-entry ledger row. Used by internal transfer in Step 5.

`LedgerService.getEntriesForWallet(walletId, filters)` — used in Phase 8 (history). Build the query now.

**Verify:** Build passes. Ledger entry written on transfer.

## Dependencies

- `@solana/web3.js`, `@solana/spl-token`
- Node.js built-in `crypto` for AES-256-GCM (no extra package)
- Existing users, wallets, balances, ledger_entries schemas from Phase 1
- Phase 2 auth (users exist, JWT guard, VerifiedEmailGuard)
- `SOLANA_KEYPAIR_ENCRYPTION_KEY` = 64 hex chars in `.env`

## Decisions

- **Keypair encryption**: AES-256-GCM with random IV per keypair. Key from env, never stored in DB.
- **Amount precision**: All amounts in base units (6 decimals for USDC/EURC). Stored as bigint. Transported as string in JSON to avoid JS number precision loss.
- **No on-chain transfer yet**: Internal Savings ↔ Routine transfer is ledger-only (both wallets are custodial, same server). Real SPL transfers happen in Phase 6 (P2P).
- **Wallet creation is synchronous at signup**: Both wallets created in same request. Keypairs generated in-process. For high scale this would move to a queue, but fine for MVP.
- **VerifiedEmailGuard on all wallet routes**: Financial routes require verified email. Sign up → verify email → access wallets.
