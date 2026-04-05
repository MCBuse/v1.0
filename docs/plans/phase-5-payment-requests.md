# Phase 5: Payment Requests & QR

## Goal

Build the Payment Request engine — the core product primitive. A user creates a payment request; it encodes into a QR payload; a sender scans and resolves it before executing the transfer (Phase 6). Two types: **static** (open amount, reusable, never expires — "pay me" QR) and **dynamic** (fixed amount, one-use, optional expiry).

## Files

### Payment Requests Module
- `apps/api/src/payment-requests/payment-requests.module.ts`
- `apps/api/src/payment-requests/payment-requests.service.ts` — create, resolve, expire, cancel, list
- `apps/api/src/payment-requests/payment-requests.controller.ts` — CRUD endpoints
- `apps/api/src/payment-requests/dto/create-payment-request.dto.ts`
- `apps/api/src/payment-requests/dto/resolve-payment-request.dto.ts` — nonce lookup

### QR Payload
No external QR image library needed at the API layer — the payload is a structured object the mobile client encodes into a QR image. The API returns a `qrPayload` object and a `qrString` (URL-safe string) the mobile encodes.

## QR Payload Format

```
mcbuse://pay?nonce=<nonce>&v=1
```

For dynamic QR (amount known):
```
mcbuse://pay?nonce=<nonce>&amount=<bigint_string>&currency=USDC&v=1
```

The nonce is the single lookup key. Everything else (wallet, amount, expiry) is server-side.

## Steps

### Step 1: Create payment request
`PaymentRequestsService.create(userId, dto)`:
1. Load user's routine wallet (P2P receives into routine)
2. Validate: if dynamic, amount > 0 required; currency required
3. Generate `nonce` = `randomUUID()` (URL-safe, unpredictable)
4. If dynamic with expiry, set `expiresAt`; static = null
5. Insert payment_requests row
6. Build and return `qrPayload` + `qrString`

DTO:
- `type`: 'static' | 'dynamic'
- `amount?`: string (bigint) — required for dynamic
- `currency?`: 'USDC' | 'EURC' — required for dynamic
- `description?`: string (max 100 chars)
- `expiresInSeconds?`: number — dynamic only, default 300 (5 min), max 86400 (24h)

### Step 2: Resolve payment request (scan)
`PaymentRequestsService.resolve(nonce)`:
1. Look up by nonce
2. Check status === 'pending'
3. Check not expired (if expiresAt set)
4. Return full payment request + creator wallet info
Used by the payer before executing the transfer (Phase 6).

`GET /payment-requests/resolve?nonce=<nonce>` — @Public() so payer doesn't need sender's JWT? No — payer IS authenticated, just resolving someone else's request.

### Step 3: List own payment requests
`GET /payment-requests` — paginated, filterable by status and type.

### Step 4: Cancel payment request
`POST /payment-requests/:id/cancel` — only by creator, only if pending.

### Step 5: Background expiry
Run expiry in-process via a lightweight scheduled task: `setInterval` on startup that marks `status=expired` for rows where `expiresAt < NOW() AND status='pending'`. Runs every 60 seconds. No external scheduler needed for MVP.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /payment-requests | Create static or dynamic |
| GET | /payment-requests | List own requests |
| GET | /payment-requests/:id | Get single |
| GET | /payment-requests/resolve | Resolve by nonce (payer scans QR) |
| POST | /payment-requests/:id/cancel | Cancel (creator only) |

## Decisions

- **Routine wallet receives P2P**: consistent with dual-wallet design — savings = fiat gateway, routine = spending/receiving
- **Nonce = UUID**: unpredictable, URL-safe, 36 chars. No sequential IDs exposed in QR.
- **Static QR is reusable**: status stays 'pending' after each payment (Phase 6 creates a new ledger entry per use, doesn't mark the request complete)
- **Dynamic QR is one-use**: marked 'completed' after first successful payment
- **No QR image generation on server**: mobile client renders the QR from the payload string. Keeps the API stateless and avoids image serving.
- **Expiry is eventually consistent**: cron marks expired rows every 60s. Payment execution in Phase 6 checks expiry at execution time too (defence in depth).
