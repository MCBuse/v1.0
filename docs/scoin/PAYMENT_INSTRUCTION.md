# Payment Instruction Format

> Version: 1  
> Updated: 2026-10-09

## Overview

A **payment instruction** is a cryptographically signed, transport-agnostic payment authorization object. It is created by the payer's wallet and can be transmitted via any available channel (Internet, SMS, QR code, or NFC). The payment infrastructure receives, verifies, and settles it.

**The payment instruction does not transfer the stablecoin.** It authorizes the payment infrastructure to execute the settlement.

## Fields

| Field | Type | Description |
|---|---|---|
| `version` | integer | Protocol version. Always `1` for this version. |
| `paymentId` | string | Unique payment identifier (UUID or prefixed ID). |
| `payerWalletId` | string | Payer's wallet ID in the MCBuse system. |
| `payeeId` | string | Payee's identifier (wallet ID, username, or merchant ID). |
| `stablecoinTicker` | string | Ticker of the stablecoin being paid (e.g., `USDC`, `cGHS`). |
| `amount` | string | Amount in base units (integer, 6 decimals for SPL tokens). |
| `offlineAllowanceId` | string or null | ID of the offline allowance used, if applicable. |
| `nonce` | integer | Transaction counter. Monotonically increasing per wallet. |
| `timestamp` | integer | Unix timestamp in milliseconds when the instruction was created. |
| `expiresAt` | integer | Unix timestamp in milliseconds when the instruction expires. |
| `signature` | string | Hex-encoded cryptographic signature of the payload. |

## Signing

### Payload construction

The signing payload is a pipe-delimited UTF-8 string of all fields except `signature`:

```
{version}|{paymentId}|{payerWalletId}|{payeeId}|{stablecoinTicker}|{amount}|{offlineAllowanceId}|{nonce}|{timestamp}|{expiresAt}
```

- `offlineAllowanceId` is empty string if null.
- All numbers are decimal strings.

### Algorithm

- **MVP**: HMAC-SHA256 using the custodial wallet key.
- **Production target**: Ed25519 using the Solana wallet keypair.

The signing interface (`SigningProvider`) is abstracted so the algorithm can be swapped without changing the payment flow.

### Key storage

- Keys are stored in the device's platform secure store (iOS Keychain / Android Keystore) via `expo-secure-store`.
- Keys are never stored in plaintext or logged.
- Keys are provisioned to the device when online and cached for offline use.

## Compact encoding (for QR and SMS)

### Format

```
MCBP:{base64url-encoded pipe-delimited fields}
```

The `MCBP:` prefix identifies the payload as an MCBuse Payment instruction.

### SMS splitting

If the encoded instruction exceeds 160 characters (GSM SMS limit), it is split into numbered parts:

```
1/3|{chunk1}
2/3|{chunk2}
3/3|{chunk3}
```

Parts can arrive out of order. The receiver reassembles by sorting on the part index.

## Verification

The receiver (merchant or payment infrastructure) verifies:

1. **Signature**: Re-compute the payload and verify the signature.
2. **Expiry**: `expiresAt > now`.
3. **Nonce**: Must be unique (no replay). The nonce is checked against the outbox and backend.
4. **Amount**: Must be positive and within allowance limits.
5. **Payee identity**: Must match the expected recipient.

## Transport channels

| Channel | When used | How it works |
|---|---|---|
| **Internet** | Online mode | Instruction sent via HTTPS to the payment API. |
| **SMS** | No internet, SMS available | Instruction encoded and sent via native SMS to the infrastructure's phone number. |
| **QR** | Peer-to-peer exchange | Payer displays QR; merchant scans, then forwards via SMS or internet. |
| **NFC** | Android, peer-to-peer | Instruction written as NDEF text record; merchant reads via NFC tap. |

## Outbox lifecycle

```
queued → signed → sending → sent → synced
                         ↘ failed (retryable)
```

- **queued**: Instruction created, awaiting signing.
- **signed**: Signed and stored locally.
- **sending**: Transmission in progress (internet, SMS, or QR display).
- **sent**: Successfully transmitted.
- **synced**: Confirmed settled by the payment infrastructure.
- **failed**: Transmission or settlement failed. Retried with exponential backoff up to 5 times.

## Idempotency

Each instruction has a unique `paymentId`. The outbox and backend both enforce idempotency on this key. Duplicate instructions are silently accepted but not double-settled.
