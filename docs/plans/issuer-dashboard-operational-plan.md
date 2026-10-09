# Issuer Dashboard Operationalization Plan

## Goal

Make the MCBuse Issuer Portal a secure, usable system for issuer onboarding, stablecoin submissions, internal review, and publication of approved registry entries.

The issuer portal (`apps/issuers-dashboard`) and internal MCBuse due-diligence dashboard (`apps/admin-dashboard`) are separate Next.js applications sharing the NestJS API and its PostgreSQL database. The API owns issuer organizations, memberships, submissions, review events, and published registry entries.

## Implementation Status — 5 October 2026

Implemented: separate issuer and reviewer applications; membership-checked issuer and reviewer access; issuer submission creation, status tracking, and draft/returned-submission editing; reviewer approve, reject, and request-changes decisions; persisted review reasons; automatic registry publication on approval; and a public read-only stablecoin registry endpoint.

Still required before production: an issuer-organization verification workflow and policy; evidence handling appropriate to KYB and reserve attestations; reviewer assignment, server-side queue pagination, and visible decision history; a decision on whether approval should publish immediately or require a separate publication action; end-to-end and security testing; and production deployment, monitoring, and operational readiness.

The phases below describe the target controls and delivery gates. Treat the implementation status above as the current baseline where it differs from the original sequencing.

## Scope and Non-Goals

In scope:

- Issuer organization membership and role-based access.
- Issuer submission creation, editing before submission, and status tracking.
- Staff review, approval or rejection with recorded reasons and evidence.
- Publication and maintenance of approved stablecoin registry entries.
- Fraud-resistance, auditability, testing, deployment configuration, and operational readiness.

Out of scope for this plan:

- Deploying token contracts or minting/burning tokens.
- Custody or storage of issuer private keys.
- On-chain registry contracts or on-chain attestations.
- Replacing legal/compliance review with automated checks. Compliance requirements must be confirmed for the jurisdictions and product scope.

## Target Architecture

Keep the first implementation in the existing API monolith:

1. The issuer dashboard authenticates users and calls the API under `/api/v1`.
2. Existing JWT authentication identifies the user; issuer membership and staff permissions authorize each request.
3. An `IssuersModule` owns submission, review, and registry workflows.
4. Drizzle/PostgreSQL persist organizations, memberships, submissions, review history, and published registry entries.
5. Evidence is linked or stored in private object storage; sensitive documents are not exposed through public registry endpoints.
6. Audit events record security-sensitive and workflow actions.

Do not create a separate microservice or smart contract for the initial registry workflow.

## Work Plan

### Phase 0: Confirm product and policy decisions

- Define who can create an issuer organization and invite/manage its members.
- Decide whether issuer users share existing MCBuse accounts or use a separate authentication boundary. Reuse the existing JWT infrastructure only if account lifecycle, session policy, and MFA requirements are suitable.
- Define the supported networks and canonical network identifiers. The current UI offers Ethereum, Solana, Base, Polygon, and Other; replace display labels with validated chain identifiers where possible.
- Decide which submission fields are required, what is visible publicly, and whether attestations are submitted as URLs, uploaded documents, or both.
- Define review states and permitted transitions, including changes after rejection, approval, publication, delisting, or issuer withdrawal.
- Set KYB, sanctions-screening, beneficial-owner, evidence-retention, and reviewer requirements with the compliance owner.
- Confirm whether review is single-person or requires a second approver for publication.

**Exit criteria:** Decisions are recorded; the API contract and data model can be implemented without relying on assumptions from the prototype.

### Phase 1: Data model and migrations

Add Drizzle schema and reviewed SQL migrations for:

- `issuer_organizations`: legal identity, verification status, lifecycle status, and timestamps.
- `issuer_memberships`: organization/user relationship, role, invitation or membership status, and timestamps.
- `stablecoin_submissions`: organization, submitter, token metadata, reserve disclosures, attestation references, status, submission/review timestamps, and version.
- `submission_review_events`: append-only review actions, reviewer, decision, checklist/evidence references, reason, and timestamp.
- `stablecoin_registry_entries`: approved public data, linked to the source submission, publication status, and revision history as needed.

