# Phase 2: Auth

## Goal

Implement full authentication: email/password signup/login, JWT access tokens (15m), refresh tokens (7d rotating), phone OTP verification (mock + real adapter), auth guards, and protected routes. Every subsequent phase builds on authenticated users.

## Files

### Auth Module
- `apps/api/src/auth/auth.module.ts` — registers strategies, guards, providers, imports UsersModule/JwtModule
- `apps/api/src/auth/auth.service.ts` — signup, login, refresh, logout, OTP send/verify
- `apps/api/src/auth/auth.controller.ts` — POST /auth/signup, /auth/login, /auth/refresh, /auth/logout, /auth/phone/send-otp, /auth/phone/verify-otp
- `apps/api/src/auth/dto/signup.dto.ts` — email, password, firstName, lastName, phone (optional)
- `apps/api/src/auth/dto/login.dto.ts` — email, password
- `apps/api/src/auth/dto/refresh-token.dto.ts` — refreshToken
- `apps/api/src/auth/dto/send-otp.dto.ts` — phone
- `apps/api/src/auth/dto/verify-otp.dto.ts` — phone, code
- `apps/api/src/auth/strategies/jwt.strategy.ts` — validates access token, populates req.user
- `apps/api/src/auth/strategies/local.strategy.ts` — validates email/password
- `apps/api/src/auth/guards/jwt-auth.guard.ts` — global default guard (all routes protected unless @Public())
- `apps/api/src/auth/guards/local-auth.guard.ts` — used on login route
- `apps/api/src/auth/decorators/public.decorator.ts` — @Public() to skip auth
- `apps/api/src/auth/decorators/current-user.decorator.ts` — @CurrentUser() extracts req.user

### Users Module
- `apps/api/src/users/users.module.ts` — module for user DB operations
- `apps/api/src/users/users.service.ts` — findByEmail, findById, create, updatePhoneVerified

### OTP Adapter
- `apps/api/src/otp/otp-provider.interface.ts` — interface: sendOtp(phone, code), verifyOtp(phone, code)
- `apps/api/src/otp/otp.module.ts` — provides OTP_PROVIDER token based on OTP_PROVIDER env var
- `apps/api/src/otp/providers/mock-otp.provider.ts` — logs code, always verifies "123456"
- `apps/api/src/otp/providers/twilio-otp.provider.ts` — Twilio Verify API (real implementation)

### Config
- `apps/api/src/config/config.validation.ts` — **modify**: add JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, JWT_ACCESS_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN, OTP_PROVIDER, TWILIO_ACCOUNT_SID (optional), TWILIO_AUTH_TOKEN (optional), TWILIO_VERIFY_SERVICE_SID (optional)
- `apps/api/.env.example` — **modify**: add JWT and OTP vars
- `apps/api/.env` — **modify**: add JWT and OTP vars (local values)

### App Module
- `apps/api/src/app.module.ts` — **modify**: add AuthModule, UsersModule, OtpModule; register JwtAuthGuard as global guard

## Steps

### Step 1: Install dependencies
```
@nestjs/passport passport passport-local passport-jwt
@nestjs/jwt
bcrypt @types/bcrypt
@types/passport-local @types/passport-jwt
```

**Verify:** `pnpm install` succeeds, `pnpm run build` passes.

### Step 2: Config and environment variables
Add to `config.validation.ts`: JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, JWT_ACCESS_EXPIRES_IN (default '15m'), JWT_REFRESH_EXPIRES_IN (default '7d'), OTP_PROVIDER (default 'mock').

Add Twilio vars as optional (only required when OTP_PROVIDER=twilio).

Update `.env.example` and `.env`.

**Verify:** App starts, ConfigService returns JWT vars.

### Step 3: Users module
Create `UsersModule` and `UsersService` with:
- `create(data)` — inserts user row, returns user without passwordHash
- `findByEmail(email)` — for login
- `findById(id)` — for JWT strategy
- `markPhoneVerified(userId)` — after OTP

**Verify:** Module compiles, no circular dependencies.

### Step 4: OTP adapter
Create `OtpProviderInterface` with `sendOtp(phone, code): Promise<void>` and `verifyOtp(phone, code): Promise<boolean>`.

`MockOtpProvider`: stores codes in memory Map, `verifyOtp` checks stored code (also accepts '123456' for testing). Logs code at INFO level in dev.

