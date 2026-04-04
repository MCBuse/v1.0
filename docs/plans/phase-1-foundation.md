# Phase 1: Foundation

## Goal

Set up the NestJS API with all cross-cutting infrastructure — database, config, logging, security, API docs, and health check — so every subsequent phase builds on a solid, secure, observable base.

## Files

### Config & Environment
- `apps/api/src/main.ts` — **modify**: add global pipes, Swagger setup, helmet, logger, API prefix
- `apps/api/src/app.module.ts` — **modify**: register ConfigModule, ThrottlerModule, LoggerModule, DrizzleModule, HealthModule
- `apps/api/.env.example` — env var template (never real secrets)
- `apps/api/.env` — local dev env vars (gitignored)

### Database (Drizzle + Neon)
- `apps/api/src/database/database.module.ts` — NestJS module that provides Drizzle client
- `apps/api/src/database/database.provider.ts` — Drizzle client factory (Neon serverless driver)
- `apps/api/src/database/schema/index.ts` — barrel export for all schemas
- `apps/api/src/database/schema/users.ts` — users table schema
- `apps/api/src/database/schema/wallets.ts` — wallets table schema
- `apps/api/src/database/schema/balances.ts` — balances table schema
- `apps/api/src/database/schema/ledger-entries.ts` — double-entry ledger schema
- `apps/api/src/database/schema/payment-requests.ts` — payment requests schema
- `apps/api/src/database/schema/audit-logs.ts` — audit log schema
- `apps/api/src/database/schema/refresh-tokens.ts` — refresh token schema
- `apps/api/drizzle.config.ts` — Drizzle Kit config for migrations

### Logging
- `apps/api/src/logging/logging.module.ts` — pino logger module
- `apps/api/src/logging/logging.config.ts` — pino config (redaction, serializers, levels)
- `apps/api/src/logging/correlation-id.middleware.ts` — assigns/propagates correlation ID per request

### Security
- `apps/api/src/common/pipes/validation.pipe.ts` — global validation pipe config (whitelist, forbidNonWhitelisted, transform)
- `apps/api/src/common/filters/http-exception.filter.ts` — global exception filter (generic error messages, no stack traces to client, structured error logging)
- `apps/api/src/common/interceptors/logging.interceptor.ts` — request/response logging with timing

### Health Check
- `apps/api/src/health/health.module.ts` — health check module
- `apps/api/src/health/health.controller.ts` — GET /health (DB connectivity, uptime, version)

### API Documentation
- `apps/api/src/common/swagger.config.ts` — Swagger/OpenAPI setup (title, description, version, auth scheme, tags)

### Shared Types
- `packages/shared/src/index.ts` — barrel export
- `packages/shared/src/constants/currencies.ts` — USDC, EURC constants
- `packages/shared/src/constants/wallet-types.ts` — savings, routine constants
- `packages/shared/src/enums/transaction-type.enum.ts` — transfer types (on-ramp, off-ramp, p2p, swap, internal)
- `packages/shared/src/enums/payment-request-status.enum.ts` — pending, completed, expired, cancelled
- `packages/shared/package.json` — shared package config

## Steps

### Step 1: Install dependencies
Install all Phase 1 packages into `apps/api` and create `packages/shared`.

**Packages for apps/api:**
```
@nestjs/config @nestjs/swagger swagger-ui-express @nestjs/throttler
nestjs-pino pino pino-http pino-pretty(dev)
drizzle-orm @neondatabase/serverless
class-validator class-transformer
helmet
uuid @types/uuid(dev)
drizzle-kit(dev)
```

**Packages for packages/shared:**
```
typescript(dev)
```

**Verify:** `pnpm install` succeeds, `pnpm run build` in api passes.

### Step 2: Environment config
Create `.env.example` and `.env` with all required vars. Set up `ConfigModule.forRoot()` in AppModule with validation. Create a typed config service.

**Verify:** App starts, `configService.get('DATABASE_URL')` returns value.

### Step 3: Structured logging
Set up `nestjs-pino` with correlation ID middleware, redaction rules (authorization headers, passwords), and request/response logging. Replace NestJS default logger globally.

**Verify:** App starts, every request logs structured JSON with correlationId, method, path, status, duration. Passwords/tokens are redacted.

### Step 4: Database connection & schema
Create Drizzle module with Neon serverless driver. Define all table schemas (users, wallets, balances, ledger_entries, payment_requests, audit_logs, refresh_tokens). Run initial migration.

**Verify:** `pnpm drizzle-kit push` succeeds. Tables exist in Neon. App starts and connects to DB.

### Step 5: Global security
Add `helmet` for HTTP headers. Configure `ThrottlerModule` (100 req/min global). Create global `ValidationPipe` (whitelist, forbidNonWhitelisted, transform). Create global `HttpExceptionFilter` (generic error messages, log full error internally, never leak stack traces).

**Verify:** Unknown fields in request body are stripped. Invalid DTOs return 400. Rate limit returns 429 after threshold. Response headers include security headers.

### Step 6: Logging interceptor
Create interceptor that logs every request/response with timing, user ID (when available), and action context.

**Verify:** Every API call produces a structured log entry with duration.

### Step 7: Health check
Create health controller at `GET /health` — checks DB connectivity, returns uptime, version, environment.

**Verify:** `GET /health` returns 200 with DB status.

### Step 8: Swagger/OpenAPI docs
Configure Swagger at `/api/docs` with API title, description, version, JWT bearer auth scheme, and module-based tag groups. Add example DTO documentation.

**Verify:** `/api/docs` renders interactive Swagger UI. Health endpoint is documented.

### Step 9: Shared package
Create `packages/shared` with currency constants, wallet type constants, and transaction/payment-request enums. Wire into Turborepo.

**Verify:** `apps/api` can import from `@repo/shared`. Build passes.

## Dependencies

- Neon Postgres database (free tier) — need a `DATABASE_URL`
- All npm packages listed in Step 1
- Node.js 18+

## Open Questions

- **Neon project:** Do you already have a Neon project, or should I include setup instructions?
- **API port:** Using 3001 to avoid conflict with Next.js web on 3000. OK?
- **API prefix:** `/api/v1` for all routes? Or just `/v1`?
