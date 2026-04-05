# Phase 4: On-Ramp (Fiat → Savings)

## Goal

Fund a user's savings wallet with USDC or EURC via a mock adapter (instant devnet credit for demo) and a real Circle adapter (production). After on-ramp, the balance rows are updated and a ledger entry is recorded.

## Files

### On-Ramp Adapter
- `apps/api/src/onramp/onramp-provider.interface.ts` — interface: `initiateOnRamp(params): Promise<OnRampResult>`
- `apps/api/src/onramp/onramp.module.ts` — provides `ONRAMP_PROVIDER` token, switches on `ONRAMP_PROVIDER` env var
- `apps/api/src/onramp/providers/mock-onramp.provider.ts` — instantly credits savings wallet balance (no Solana tx)
- `apps/api/src/onramp/providers/circle-onramp.provider.ts` — Circle Payments API stub (wire transfer / card)

### On-Ramp Module
- `apps/api/src/onramp/onramp.service.ts` — orchestrates: validate → adapter → credit balance → ledger entry
- `apps/api/src/onramp/onramp.controller.ts` — POST /onramp, GET /onramp/:id/status
- `apps/api/src/onramp/dto/initiate-onramp.dto.ts` — amount (string bigint), currency, provider (optional override)

## Steps

### Step 1: On-Ramp adapter interface
```typescript
export interface OnRampResult {
  externalId: string;   // Circle payment ID or mock UUID
  status: 'pending' | 'completed' | 'failed';
  amount: bigint;
  currency: string;
}

export interface OnRampProvider {
  initiateOnRamp(params: {
    walletId: string;
    solanaPubkey: string;
    amount: bigint;
    currency: string;
    idempotencyKey: string;
  }): Promise<OnRampResult>;
}

export const ONRAMP_PROVIDER = 'ONRAMP_PROVIDER';
```

### Step 2: Mock on-ramp provider
Instantly returns `status: 'completed'`. Does not touch Solana — balance is credited in DB only (internal ledger represents the fiat gateway). Logs the credit for demo visibility.

### Step 3: Circle on-ramp provider (stub)
Implements the interface. In real usage, calls Circle Payments API. For MVP, throws `NotImplementedException` with a clear message so we can wire it later without breaking the mock flow.

### Step 4: OnRamp service
`OnRampService.initiate(userId, dto)`:
1. Load user's savings wallet (verify ownership)
2. Check `VerifiedEmailGuard` enforced at controller level
3. Generate idempotency key
4. Call `ONRAMP_PROVIDER.initiateOnRamp()`
5. If result.status === 'completed': credit `balances.available`, write ledger entry (type: 'on_ramp')
6. If result.status === 'pending': write ledger entry (status: 'pending') — balance credited via webhook (Phase 9)
7. Return result + updated balance

### Step 5: Controller and DTO
`POST /onramp` — protected + VerifiedEmailGuard
- Body: `{ amount: string, currency: 'USDC'|'EURC' }`
- Response: `{ externalId, status, amount, currency, balance: { available, pending } }`

`GET /onramp/:externalId/status` — check status of a pending on-ramp (for polling)

## Decisions

- **Mock is synchronous**: instantly credits balance for demo. Real Circle is async (webhook).
- **Ledger entry always written**: even for mock, a ledger entry with type='on_ramp' records the credit permanently.
- **No real treasury wallet for MVP**: mock on-ramp credits the DB balance directly. Real flow would involve a Circle payment → treasury wallet → user's savings SPL account.
- **Amount string**: same convention as internal transfer — bigint as string to avoid JS number precision loss.