Data constraints and behavior:

- Scope every issuer-owned record to an organization and index the ownership/status lookup paths.
- Enforce token identity uniqueness by canonical network plus normalized contract or mint address. Do not make ticker alone globally unique; different tokens can legitimately reuse a ticker.
- Preserve rejected and superseded submissions; do not overwrite review history.
- Keep private KYB data and evidence references separate from public registry fields.
- Use transactions for state changes that must update a submission, review event, and registry entry together.

**Exit criteria:** Migrations apply to a clean database and an existing development database; schema constraints cover the agreed identity and lifecycle rules.

### Phase 2: Authentication, authorization, and issuer verification

- Add organization membership lookup and reusable authorization guards/decorators for issuer roles and staff reviewer roles.
- Require organization-scoped authorization on every issuer resource read or write; never trust organization IDs supplied by the browser without checking membership.
- Protect reviewer/admin routes with server-side staff permissions. A dashboard role toggle is not an authorization mechanism.
- Add account and organization lifecycle checks so disabled users or suspended organizations cannot submit or review.
- Add an issuer verification workflow. Start with documented manual KYB checks if no provider is selected; persist verification status and reviewer/evidence metadata rather than hard-coding a vendor.
- Require MFA or step-up authentication for staff review and account/security changes if supported by the chosen identity setup.
- Add rate limits and abuse monitoring to signup/invitation, submission, and verification-sensitive endpoints.

**Exit criteria:** Automated tests prove an issuer cannot view or modify another issuer's records and cannot call staff review operations.

### Phase 3: Issuer API and review workflow

Create `apps/api/src/issuers/` with a Nest module, controllers, DTOs, services, persistence access, and focused tests. Register it in `AppModule` and document it in Swagger.

Initial API surface (final names may follow established API conventions):

- `GET /issuer/me`: current user's issuer organizations and roles.
- `GET /issuer/submissions`: current organization's submissions, paginated and filterable.
- `POST /issuer/submissions`: create a draft submission.
- `GET /issuer/submissions/:id`: read an authorized submission and its issuer-visible history.
- `PATCH /issuer/submissions/:id`: update an authorized draft or returned submission.
- `POST /issuer/submissions/:id/submit`: validate and transition a submission to review.
- `GET /admin/issuer/submissions`: reviewer queue with status/search/pagination filters.
- `GET /admin/issuer/submissions/:id`: reviewer view with required evidence.
- `POST /admin/issuer/submissions/:id/decision`: approve or reject with completed checklist and decision reason.
- `GET /registry/stablecoins`: return only approved and published public fields.

Workflow requirements:

- Validate all input on the server; normalize network and token identifiers.
- Enforce valid state transitions in the service layer, not in the UI.
- Require rejection reasons and all required checks before approval.
- Record each submission, verification, reviewer, and publication action in an append-only event history and security audit log.
- Prevent duplicate/replayed decisions and conflicting updates; use transactions and optimistic version checks or equivalent concurrency control.
- Return stable pagination, filter, and error contracts suitable for the dashboard.

**Exit criteria:** API tests cover successful submission/review, invalid transitions, duplicate token identity, authorization failures, concurrent/stale decisions, and public registry visibility.

### Phase 4: Evidence and fraud controls

- For the first release, validate and store issuer-provided attestation URLs without fetching arbitrary URLs from the API. Render external links safely in the browser.
- Define how legal-entity evidence is collected, who can view it, how long it is retained, and how deletion/legal holds work.
- If file uploads are required, use private object storage with short-lived signed URLs, strict file size/type limits, malware scanning, encryption, and access logging.
- Verify control of a submitted token address using a one-time signed challenge where technically supported. Never collect private keys. A signature establishes control of a wallet, not that the legal issuer owns or endorses the token; keep that distinction in review guidance.
- Use independent review for high-risk decisions or publication if required by policy. Preserve reviewer identity and evidence used for the decision.
- Ensure public endpoints never expose KYB documents, reviewer-only notes, personal data, or internal risk signals.

