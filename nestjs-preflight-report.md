# Preflight check: mcbuse-api (`apps/api`)

First run 2026-10-01 · fixes applied 2026-10-03 · @nestjs/core 11.1.19 · Node 22 (`node:22-slim`) · Google Cloud Run (europe-west1)
Context: `--max-instances=2`, `--min-instances=0`, `--concurrency=20`, `--cpu-throttling`, 512Mi, `--timeout=60s`; `DATABASE_POOL_MAX=5`; `FINANCIAL_MODE=sandbox`, `MONEY_INITIATION_ENABLED=true` (`scripts/cloud-run/deploy.sh`, `deploy/cloud-run/api.env.yaml`)

## Verdict: Ready for the sandbox deploy, with known open items

Both FAILs are fixed, and so are 7 of the 10 WARNs. Nothing left blocks a deploy. The items still open are follow-up projects (scheduled jobs, CI, circuit breakers, APM), one question for whoever has the database console, and one manual cleanup (old Cloud Build tarballs that contain a production database dump). The cleanup is urgent. Deploying still needs Fred's approval. Migration `0034` runs automatically through the `mcbuse-api-migrate` job in `deploy.sh`.

| Status | Before | After |
|---|---|---|
| FAIL — fix before deploying | 2 | 0 |
| WARN — fixed in this round | — | 7 (checks 1, 5, 8, 9, 11, 16, plus engines from 10) |
| Side finding — fixed | — | 1 (unique-violation handlers that never matched) |
| WARN — still open | 10 | 4 (checks 4, 10-CI, 12, 17) + 1 manual cleanup |
| VERIFY | 1 | 1 (check 14, pool math) |
| PASS | 4 | 4 |

**How to read this report.** Each fixed item has five parts: **What was wrong**, **Why it matters**, **The fix**, **Before / After** code from the real diff, and a **Lesson** to carry into the next service. Most of these bugs are not exotic. They come from defaults: things Node, Nest, Docker or Cloud Run do when you don't tell them otherwise. Most of the lessons come down to knowing what the default is.

## Assumptions

- One proxy hop: the Cloud Run Google Front End. No external load balancer or Cloud Armor appears in the repo (`--ingress=all`, `--allow-unauthenticated`).
- During a deploy, at most 2 old and 2 new instances run at the same time.
- The database is managed Postgres behind PgBouncer. A `pgbouncer` schema appears in the backup TOC. `max_connections` is unknown.
- `apps/portal`, `apps/mobile` and `Dockerfile.credit-scoring` (Python) were out of scope for the review. The mobile app was changed for check 9 only.

---

## FIXED — Blockers

### 2. Handle SIGTERM and get the container right

**What was wrong.** `main.ts` never called `app.enableShutdownHooks()`. The Docker image also ran as root, had no memory cap for V8, and started Node without source maps.

**Why it matters.** Cloud Run stops containers all the time: on every deploy, every scale-in, every move to another host. It sends `SIGTERM`, waits **10 seconds**, then sends `SIGKILL`. Node's default response to `SIGTERM` is to exit at once. In practice that meant:
- A request in the middle of a money transaction was cut off. Postgres rolled the transaction back, which is safe, but the client got a dropped connection instead of an answer.
- The `onModuleDestroy` hooks in 5 services never ran (the `setInterval` loops in payments, payment requests and merchant inventory, the operation runner, the analytics orchestrator).
- The pg pool was never closed, so Postgres and PgBouncer kept the dead connections until they timed out. That eats into the connection budget described in check 14.

Container problems:
- **Root user.** If someone gets code execution through any dependency, they are root inside the container.
- **No heap cap.** V8 sizes its heap from what it thinks the machine has, not from the 512Mi Cloud Run limit. Under load it grows past 512Mi and Cloud Run OOM-kills the instance. That is a hard kill: no shutdown hooks, no error log.
- **No source maps.** Production stack traces pointed at compiled `dist/*.js` lines instead of your TypeScript.

**The fix.** Turn on shutdown hooks, close the pool in an `OnApplicationShutdown` hook, and fix the three Dockerfile defaults.

`apps/api/src/main.ts`, before:
```ts
const app = await NestFactory.create(AppModule, {
  bufferLogs: true,
  rawBody: true,
});

const configService = app.get(ConfigService);
```
After:
```ts
const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  bufferLogs: true,
  rawBody: true,
});

// Run onModuleDestroy / onApplicationShutdown on SIGTERM so Cloud Run
// scale-in drains timers and the pg pool instead of killing them mid-flight.
app.enableShutdownHooks();
// Cloud Run's Google Front End is one proxy hop; trust it so req.ip (and the
// throttler) sees the real client address.
app.set('trust proxy', 1);

const configService = app.get(ConfigService);
```

