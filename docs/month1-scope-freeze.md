# Month 1 MVP Scope-Freeze Packet

**Ticket:** MCB-12 — W03: Validate and freeze the MVP backlog with stakeholders  
**Status:** Ready for stakeholder confirmation  
**Date:** 2026-08-05  
**Decision owner:** Frederick Obeng-Nyarko

## Product promise

For a pilot merchant, MCBuse provides one reusable static QR that opens a Stripe
sandbox payment flow. MCBuse then captures the signed Stripe evidence, turns it into a
structured merchant transaction, explains expected versus actual payout, and surfaces
exceptions to the merchant and an administrator.

## MVP capabilities

The following are the complete MVP capability set. Each capability maps to an existing
Linear ticket sequence; new work must replace or explicitly defer an item rather than
silently expanding the list.

| # | Capability | Priority | Linear delivery path | Acceptance signal |
| --- | --- | --- | --- | --- |
| 1 | Repository audit and reuse decisions | P2 | W01–W02 | Accepted architecture boundary and risk register. |
| 2 | Merchant profile, identifier, consent, and KYB status | P1 | W13, W25 | A merchant has a stable ID, timestamped consent, validation/recovery states, and status-only KYB. |
| 3 | Stripe Payment Link and static QR provisioning | P1 | W04, W14 | One merchant QR resolves to a correlatable reusable Stripe payment flow. |
| 4 | Signed raw provider-event capture | P0 | W04, W15 | Verified events are retained before canonical processing. |
| 5 | Structured merchant transaction records | P1 | W05, W15–W17 | Payment intent/charge events produce one correct canonical sale. |
| 6 | Capture-quality measurement | P1 | W06, W11, W21 | Captured, malformed, missed, and duplicates are measurable. |
| 7 | Stripe payout matching | P0 | W04, W18 | Payout → balance transaction → payment correlation is deterministic or explicitly unmatched. |
| 8 | Configurable exception detection | P1 | W19 | Delayed, missing, and unmatched conditions are explainable. |
| 9 | Merchant dashboard | P1 | W09, W20, W26 | Merchant sees totals, history, payout clarity, and alerts. |
| 10 | Admin operations panel | P1 | W10, W20, W27 | Admin sees merchant health, exceptions, support flags, and KPIs. |
| 11 | KPI instrumentation | P1 | W21 | Activation, first transaction, capture quality, and payout issue rate are reproducible. |
| 12 | Merchant/admin access control and audit | P0 | W11, W22 | Server-enforced RBAC, protected webhook ingress, secret handling, and audit evidence. |
| 13 | Pilot operations readiness | P1 | W28–W32 | Staging QA, deployment/recovery, monitoring, onboarding measurement, and runbook are rehearsed. |

## Priority rules

- **P0:** Stripe feasibility, verified ingestion, payout matching, RBAC/security, and
  staging acceptance. A P0 failure blocks the MVP gate.
- **P1:** required merchant/admin MVP behavior. P1 may be sequenced but not omitted
  without a recorded scope reduction.
- **P2:** discovery, documentation, skeletons, and debt work. These protect delivery
  but cannot displace the P0 path.

## Explicit exclusions

The MVP does **not** include:

- NFC capture or new mobile functionality;
- production KYB workflow or third-party KYB integration;
- automated credit scoring, lending, or partner matching;
- any provider beyond Stripe;
- a full refund/dispute workflow. Refund/reversal events may only be handled to ensure
  transaction totals and matching remain correct;
- migration of wallet balances, Solana settlement, or user P2P features into merchant
  records.

## Acceptance and measurement policy

### Capture quality

For a selected merchant and reporting period:

- **captured** = verified supported provider events normalized successfully;
- **malformed** = verified supported events that cannot be normalized;
- **missed** = events found during provider reconciliation but absent from local raw
  storage;
- **duplicate** = repeat delivery safely ignored and excluded from the denominator.

`capture quality = captured / (captured + malformed + missed)`

### Merchant value

The merchant must be able to answer, from the dashboard:

1. What did I receive today?
2. Which transactions make up that total?
3. What payout should I expect, when, and what has completed?
4. Which payment or payout needs attention?

### Pilot readiness

Before pilot launch, the team must demonstrate:

- QR → Stripe sandbox payment → verified event → canonical transaction → dashboard;
- deterministic payout matching and exception fixtures;
- merchant/admin data isolation;
- staging deployment plus backup/restore evidence;
- monitoring/alerts and a rehearsed support runbook.

## Month gates

| Gate | Required evidence |
| --- | --- |
| M1 | Audit/risks approved, Linear backlog active, Stripe sandbox capture feasibility evidenced. |
| M2 | Data schema migrated, seeded, tested, and documented. |
| M3 | Scope is frozen and seeded portal skeletons are reviewable. |
| M4 | A sandbox QR payment appears as a structured merchant record. |
| M5 | Expected/completed payout and exception behavior are understandable. |
| M6 | KPIs, role controls, documentation, and test baseline are clean. |
| M7 | MVP workflows are verified in staging. |
| M8 | Production operations, recovery, monitoring, field onboarding, and support ownership are rehearsed. |

## Scope-freeze decision

**Decision date:** 2026-08-05  
**Decision basis:** the shared internal execution plan in `docs/team_plan.md`, the
merchant MVP timeline, and the project-owner instruction to use this team context to
unblock W03.

The team plan establishes merchant Data-Capture as the MVP direction and assigns the
cross-functional ownership needed for the scope decision. The merchant MVP remains an
additive, isolated product track:

- retain the existing API, wallet, P2P, Solana, and Expo code without extending it for
  the pilot;
- build merchant/admin capability only in `apps/portal` and the API `data-capture`
  boundary;
- retain static QR and Stripe sandbox capture as the pilot path; QR/NFC is the longer
  product direction, while NFC stays future or controlled-demo work for this pilot;
- exclude NFC, production KYB, credit scoring, partner-provider integrations, and
  operational refund processing; and
- preserve the P0–P2 sequence and M1–M8 gates in this document and Linear project.

## Team responsibility record

The shared team plan establishes the role and gate context for the scope decision:

| Team member | Role | Scope responsibility |
| --- | --- | --- |
| Asim Emre Aci | Project Lead — Business, Finance, KPI and Partner Coordination | Owns business trade-offs, budget, KPI governance, partner/legal escalation, and the pilot boundary. |
| Frederick Obeng-Nyarko | Engineering Lead — Product, Architecture and MVP Development | Owns the isolated merchant architecture, technical risk handling, and gate evidence. |
| Berk Ozkan | Marketing Lead — Customer Discovery, GTM and Pilot Operations | Owns merchant-facing language, discovery, onboarding feedback, and pilot activation. |

The team plan's Month 1 decision gate requires clear roles, an active project board,
understood MVP scope, documented demo status, and weekly ownership. W01–W04 and this
record complete the technical and scope portions of that gate. Merchant field validation
remains planned work (W30), not retrospective evidence; new requests must identify the
displaced MVP capability or be recorded as post-pilot work.