`TwilioOtpProvider`: uses Twilio Verify API. Requires TWILIO_* env vars.

`OtpModule`: provides `OTP_PROVIDER` token, selects provider from OTP_PROVIDER env var.

**Verify:** Module compiles, mock provider works.

### Step 5: JWT and local strategies
`LocalStrategy`: validates email+password with UsersService + bcrypt.compare. Throws UnauthorizedException on failure.

`JwtStrategy`: validates access token using JWT_ACCESS_SECRET, extracts `{ sub: userId, email }`, checks user still exists and isActive.

**Verify:** Strategies compile cleanly.

### Step 6: Auth guards
`JwtAuthGuard`: extends AuthGuard('jwt'), checks for `@Public()` decorator via Reflector. If route has @Public(), skip auth.

`LocalAuthGuard`: extends AuthGuard('local'), used only on /auth/login.

Register JwtAuthGuard as `APP_GUARD` in AppModule so all routes are protected by default.

**Verify:** Unauthenticated request to any non-@Public route returns 401.

### Step 7: Auth service
`AuthService` methods:
- `signup(dto)`: check email not taken → hash password (bcrypt, 12 rounds) → insert user → return tokens
- `login(user)`: generate access + refresh tokens → store hashed refresh token in DB
- `refresh(refreshToken)`: find valid token → rotate (revoke old, issue new) → return new pair
- `logout(userId, refreshToken)`: revoke specific refresh token
- `sendOtp(phone)`: generate 6-digit code → store with TTL → call OTP_PROVIDER.sendOtp
- `verifyOtp(userId, phone, code)`: call OTP_PROVIDER.verifyOtp → if valid, updatePhoneVerified

Token generation: `{ sub: userId, email }` for access. Store refresh token as bcrypt hash in refresh_tokens table.

**Verify:** Signup creates user, login returns tokens.

### Step 8: Auth controller and DTOs
DTOs with class-validator:
- `SignupDto`: email (IsEmail), password (MinLength 8, Matches strong password regex), firstName (IsString), lastName (IsString), phone (IsOptional, IsPhoneNumber or custom)
- `LoginDto`: email, password
- `RefreshTokenDto`: refreshToken (IsString, IsJWT)
- `SendOtpDto`: phone (IsString)
- `VerifyOtpDto`: phone, code (IsString, Length 6)

Controller endpoints:
- `POST /auth/signup` — @Public(), calls authService.signup
- `POST /auth/login` — @Public(), @UseGuards(LocalAuthGuard), calls authService.login
- `POST /auth/refresh` — @Public(), calls authService.refresh
- `POST /auth/logout` — protected, calls authService.logout
- `POST /auth/phone/send-otp` — protected, calls authService.sendOtp
- `POST /auth/phone/verify-otp` — protected, calls authService.verifyOtp

Add `@ApiBearerAuth('access-token')` to protected endpoints. `@ApiTags('auth')` on controller.

**Verify:** POST /auth/signup creates user and returns { accessToken, refreshToken }.

### Step 9: Wire into AppModule
Import AuthModule, UsersModule, OtpModule into AppModule. Register JwtAuthGuard as APP_GUARD. Confirm health endpoint still reachable (it should have @Public()).

**Verify:** `GET /api/v1/health` returns 200 (public). `GET /api/v1` returns 401 (protected). Swagger UI shows lock icons on protected routes.

## Dependencies

- `@nestjs/passport`, `passport`, `passport-local`, `passport-jwt`
- `@nestjs/jwt`
- `bcrypt`
- Local Postgres from Phase 1 (users table, refresh_tokens table)
- OTP_PROVIDER=mock for dev

## Decisions

- **Password hashing**: bcrypt with 12 rounds
- **Access token TTL**: 15 minutes (short, stateless)
- **Refresh token TTL**: 7 days (stored as hash, rotated on each use)
- **Refresh token rotation**: old token revoked immediately on use — replay gives 401
- **OTP codes**: 6-digit numeric, 10 minute TTL, stored in memory (mock) or Twilio Verify (real)
- **Global guard**: JwtAuthGuard registered as APP_GUARD — every route is protected unless `@Public()`
- **Health route**: must be `@Public()` — already public for k8s/uptime checks
- **Phone field**: stored in users table but optional at signup; required before wallet creation (Phase 3)