`apps/api/src/database/database.module.ts`, before:
```ts
export class DatabaseModule {}
```
After:
```ts
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  // Runs after every onModuleDestroy, so services have stopped their timers
  // before the pool goes away.
  async onApplicationShutdown() {
    await (this.db as DrizzleDB & { $client: Pool }).$client.end();
    Logger.log('Database pool closed', 'DatabaseModule');
  }
}
```

`Dockerfile.api` (runner stage), before:
```dockerfile
ENV NODE_ENV=production
ENV PORT=4000
...
EXPOSE 4000

CMD ["node", "dist/src/main.js"]
```
After:
```dockerfile
ENV NODE_ENV=production
ENV PORT=4000
# Cap the V8 heap below the 512Mi instance limit so Node GCs harder instead of
# being OOM-killed by Cloud Run.
ENV NODE_OPTIONS=--max-old-space-size=384
...
EXPOSE 4000

USER node

CMD ["node", "--enable-source-maps", "dist/src/main.js"]
```
This also fixes **check 16** (source maps).

**Why the order works.** On shutdown Nest calls `onModuleDestroy` on every provider, then `beforeApplicationShutdown`, then `onApplicationShutdown`. The services clear their timers in the first phase and the pool closes in the last, so no timer can fire against a closed pool. The workers (`recovery-worker.ts`, `analytics-intelligence/worker.ts`) call `app.close()`, which runs the same hooks, so they now close the pool cleanly before `process.exit`.

**Verified.** I ran the built API locally with a probe on `Pool.prototype.end`, then sent `kill -TERM <pid>`. Output: `SIGTERM received` → `pool.end() called`. Before the fix, `pool.end()` was never called.

**What still applies.** Cloud Run allows only 10 s after SIGTERM, but `--timeout=60s`. A request that runs longer than 10 s during a shutdown is still cut. Keep money paths well under that. The new outbound timeouts in check 11 help.

**Lesson.**
- In Nest, lifecycle hooks such as `onModuleDestroy` **do nothing on a signal** unless `enableShutdownHooks()` is called. Writing the hook is half the job.
- Anything that opens a long-lived resource (a pool, a socket, an interval) needs a matching close hook.
- In a container: run as a non-root user, cap the heap at about 75% of the memory limit, and pass `--enable-source-maps` if you build TypeScript.

---

### 6. Rate limits, trust proxy, and the password-reset takeover

**What was wrong.** Four separate problems combined into one account-takeover path:
1. `ThrottlerModule.forRootAsync(...)` was configured in `app.module.ts`, but `ThrottlerGuard` was never registered. **No route was rate-limited.**
2. `POST /auth/reset-password` accepts a 6-digit code (900,000 possible values) that stays valid for 15 minutes, and it **had no attempt counter**.
3. `POST /auth/forgot-password` issued a new code every time it was called, with no limit.
4. There was no `trust proxy`, so `req.ip` was the Google Front End's address. If the throttler had been on, every user would have shared one bucket: one attacker could get everyone throttled.

**Why it matters: the arithmetic.** An attacker who knows a user's email:
- calls `forgot-password` once, then sends guesses to `reset-password`
- each guess costs one bcrypt compare, about 0.3 s at 12 rounds
- 2 instances × 20 concurrent requests is about 130 guesses per second
- one 15-minute code window allows about 120,000 guesses, roughly a **13% chance** of hitting the code
- they call `forgot-password` again and keep going. After 5 windows, about 75 minutes, the chance passes **50%**.

The result is a full account takeover, including the user's custodial wallets. Without throttling, `login` was also open to targeted lockout (10 bad passwords lock the account, `users.service.ts:303`), and `signup`/`forgot-password` could be used to run up SMS costs once `OTP_PROVIDER` is no longer `mock`.

**The fix, in four layers.** Each layer covers a gap in the one before it.

**(a) Actually enforce the throttler.** In `app.module.ts`, before:
```ts
providers: [
  AppService,
  {
    provide: APP_GUARD,
    useClass: JwtAuthGuard,
  },
],
```
After:
```ts
providers: [
  AppService,
  {
    provide: APP_GUARD,
    useClass: JwtAuthGuard,
  },
  // ThrottlerModule only configures limits; this guard is what enforces them.
  {
    provide: APP_GUARD,
    useClass: ThrottlerGuard,
  },
],
```

