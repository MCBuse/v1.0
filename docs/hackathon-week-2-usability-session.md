# Week 2 Merchant Usability Session

**Goal:** verify that a merchant can receive and recognize a payment without needing blockchain knowledge.

**Participant:** one shop owner, operator, or representative who has not worked on the portal.

**Length:** 20 minutes.

## Setup

- Use the provisioned pilot merchant account.
- Prepare a funded devnet mobile payer before the session.
- Start with the portal signed out and no payment request open.
- Record the screen only after receiving the participant's consent.
- Do not explain the interface unless the participant becomes completely blocked.

For the real hosted session, prepare a separate non-production payer before the participant arrives:

1. In the mobile app, open **Home → Receive** and tap **Routine address** to copy the full address.
2. Fund that address with at least `0.01 SOL` from the official [Solana devnet faucet](https://faucet.solana.com/) and at least `5 USDC` from the official [Circle faucet](https://faucet.circle.com/) using **Solana Devnet**. Devnet assets have no real-world value.
3. In the mobile app, use **Top Up** to add test value to **Holding Account**, then use **Holding Account → Move** to move at least `$5` in USD to **Routine Account**.
4. Run the credential-safe `merchant:devnet-readiness` check from the [merchant release gate](./merchant-portal-release.md). Keep transfers mocked unless every readiness check passes.

The faucet balance and the app's internal Routine Account balance are separate requirements.

For a local mock rehearsal, first verify that `apps/mobile/.env` uses the Mac's current LAN address. Then start these in separate terminals:

```text
pnpm dev:api
```

```text
MCBUSE_API_URL=http://127.0.0.1:4000/api/v1 PORTAL_ORIGIN=http://127.0.0.1:3001 SESSION_COOKIE_SECURE=false pnpm dev:portal
```

```text
pnpm --filter mobile start
```

Use the local mock on-ramp to prepare the payer. Do not treat this rehearsal as real devnet-payment evidence, and do not use its results to enable the hosted Solana provider.

## Tasks

1. Sign in to the merchant portal.
2. Request a payment for **€4.50** with the description **Lunch order**.
3. Ask the prepared payer to scan and approve the request.
4. Decide whether the payment was received or still needs attention.
5. Find the receipt in Transactions.
6. Explain, in the participant's own words:
   - received today;
   - estimated available balance;
   - payment capture quality;
   - the readiness status in Business profile.

## Observe

| Measure                                          | Result   |
| ------------------------------------------------ | -------- |
| Time from sign-in to visible QR                  |          |
| Time from payer approval to visible receipt      |          |
| Task completed without help                      | Yes / No |
| Participant noticed EUR estimate timestamp       | Yes / No |
| Participant understood pending vs received       | Yes / No |
| Participant understood readiness is not approval | Yes / No |

Record the participant's exact words for confusing labels and trust concerns. Do not collect customer names, wallet addresses, transaction signatures, or other personal data.

## Debrief questions

1. What did you think would happen after you created the request?
2. How did you know the money had arrived?
3. Which number would you check first at the end of the day?
4. Was anything unclear or worrying?
5. What is the one change that would make this usable in your business?

## Findings and disposition

| Priority | Finding | Evidence | Decision    | Owner | Due |
| -------- | ------- | -------- | ----------- | ----- | --- |
| 1        |         |          | Fix / Defer |       |     |
| 2        |         |          | Fix / Defer |       |     |
| 3        |         |          | Fix / Defer |       |     |

Week 2 usability acceptance is met when the participant can identify whether the sale was received, find its receipt, and explain that available value is an estimate and readiness is not credit approval.
