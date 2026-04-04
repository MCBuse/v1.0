# Plan: MCBuse API — MVP for Colosseum Hackathon

## Goal

Build the backend API for a Solana-based dual-wallet P2P payment platform (USDC/EURC) with QR-based transfers, targeting the Colosseum Frontier Hackathon.

## Phases

### Phase 1 — Foundation (API scaffold, DB, config, logging, security, docs)
Set up the API server with all cross-cutting concerns: database connection (Drizzle + Neon), config management, structured logging (pino), global security (helmet, throttler, validation pipe), Swagger docs, and health check. No business logic yet — just a rock-solid foundation.

### Phase 2 — Auth
Email/password signup + login, JWT access/refresh tokens, phone OTP (mock + real adapter), auth guards, session management. Every endpoint after this is protected by default.

### Phase 3 — Wallets & Ledger
Dual wallet creation (savings + routine) on user signup, Solana keypair generation and encrypted storage, balance tracking, double-entry ledger, savings ↔ routine internal transfers.

### Phase 4 — On-Ramp (Fiat → Savings)
Mock on-ramp (instant devnet USDC/EURC credit) and real on-ramp adapter (Circle). Fund the savings wallet so users have money to move.

### Phase 5 — Payment Requests & QR
Payment Request engine (create, validate, expire). Static QR (P2P "pay me") and dynamic QR (specific amount). QR payload encoding/decoding. This is the core product.

### Phase 6 — P2P Transfer Execution
Scan QR → resolve payment request → verify balance → lock funds → execute SPL token transfer on Solana → update ledger → mark request complete. The "wow" flow.

### Phase 7 — Swap (USDC ↔ EURC)
Swap service inside savings wallet. Mock adapter (fixed rate) and real adapters (Jupiter DEX, Circle). Rate preview, fee calculation, execution, ledger recording.

### Phase 8 — Transaction History & Activity
Transaction list with filters (by wallet, currency, type, date range). Pagination. Activity summary.

### Phase 9 — Off-Ramp (Savings → Fiat)
Reverse of on-ramp. Mock (instant debit) and real (Circle) adapters. Withdrawal to bank account.

### Phase 10 — NFC (Last)
NFC payment request transmission via NDEF. Same backend as QR — different trigger. P2P tap flow.
