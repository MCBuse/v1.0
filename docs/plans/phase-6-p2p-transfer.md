# Phase 6: P2P Transfer Execution

## Goal

The "wow" flow. Payer scans a QR, the API resolves the payment request, verifies balance, executes the transfer, records it on-chain (Solana devnet), updates both wallets' balances, and closes the payment request. This is what makes MCBuse a real Solana-native product for the hackathon.

## Flow

```
POST /payments
  body: { nonce, amount?, currency? }
  ├─ resolve payment request by nonce
  ├─ validate: pending, not expired, payer ≠ payee
  ├─ for static QR: amount + currency required in body
  ├─ for dynamic QR: use values from payment request
  ├─ check payer routine balance >= amount
  ├─ TransferAdapter.execute()
  │   ├─ Mock:  update DB balances atomically + ledger entry
  │   └─ Real:  decrypt payer keypair → build SPL transfer → sign → send → confirm
  ├─ debit payer routine balance
  ├─ credit payee routine balance
  ├─ write double-entry ledger entry (type=p2p)
  ├─ for dynamic QR: markCompleted(paymentRequestId)
  └─ return { txSignature, ledgerEntryId, amount, currency }
```

## Files

### Transfer Adapter (adapter pattern)
- `apps/api/src/payments/transfer-provider.interface.ts`
- `apps/api/src/payments/providers/mock-transfer.provider.ts` — DB-only, no Solana
- `apps/api/src/payments/providers/solana-transfer.provider.ts` — real SPL token transfer

### Payments Module
- `apps/api/src/payments/payments.module.ts`
- `apps/api/src/payments/payments.service.ts` — orchestrates the full flow
- `apps/api/src/payments/payments.controller.ts` — POST /payments
- `apps/api/src/payments/dto/execute-payment.dto.ts`

## Steps

### Step 1: Transfer adapter interface
```typescript
export interface TransferParams {
  payerWalletId: string;
  payerPubkey: string;
  payerEncryptedKeypair: string;  // needed for real Solana signing
  payeeWalletId: string;
  payeePubkey: string;
  amount: bigint;
  currency: string; // 'USDC' | 'EURC'
  idempotencyKey: string;
}

export interface TransferResult {
  txSignature: string | null;   // null for mock
  status: 'completed' | 'failed';
}
```

### Step 2: Mock transfer provider
Pure DB update — no Solana. Generates a fake `txSignature` prefixed `mock_`. Used in dev and for hackathon demo without devnet connectivity.

### Step 3: Real Solana transfer provider
Uses `SolanaService.decryptKeypair()` to get the payer's Keypair, then:
1. Find/create ATA (Associated Token Account) for payer and payee
2. Build `createTransferCheckedInstruction` (SPL token transfer)
3. Sign and send via `connection.sendRawTransaction()`
4. Confirm with `connection.confirmTransaction()`
5. Return transaction signature

Mint addresses resolved from currency: USDC devnet = `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`, EURC devnet = use mock until real address confirmed.

### Step 4: Payments service
`PaymentsService.execute(payerId, dto)`:
1. Load payer's routine wallet (decrypt keypair only for real provider)
2. Resolve payment request by nonce (reuse `PaymentRequestsService.resolve()`)
3. Guard: payer wallet ≠ payee wallet (can't pay yourself)
4. Determine amount + currency (from PR for dynamic, from body for static)
5. Check payer balance (same atomic SQL pattern as internalTransfer)
6. Generate idempotency key
7. DB transaction:
   a. Atomic deduct from payer routine (gte guard)
   b. Credit payee routine
   c. Call `TransferAdapter.execute()` for on-chain tx (inside tx for mock, after tx commit for real)
   d. Insert ledger entry (type='p2p', solanaTxSignature)
   e. If dynamic: `PaymentRequestsService.markCompleted()`
8. Return result

### Step 5: DTO and controller
`ExecutePaymentDto`:
- `nonce`: string (required — from QR scan)
- `amount?`: string (bigint) — required for static QR
- `currency?`: 'USDC' | 'EURC' — required for static QR

`POST /payments` — protected + VerifiedEmailGuard

## Decisions

- **Payer always uses routine wallet**: consistent design — routine = spending
- **Real provider wraps Solana tx**: if Solana tx fails, DB transaction rolls back (no balance change without confirmation)
- **Mock uses fake signature**: `mock_<uuid>` — easily identifiable in logs/history
- **TRANSFER_PROVIDER env var**: 'mock' | 'solana'
- **Idempotency key**: UUID per execution, stored in ledger. Retry with same nonce on a dynamic QR returns 400 (already completed)
- **Static QR**: stays pending after payment — creates new ledger entry per use