**(b) See the real client IP.** `app.set('trust proxy', 1)` in `main.ts` (shown under check 2). The `1` means "trust exactly one hop". If it were `true`, an attacker could send a fake `X-Forwarded-For` header and pick their own bucket.

**(c) Much tighter limits on credential endpoints.** In `auth/auth.controller.ts`:
```ts
// Credential and code-guessing endpoints: 5 requests per minute per client IP.
// The global default (THROTTLE_LIMIT) is far too loose for these.
const AUTH_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@Public()
@Post('login')
@Throttle(AUTH_THROTTLE)
...
```
This is applied to `signup`, `login`, `login/phone`, `forgot-password`, `reset-password`, `phone/send-otp` and `phone/verify-otp`. Webhooks (`onramp-webhooks.controller.ts`, `circle-webhook.controller.ts`) and `/health` get `@SkipThrottle()`: providers send webhooks from a few IPs, and a health probe must never get a 429. `/health/operations` keeps the global throttle on purpose, because it is token-gated and guessing that token is exactly what a throttle should slow down.

**(d) Cap guesses in the database.** Layers (a)–(c) can be bypassed by rotating IPs. This layer can't, because the count is stored on the code itself.

Schema (`database/schema/password-reset-codes.ts`) and migration `drizzle/0034_password_reset_attempts.sql`:
```sql
ALTER TABLE "password_reset_codes" ADD COLUMN IF NOT EXISTS "attempts" integer DEFAULT 0 NOT NULL;
```

`auth.service.ts` `resetPassword`, before:
```ts
const candidate = rows[0] ?? null;
if (!candidate || !(await bcrypt.compare(input.code, candidate.codeHash))) {
  throw new BadRequestException('Invalid or expired reset code');
}

const newHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);

await this.db.transaction(async (tx) => {
  await tx
    .update(schema.passwordResetCodes)
    .set({ consumedAt: new Date() })
    .where(eq(schema.passwordResetCodes.id, candidate.id));
```
After:
```ts
const candidate = rows[0] ?? null;
if (!candidate) {
  throw new BadRequestException('Invalid or expired reset code');
}

// Claim a guess BEFORE comparing. The conditional UPDATE is atomic, so even
// parallel requests can't get more than RESET_CODE_MAX_ATTEMPTS compares.
const claimed = await this.db
  .update(schema.passwordResetCodes)
  .set({ attempts: sql`${schema.passwordResetCodes.attempts} + 1` })
  .where(
    and(
      eq(schema.passwordResetCodes.id, candidate.id),
      isNull(schema.passwordResetCodes.consumedAt),
      lt(schema.passwordResetCodes.attempts, RESET_CODE_MAX_ATTEMPTS),
    ),
  )
  .returning({ id: schema.passwordResetCodes.id });
if (claimed.length === 0) {
  throw new BadRequestException('Invalid or expired reset code');
}

if (!(await bcrypt.compare(input.code, candidate.codeHash))) {
  throw new BadRequestException('Invalid or expired reset code');
}

const newHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);

await this.db.transaction(async (tx) => {
  // Conditional so two concurrent correct submissions can't both reset.
  const consumed = await tx
    .update(schema.passwordResetCodes)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(schema.passwordResetCodes.id, candidate.id),
        isNull(schema.passwordResetCodes.consumedAt),
      ),
    )
    .returning({ id: schema.passwordResetCodes.id });
  if (consumed.length === 0) {
    throw new BadRequestException('Invalid or expired reset code');
  }
```

**Why "claim before compare" and not "count failures after"?** This is the most important idea in this report. The obvious version reads the row, compares, and adds 1 on failure. Under concurrency, 20 parallel requests all read `attempts = 0` before any of them writes, so all 20 get a compare, and the cap is decorative. The fixed version asks the database to "add 1 **only if** `attempts < 5`" in a single statement. Postgres serialises updates to the same row, so exactly 5 requests get a row back and the rest get nothing. The integration test fires 20 parallel guesses and checks that `attempts` ends at exactly 5.

`forgotPassword`, before:
```ts
const code = String(randomInt(100000, 1000000));
...
await this.db.insert(schema.passwordResetCodes).values({
  userId: user.id,
  channel,
  codeHash,
  expiresAt,
});
```
After:
```ts
const [{ recent }] = await this.db
  .select({ recent: count() })
  .from(schema.passwordResetCodes)
  .where(
    and(
      eq(schema.passwordResetCodes.userId, user.id),
      gte(schema.passwordResetCodes.createdAt, new Date(Date.now() - 60 * 60_000)),
    ),
  );
// Silent, like the unknown-identifier case: each new code is a fresh set
// of guesses, so issuance has to be capped per user, not just per IP.
if (recent >= RESET_CODES_PER_HOUR) {
  this.logger.warn('Password reset issuance cap hit for user: ' + user.id);
  return;
}

const code = String(randomInt(100000, 1000000));
...
await this.db.transaction(async (tx) => {
  // Only the newest code is ever valid.
  await tx
    .update(schema.passwordResetCodes)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(schema.passwordResetCodes.userId, user.id),
        isNull(schema.passwordResetCodes.consumedAt),
      ),
    );
  await tx.insert(schema.passwordResetCodes).values({ userId: user.id, channel, codeHash, expiresAt });
});
```