**Exit criteria:** Security review confirms evidence is private by default, user-supplied links cannot trigger server-side request forgery, and reviewer decisions are attributable and auditable.

### Phase 5: Connect the dashboard to live services

- Replace `initialRequests` and local state mutations in `apps/issuers-dashboard/app/page.tsx` with API-backed data fetching and mutations.
- Implement the agreed login/session flow and attach credentials securely to API requests. Configure the API CORS allowlist for the deployed dashboard origin.
- Derive issuer/admin views from server-authorized roles; remove the client-only role toggle or make it a workspace switch that only appears for users with both authorized roles.
- Connect submission form, detail view, reviewer checklist, decision controls, counts, search, filters, and history to API responses.
- Implement loading, empty, validation, permission-denied, network-error, and retry states. Disable duplicate submissions while requests are pending and show clear success/failure feedback.
- Add pagination and avoid loading the entire submission set into browser state.
- Keep public registry data separate from issuer-only and reviewer-only response models.

**Exit criteria:** Issuer users can submit and track their own applications; authorized reviewers can review and decide; unauthorized actions fail visibly and safely; data remains correct after refresh and across browser sessions.

### Phase 6: Verification, deployment, and operations

- Add unit tests for submission rules, authorization, and transitions; API integration/e2e tests for the issuer and reviewer workflows; dashboard tests for key forms and states.
- Add a local end-to-end smoke test covering issuer login, submission, reviewer decision, and public registry visibility.
- Add development-only seed data with distinct issuer/reviewer identities. Never seed demo identities or sample financial claims in production.
- Configure production secrets, database migrations, dashboard/API origins, cookie or token settings, and private storage credentials. Use the repository's deployment process and run migrations as a controlled release step.
- Add structured logs, correlation IDs, metrics for submission/review outcomes, alerts for repeated failures or suspicious activity, database backup/restore checks, and documented support/revocation procedures.
- Run API and dashboard lint, type checks, tests, and production builds in CI.
- Perform a security review focused on tenant isolation, staff privilege boundaries, PII handling, file access, and account recovery before production launch.

**Exit criteria:** A production-like deployment passes smoke tests, health checks, migration verification, security review, backup/restore expectations, and the operational runbook is assigned to an owner.

## Suggested Delivery Order

1. Complete Phase 0 decisions and agree on a versioned API contract.
2. Implement schema/migrations and issuer/staff authorization together.
3. Implement issuer submission and reviewer workflows with tests.
4. Complete evidence handling and fraud controls for the agreed MVP level.
5. Wire the dashboard to the live API and remove mock-only behavior.
6. Run end-to-end, security, deployment, and operational readiness checks.

## Definition of Done

The dashboard is operational when:

- Issuer identity and organization membership are verified and enforced server-side.
- Issuers can submit, view, and update only permitted submissions for their organization.
- Reviewers can access the queue and record authorized, auditable decisions.
- Only approved and published entries appear in the public registry.
- Evidence and sensitive data are access-controlled and never exposed by public endpoints.
- Duplicate token identities, invalid state transitions, and cross-organization access are rejected by the API.
- The dashboard uses persisted API data, handles failure states, and does not rely on local sample data or a client-controlled role.
- Automated checks, deployment smoke tests, monitoring, backups, and a security review meet the agreed launch criteria.

## Key Dependencies and Risks

- KYB, sanctions, retention, and reviewer policy require a named compliance owner and jurisdiction-specific decisions.
- Account sharing versus a separate issuer identity boundary affects auth, MFA, and account recovery design.
- Evidence uploads require an approved storage provider and operational process; URL-only submissions are a smaller MVP but provide weaker evidence custody.
- A registry approval is an off-chain MCBuse decision. It does not deploy, guarantee, or technically control an issuer's token.
- Network-specific token verification differs, particularly between account-based contracts and Solana mint addresses; supported networks need explicit validation rules.