# Invoices addressed to a @username

## Goal
A creator (an individual, or a merchant) can send an invoice to a specific MCBuse user by username. Only that user can pay it. They see it in the app without having to scan anything. The QR code still works as a fallback, but only for the named payer.

Decisions (Fred, 2026-11-07):
- **Both** the personal Invoice flow and merchant invoices get the field.
- **The creator picks the expiry.**

## Current state
- Every invoice is a row in `payment_requests` and is a bearer QR: anyone who resolves the nonce can pay it. There is no payer column.
- Personal invoices: `POST /payment-requests` (`PaymentRequestsService.create`). Expiry is 30s–24h, and the app uses a fixed 5 minutes.
- Merchant invoices: `POST /merchant/invoices` (`MerchantInventoryService.createInvoice`). Expiry is 15m / 1h / 24h, and stock stays reserved until the invoice is paid, cancelled or expires.
- Paying: `GET /payment-requests/resolve?nonce=` returns the details, then `POST /payments {nonce}` executes the payment (`PaymentsService.execute` → `resolveForExecution`).
- Usernames are only used by `POST /payments/username` (`UsersService.findByUsername`).

## Steps

### API
1. **Schema and migration `0043_payment_request_payer`.** Add `payment_requests.payer_user_id uuid NULL REFERENCES users(id)` and an index on `(payer_user_id, status)`. Write it through `drizzle-kit generate` with a local `DATABASE_URL` exported.
2. **Payer lookup** (`PaymentRequestsService.resolvePayer(username, creatorUserId)`). It uses `findByUsername` and returns the user id. Errors:
   - Unknown or inactive user → 404 "No MCBuse user @x".
   - The creator's own username → 400.
   - Merchant invoices call this too.
3. **DTOs.** Add an optional `payerUsername` (with or without the @) to `CreatePaymentRequestDto` and `CreateMerchantInvoiceDto`.
   - Expiry choices: 1h / 24h / 7d when a payer is set.
   - Personal `Max` is raised to 604800 (7d). Merchant `IsIn` adds 604800.
   - The service rejects anything over 24h when no payer is set, so bearer QR codes keep their current limits.
4. **Only the named payer can pay.** `resolve` and `resolveForExecution` take the caller's user id. If `payer_user_id` is set and doesn't match, they return 403 "This invoice is for someone else". The controller passes `user.id`; `PaymentsService.execute` passes `payerUserId`.
5. **Incoming list.** New endpoint `GET /payment-requests/incoming` returns pending, unexpired requests where `payer_user_id = me`, newest first. Each item has: id, nonce, amount, currency, description, expiresAt, createdAt, creator display name or merchant name, and the merchant invoice number and EUR total.
6. **Creator-facing responses** (create response, merchant invoice list and detail) include `payerUsername`, so the creator sees "Billed to @x".

### Mobile
7. **Personal Invoice screen** (`app/(flows)/invoice/index.tsx`):
   - Optional "Bill to" `@username` input.
   - With a payer set, expiry chips appear (1h / 24h / 7d, default 24h). Without one, it stays at the current 5 minutes.
   - After creating, the screen shows "Sent to @x" above the QR.
8. **Merchant new-invoice screen** (`merchant-invoices/new.tsx`):
   - The same "Bill to" input.
   - The expiry row shows 1h / 24h / 7d when a payer is set, otherwise the current 15m / 1h / 24h.
   - The invoice detail screen shows "Billed to @x".
9. **"Requests for you" on Home:**
   - New hook `useIncomingRequests` (React Query, refetches every 30s, included in Home's pull-to-refresh).
   - The section only appears when there is at least one request. It shows who it's from, the amount and when it expires.
   - Tapping a request opens the existing pay flow.
10. **Scan screen accepts `?nonce=`** (`app/(flows)/scan.tsx`). It resolves the nonce on mount and jumps straight to review, skipping the camera and camera permission. This reuses the whole existing confirm/pay/success path.

### Tests (TDD: tests written first)
- API unit tests (`payment-requests.service.spec.ts`, using the existing mock-db pattern):
  - Payer lookup errors.
  - Expiry over 24h is rejected without a payer.
  - Resolve returns 403 for a different user and succeeds for the named payer.
  - Incoming list filters correctly.
- Existing DTO spec: `payerUsername` normalisation, and the 7d expiry limit.
- Mobile: zod models for the incoming response; the `extractNonce` param path stays covered by the scan logic.

## Dependencies and order
1–2–3 → 4 → 5–6 (API, deployable alone because every new field is optional), then 7–10 (mobile).

The migration is additive and nullable, so old API images keep working against it.

## Open questions / deferred
- **Notifying the payer.** There's no push infrastructure yet, so in this slice the payer only finds out from the Home section, which refreshes every 30s and on pull. An email via the existing mail module would be a cheap follow-up.
- **Declining a request.** The payer can't decline yet. The creator can cancel, and the request expires anyway.
- **Static QR codes** are not addressable. A static QR is a reusable "pay me" code by design.