**New arithmetic.** 5 guesses per code × 5 codes per hour = **25 guesses per hour**, about 0.003% per hour, down from about 50% in 75 minutes. Every code also sends an email or SMS to the real owner, so a long attack is noisy. If you want it tighter later, lock resets for the account after N used-up codes in a day, and tell the user.

**Verified.**
- `src/auth/auth.service.int-spec.ts` (new, runs against real Postgres) has 4 passing tests: the right code is rejected after 5 misses, 20 parallel guesses leave `attempts` at exactly 5, the right code within the limit works and can't be used twice, and a new code invalidates the old one.
- Running the built API locally, 6 bad `POST /auth/login` calls returned `401 401 401 401 401 429`.

**Known ceiling.** The throttler keeps its counts in memory on each instance, so with 2 instances the real limit is 2× the configured one. That's fine at this size. If you scale out, move it to Redis. Layer (d) doesn't depend on this.

**Lesson.**
- Registering a module configures it; it doesn't apply it. A Nest guard does nothing until it's `@UseGuards` or an `APP_GUARD`. After adding security middleware, test it: send the 6th request and look for the 429.
- Any short secret a user types (OTP, reset code, PIN) needs a **per-secret attempt counter stored with the secret**. IP throttling alone isn't enough.
- To enforce a limit under concurrency, write the check and the increment as **one conditional UPDATE**. Never read, compare in JS, then write.
- Behind a proxy, set `trust proxy` to the exact hop count, or every IP-based control is wrong.

---

## FIXED — Should fix

### 1. Production database dump uploaded on every deploy

**What was wrong.** `deploy.sh` runs `gcloud builds submit "$repo_root"`. Because a `.gcloudignore` exists, gcloud **ignores `.gitignore` completely** and uses only `.gcloudignore`, and that file didn't exclude `backups/`. Every deploy uploaded `backups/credit-pilot-2026-09-21/database.dump`, a production database dump, to the Cloud Build source bucket.

**Why it matters.** Anyone with read access to `gs://<project>_cloudbuild` (a broad role in most projects) could download every user's data. It is also a GDPR exposure.

**The fix.** `.gcloudignore`, added:
```
# Local data that must never leave the machine (prod DB dumps, scratch output)
/backups/
/tmp/
/output/
/Claude outputs/
```
`.dockerignore` got the same entries. `.env.local` was already covered by `**/.env.*`.

**Verified.** `gcloud meta list-files-for-upload .` now lists 0 files under those folders.

**⚠️ Still to do by hand (I didn't run it, because it deletes data).** The old uploads are still in the bucket. List them, then delete them:
```sh
gcloud storage ls gs://<project>_cloudbuild/source/
gcloud storage rm "gs://<project>_cloudbuild/source/**"
```
Also check whether any Artifact Registry image layers were built from a context that included `backups/`. `.dockerignore` didn't list it either, but `Dockerfile.api` only `COPY`s `apps/api` and `packages/shared`, so the image layers themselves should be clean.

**Lesson.**
- `.gcloudignore`, `.dockerignore` and `.gitignore` are **three separate lists**. Having one doesn't mean the others apply. When you add a folder of sensitive local data, add it to all three.
- Keep production dumps out of the repo folder entirely, for example in `~/secure/`.

### 5. Circle webhook accepted unsigned events in production

**What was wrong.** When `CIRCLE_WEBHOOK_SECRET` was unset, `verifySignature` logged a warning and **accepted the webhook anyway**. It is unset in production.

**Why it matters.** A forged `{"status": "paid"}` webhook would settle the matching pending on-ramp and credit money that never arrived. It's only exploitable while `ONRAMP_PROVIDER=circle` (production uses `stripe` today) and the attacker knows a Circle payment ID. But it is a time bomb: switching the provider would arm it silently.

Before (`onramp/circle/circle-webhook.controller.ts`):
```ts
if (!secret) {
  // Sandbox / dev — no secret configured, skip verification
  this.logger.warn('CIRCLE_WEBHOOK_SECRET not set — skipping signature verification');
  return;
}
```
After:
```ts
if (!secret) {
  // Fail closed: without a secret anyone could forge a "paid" event and
  // settle an on-ramp. Only local/sandbox dev may skip verification.
  if (process.env.NODE_ENV === 'production') {
    throw new UnauthorizedException('Circle webhook verification is not configured');
  }
  this.logger.warn('CIRCLE_WEBHOOK_SECRET not set — skipping signature verification');
  return;
}
```

**Lesson.** A missing security setting must **fail closed**. "Skip the check if not configured" is fine in dev only if production refuses to run that way.

### 8. Swagger was public in production

**What was wrong.** `setupSwagger(app)` ran unconditionally, so `/api/docs` served the full API schema to anyone.

**Why it matters.** It's a free map of every route, DTO and auth requirement, which makes probing for weak spots (like check 6) much faster.

Before (`main.ts`):
```ts
setupSwagger(app);
```
After:
```ts
if (process.env.NODE_ENV !== 'production') {
  setupSwagger(app);
}
```
**Verified by reading the code, not at runtime.** Running locally with `NODE_ENV=production` is blocked, correctly, by the config checks (placeholder JWT secrets, environment separation). In dev, `/api/docs` still returns 200.

**Lesson.** Debug and documentation surfaces (Swagger, GraphQL playground, `/debug`) should be off by default and turned on per environment.

### 9. Money writes that weren't safe to retry

**What was wrong.** `POST /swap`, `POST /onramp` and `POST /offramp` each created their idempotency key on the **server** with `randomUUID()`. `/swap` also ignored the `MONEY_INITIATION_ENABLED` kill switch.

**Why it matters.** An idempotency key exists so that "the same request, sent twice" is recognised as one operation. Only the **client** knows when two requests are the same attempt. Picture a phone on a train: it sends the swap, the response is lost in a tunnel, and the app or the user retries. The server sees a fresh UUID, treats the retry as a new swap, and runs it again: double debit. A key generated on the server is different on every request, so it can never catch a retry.

**The fix.** It has three parts, plus backwards compatibility.

1. **The client sends a stable key.** In mobile `features/swap/repository.ts`, before:
   ```ts
   async execute(input: SwapExecuteInput): Promise<SwapExecuteResponse> {
     const raw = await http.post<unknown>('/swap', input);
     return swapExecuteResponse.parse(raw);
   },
   ```
   After:
   ```ts
   async execute(input: SwapExecuteInput): Promise<SwapExecuteResponse> {
     // Same key on every retry of this swap, so a lost response can't swap twice.
     const intent = await moneyIntent('swap', input);
     const raw = await http.post<unknown>('/swap', input, {
       headers: { 'Idempotency-Key': intent.key },
     });
     await finishMoneyIntent('swap');
     return swapExecuteResponse.parse(raw);
   },
   ```
   `moneyIntent()` already existed (`lib/api/money-intent.ts`, used by transfers and funding). It stores the key in SecureStore, so the same key survives an app restart. The key is cleared after a successful response. Otherwise a deliberate second swap of the same amount would be replayed as the first. The same pattern is in `features/offramp/repository.ts` and in `features/payments/repository.ts` (`topUp` → `/onramp`).

2. **The server scopes the key to the user.** This is in the new shared helper `apps/api/src/common/idempotency-key.ts`:
   ```ts
   /**
    * ledger_entries.idempotency_key is unique across ALL users, so a raw client
    * key could collide with (or probe for) someone else's entry. Scope it.
    * No client key → a fresh UUID, i.e. the old non-idempotent behaviour.
    */
   export function ledgerIdempotencyKey(kind: string, userId: string, clientKey: string | undefined): string {
     return clientKey ? `${kind}:${userId}:${clientKey}` : randomUUID();
   }
   ```
   This matters because the ledger key column is **globally unique**. If the raw client key were used, user B could send user A's key and either get a unique-constraint error, which proves the key exists, or, in a worse design, get A's result back.

3. **The server replays instead of re-executing.** In `swap.service.ts`, before:
   ```ts
   async execute(userId: string, dto: ExecuteSwapDto) {
     ...
     const idempotencyKey = randomUUID();

     // Get live rate (outside transaction — read-only)
   ```
   After:
   ```ts
   async execute(userId: string, dto: ExecuteSwapDto, clientKey?: string) {
     if (process.env.MONEY_INITIATION_ENABLED === 'false') throw new BadRequestException('New money movements are temporarily disabled');
     ...
     const idempotencyKey = ledgerIdempotencyKey('swap', userId, clientKey);

     // A retry of a swap that already settled: return the original result
     // instead of swapping again.
     const prior = await findLedgerEntryByKey(this.db, idempotencyKey);
     if (prior) return this.replay(userId, prior);

     // Get live rate (outside transaction — read-only)
   ```
   `replay()` rebuilds the original response from the ledger entry's metadata, plus the current balances. `feeCurrency` is now stored in that metadata so the replay is complete. `onramp.service.ts` and `offramp.service.ts` got the same lookup. The controllers read the header with `@Headers('idempotency-key')` and pass it through `optionalIdempotencyKey()`.

4. **Backwards compatibility.** The header is **optional** on these three routes. Mobile builds already in users' hands send no key and get the old behaviour (a fresh UUID). Once every client sends one, switch these three routes to `requireIdempotencyKey()`, as `/accounts/*` and `/wallets/transfer` already do. The two duplicate copies of `requireIdempotencyKey` in those controllers were also merged into the shared helper.

**Known ceiling (marked `ponytail:` in `swap.service.ts`).** If two requests with the same key arrive **at the same moment**, both miss the lookup and both call the provider. The unique ledger key lets only one transaction commit. The other rolls back, so no balance changes, and returns a 500, and the client's next retry gets the replay. The provider receives the key too, and real providers (Stripe, Circle, a DEX) dedupe on it. If that's ever not enough, add an "in progress" row that is inserted *before* the provider call.

**Lesson.**
- Idempotency keys must come from the client, be stable across retries of one intent, be scoped per user on the server, and be checked **before** the side effect (the provider call), not just at the database insert.
- A server-generated idempotency key protects against nothing.

### 10 (part). Node engine version

Root `package.json`, before: `"node": ">=18"`. After: `"node": ">=22"`. Node 18 is end-of-life. The engine field should match what runs in production (`node:22-slim`), so a teammate on Node 18 gets a warning instead of subtle runtime differences. CI and dependency auditing are still open (see below).

### 11. Time out every outbound call

**What was wrong.** Several outbound calls had no timeout:

| Call | Default without a timeout |
|---|---|
| `fetch` (Node) | waits forever |
| `@nestjs/axios` `HttpModule` | waits forever |
| Solana `Connection` | waits forever |
| Stripe SDK | 80 s, longer than Cloud Run's 60 s request timeout |
| Postgres | a statement can run forever and hold a pool connection |

**Why it matters.** The worst case was `rates.service.ts`: `onModuleInit` **awaits** a call to Frankfurter. If Frankfurter hung, the API never finished booting, Cloud Run's startup probe failed, and the deploy failed for a reason unrelated to your code. More generally, a hung upstream ties up the request, the pool connection it holds, and one of only 20 concurrency slots. A few hung calls can take down an instance that is otherwise healthy.

**The fix.**

`rates/rates.module.ts`, before → after:
```ts
imports: [HttpModule],
```
```ts
// Bounded: onModuleInit awaits the first rate fetch, so a hanging upstream
// would otherwise block the whole API from booting.
imports: [HttpModule.register({ timeout: 5000 })],
```
`onramp/onramp.module.ts` (the Circle client): `HttpModule` became `HttpModule.register({ timeout: 10_000 })`.

`otp/providers/twilio-otp.provider.ts` (both calls) and `offramp/moonpay-offramp.provider.ts`:
```ts
const res = await fetch(`${this.baseUrl}/Verifications`, {
  method: 'POST',
  headers: { ... },
  body: new URLSearchParams({ To: phone, Channel: 'sms' }).toString(),
  signal: AbortSignal.timeout(10_000), // added
});
```

`solana/solana.service.ts`, before:
```ts
this.connection = new Connection(rpcUrl, 'confirmed');
```
After:
```ts
// web3.js has no default timeout; a hung RPC node would hang the request.
this.connection = new Connection(rpcUrl, {
  commitment: 'confirmed',
  fetch: (input, init) =>
    fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
});
```

`stripe/stripe.client.ts`. This one wasn't in the original report and turned up while grepping:
```ts
this.stripe = new Stripe(secretKey, {
  apiVersion: '2026-04-22.dahlia',
  typescript: true,
  // SDK default is 80s — longer than Cloud Run's 60s request timeout.
  timeout: 15_000,
  ...
```

`database/database.module.ts`, before:
```ts
const pool = new Pool(createPgPoolConfig(config));
```
After:
```ts
const pool = new Pool({
  ...createPgPoolConfig(config),
  // Postgres cancels any statement running longer than this, so a stuck
  // query can't pin a pool connection. Batch workers that need longer
  // can raise it via DATABASE_STATEMENT_TIMEOUT_MS.
  statement_timeout: Number(
    config.get('DATABASE_STATEMENT_TIMEOUT_MS') ?? 10_000,
  ),
});
```
**Why here and not in `database.config.ts`, as the first report suggested?** That file is shared with `migrate.ts` and the provisioning scripts. A 10 s cap there could kill a long migration (an index build, a backfill) halfway through. The timeout belongs to the request-serving app. The analytics and recovery workers also load `DatabaseModule`. If any of their queries legitimately take longer than 10 s, set `DATABASE_STATEMENT_TIMEOUT_MS` in their deploy scripts.

`scoring-client.ts` and `groq-narration.service.ts` already did this correctly ✓.

**Lesson.**
- Every network call needs an explicit timeout, and **most client defaults are "forever"**.
- The timeouts should be shorter than the layer above them: provider (5–15 s) < Cloud Run request (60 s), and money paths < the 10 s SIGTERM window where possible.
- Never `await` an external call in `onModuleInit` without a timeout. It turns someone else's outage into your failed deploy.

### 16. Source maps

Fixed with check 2 (`--enable-source-maps` in the Docker `CMD`). The catch-all filter was already sound.

---

## STILL OPEN

### 4. Scheduled jobs on Cloud Run (project)
All the jobs are safe to run on more than one replica: they use conditional `UPDATE … WHERE status=` statements and ledger idempotency keys. The real problem is that **in-process timers barely run on Cloud Run** with `--cpu-throttling` and `--min-instances=0`. CPU is throttled between requests, and there are no instances at all when the API is idle. `SolanaOnrampReconcileService` (`@Cron` every minute and every 5 minutes) and `CirclePollingService` effectively don't run. **Next step:** move them to the existing Cloud Scheduler → Cloud Run Job pattern (`deploy-recovery-worker.sh`). Payment-request expiry is already checked when a request is read, and the recovery worker handles invoice expiry hourly, so those can stay.

### 10. CI and dependency audit (project)
There is no `.github/` folder, so nothing runs `lint`, `check-types`, `test` or `pnpm audit --prod` on a PR, and there's no Renovate or Dependabot. **Next step:** a small GitHub Actions workflow that runs those four commands for `apps/api`, plus Dependabot for npm.

### 12. Circuit breakers (project)
There are none around Stripe, MoonPay, Twilio, Solana RPC or GCS. The check 11 timeouts cover the worst case (hanging forever). A breaker adds "stop calling it for 30 s once it's clearly down". **Next step:** `cockatiel` around Solana RPC first. (`@nestjs/resilience` needs Nest 12.)

### 17. APM and error tracking (project)
pino logs and correlation IDs are good, but nothing alerts you. **Next step:** add Sentry or OpenTelemetry, and alert on new error groups and on the 5xx rate.

### 14. Pool math (VERIFY: needs the database console)
Worst case: 5 connections × 4 instances during a rollout, plus the migrate job (5), the analytics worker (5) and the recovery worker (5) = **35** connections, plus any BI or admin tools. Does that fit under Postgres `max_connections`, or under the PgBouncer pool size if the app connects through it? Check 2 helps here: shutting-down instances now release their connections right away instead of leaving them to time out.

---

## FIXED — Side finding (not on the checklist)

### Unique-violation handlers that never matched

**What was wrong.** drizzle-orm ≥0.44 wraps every database error in `DrizzleQueryError`, and the original Postgres error goes on `.cause`. Two handlers checked `err.code === '23505'` (unique violation) on the wrapper itself:
- `users/users.service.ts`: meant to return 409 "Username is not available" with suggestions
- `data-capture/merchant-inventory.service.ts`: meant to return 409 "A product with that SKU already exists"

**Proof, not theory.** A duplicate username insert against the local database produced:
```
name DrizzleQueryError  code undefined  cause.code 23505  cause.constraint users_username_unique
```
So neither `if` ever matched. A duplicate username at signup (for example, two people racing for the same name) or a duplicate SKU fell through to the catch-all filter as a **500**. The user saw "Internal server error" instead of "that name is taken", and your logs showed an error that wasn't a real server failure.

**Why nobody noticed.** Unit tests that mock the error as `{ code: '23505' }` pass, because they test the shape the code *expects*, not the shape the driver *produces*. The drizzle upgrade changed that shape and nothing failed.

**The fix.** One helper that unwraps the error, used at both sites.

New `apps/api/src/common/pg-error.ts`:
```ts
/**
 * The Postgres error behind a failed query. drizzle-orm ≥0.44 wraps it in
 * DrizzleQueryError, so `code`/`constraint` live on `.cause`, not the error
 * itself — checking `err.code` directly silently never matches.
 */
export function pgError(
  err: unknown,
): { code?: string; constraint?: string } | undefined {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  if (typeof e?.cause?.code === 'string') return e.cause;
  if (typeof e?.code === 'string') return e;
  return undefined;
}

export function isUniqueViolation(err: unknown): boolean {
  return pgError(err)?.code === '23505';
}
```

`users/users.service.ts`, before:
```ts
} catch (err: unknown) {
  if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === '23505'
  ) {
    const constraint = (err as { constraint?: string }).constraint ?? '';
```
After:
```ts
} catch (err: unknown) {
  if (isUniqueViolation(err)) {
    const constraint = pgError(err)?.constraint ?? '';
```
The `constraint` lookup was broken the same way. Even if the code check had matched, the constraint would have been `''`, so a taken username would have been reported as "Email or phone already in use".

`data-capture/merchant-inventory.service.ts`, before:
```ts
if (
  typeof error === 'object' &&
  error &&
  'code' in error &&
  (error as { code?: string }).code === '23505'
) {
  throw new ConflictException('A product with that SKU already exists');
}
```
After:
```ts
if (isUniqueViolation(error)) {
  throw new ConflictException('A product with that SKU already exists');
}
```
The helper still accepts the unwrapped shape, so existing mocks and any raw `pg` usage keep working.

**Verified.** The new `src/common/pg-error.int-spec.ts` inserts a duplicate username through drizzle against real Postgres and checks that `isUniqueViolation` is `true` and the constraint is `users_username_unique`. With the old `err.code` check, the same error fails, because `code` is `undefined`. No other raw Postgres error-code checks remain in `apps/api/src`.

**Lesson.**
- **Test error handling against the real driver at least once.** A mock of the error shape only proves the code agrees with itself.
- When a library wraps errors, write one unwrap helper and use it everywhere, so the next library upgrade means changing one function rather than hunting through every `catch`.
- After upgrading an ORM or driver, grep for code that inspects its errors (`'23505'`, `.code ===`) and recheck it.

---

## Habits to keep

1. **Config isn't enforcement.** After adding a guard, pipe or middleware, send the request that should be blocked and watch it get blocked.
2. **Know the defaults.** Node exits on SIGTERM, `fetch` never times out, V8 ignores container memory limits, and gcloud ignores `.gitignore` once `.gcloudignore` exists. Most of this report came from defaults like these.
3. **Short secrets need attempt counters**, stored with the secret and incremented atomically *before* comparing.
4. **Concurrency-safe limits are one SQL statement:** `UPDATE … SET n = n + 1 WHERE n < max RETURNING …`.
5. **Idempotency keys come from the client**, are scoped per user, and are checked before the side effect.
6. **Fail closed.** A missing secret in production is an error, not a warning.
7. **Every outbound call gets a timeout** shorter than the layer above it.
8. **Every resource you open gets a close hook**, and `enableShutdownHooks()` makes sure the hook runs.
9. **Three ignore files.** Sensitive local data goes in `.gitignore`, `.dockerignore` *and* `.gcloudignore`, or better, outside the repo.
10. **Test error handling against the real driver**, and unwrap library errors in one helper.

---

## Verification run for this round

- `tsc -p tsconfig.build.json`: passes. `pnpm --filter api build` (including the migration-order check): passes. Mobile `tsc --noEmit`: passes.
- `jest` (unit): 54 suites, 490 tests pass.
- `auth.service.int-spec.ts` against local Postgres, after migrating the local dev database to `0034`: 4/4 pass.
- `pg-error.int-spec.ts` against local Postgres: passes (duplicate username detected through `DrizzleQueryError`).
- ESLint on changed files: no new non-formatting errors. These files already had Prettier drift before this change.
- Local runtime: 6th login returned 429; on SIGTERM, `pool.end()` was called; `gcloud meta list-files-for-upload` excludes `backups/`.
- Docker image: `docker build -f Dockerfile.api .` succeeds. Inside the image, `whoami` prints `node`, `NODE_OPTIONS=--max-old-space-size=384`, and V8's heap limit is 432MB (384MB old space plus young generation), below the 512Mi instance limit.
- Not verified at runtime: Swagger hidden under `NODE_ENV=production` (blocked locally by the production config checks), and the swap/onramp/offramp replay end-to-end (needs an authenticated user with a funded wallet; covered by code review and type checks only).

---
Checked against the NestJS team's "NestJS Production Checklist: 17 Checks Before You Deploy". Static analysis plus manual review, followed by the fixes and checks above.
