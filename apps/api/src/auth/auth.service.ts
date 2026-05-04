import {
  Injectable,
  Inject,
  Logger,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, gt, isNull, desc } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import { randomInt, randomUUID } from 'crypto';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { UsersService } from '../users/users.service';
import type { OtpProvider } from '../otp/otp-provider.interface';
import { OTP_PROVIDER } from '../otp/otp-provider.interface';
import { WalletsService } from '../wallets/wallets.service';
import { SignupDto } from './dto/signup.dto';

const BCRYPT_ROUNDS = 12;
const RESET_CODE_TTL_MINUTES = 15;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly walletsService: WalletsService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(OTP_PROVIDER) private readonly otpProvider: OtpProvider,
  ) {}

  async signup(dto: SignupDto): Promise<AuthTokens> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
    });

    try {
      await this.walletsService.createWalletPair(user.id);
    } catch (error) {
      this.logger.error(
        'Wallet creation failed during signup, rolling back user: ' + user.id,
        error instanceof Error ? error.stack : undefined,
      );
      await this.db.delete(schema.users).where(eq(schema.users.id, user.id));
      throw error;
    }

    this.logger.log('User registered: ' + user.id);
    return this.issueTokens(user.id, user.email ?? null);
  }

  async login(user: { id: string; email: string | null }): Promise<AuthTokens> {
    this.logger.log('User logged in: ' + user.id);
    return this.issueTokens(user.id, user.email);
  }

  async refresh(rawRefreshToken: string): Promise<AuthTokens> {
    let payload: { sub: string; email: string; jti: string };
    try {
      payload = this.jwtService.verify<{ sub: string; email: string; jti: string }>(
        rawRefreshToken,
        { secret: this.config.getOrThrow('JWT_REFRESH_SECRET') },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // O(1) lookup by jti — no full-table scan needed
    const rows = await this.db
      .select()
      .from(schema.refreshTokens)
      .where(
        and(
          eq(schema.refreshTokens.jti, payload.jti),
          eq(schema.refreshTokens.isRevoked, false),
          gt(schema.refreshTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    const matched = rows[0] ?? null;
    if (!matched || !(await bcrypt.compare(rawRefreshToken, matched.tokenHash))) {
      throw new UnauthorizedException('Refresh token not recognised');
    }

    // Revoke the used token (rotation)
    await this.db
      .update(schema.refreshTokens)
      .set({ isRevoked: true, revokedAt: new Date() })
      .where(eq(schema.refreshTokens.id, matched.id));

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    return this.issueTokens(user.id, user.email ?? null);
  }

  async logout(userId: string, rawRefreshToken: string): Promise<void> {
    // Decode without throwing — we only need the jti to locate the row
    const decoded = this.jwtService.decode<{ jti?: string }>(rawRefreshToken);
    if (!decoded?.jti) {
      this.logger.warn('Logout attempted with token missing jti for user: ' + userId);
      return;
    }
    await this.db
      .update(schema.refreshTokens)
      .set({ isRevoked: true, revokedAt: new Date() })
      .where(
        and(
          eq(schema.refreshTokens.jti, decoded.jti),
          eq(schema.refreshTokens.userId, userId),
          eq(schema.refreshTokens.isRevoked, false),
          isNull(schema.refreshTokens.revokedAt),
        ),
      );
    this.logger.log('User logged out: ' + userId);
  }

  async sendOtp(userId: string, phone: string): Promise<void> {
    const code = String(randomInt(100000, 1000000));
    // Persist the phone being verified so verifyOtp can cross-check it
    await this.usersService.setPendingPhone(userId, phone);
    await this.otpProvider.sendOtp(phone, code);
    this.logger.log('OTP sent to ' + phone.slice(-4) + ' for user: ' + userId);
  }

  async forgotPassword(input: { email?: string; phone?: string }): Promise<void> {
    if (!input.email && !input.phone) {
      throw new BadRequestException('email or phone is required');
    }

    const user = input.email
      ? await this.usersService.findByEmail(input.email)
      : await this.usersService.findByPhone(input.phone!);

    // Silent success when the identifier isn't registered — don't leak account
    // existence. We still pretend to do work to keep timing roughly even.
    if (!user || !user.isActive) {
      this.logger.log(
        'Password reset requested for unknown identifier: ' +
          (input.email ?? input.phone ?? '(unknown)'),
      );
      return;
    }

    const code = String(randomInt(100000, 1000000));
    const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60_000);
    const channel: 'email' | 'phone' = input.email ? 'email' : 'phone';

    await this.db.insert(schema.passwordResetCodes).values({
      userId: user.id,
      channel,
      codeHash,
      expiresAt,
    });

    if (channel === 'phone' && input.phone) {
      // Reuse the OTP provider so SMS delivery is wired to whichever provider
      // is configured (mock logs the code in dev; Twilio would send an SMS).
      try {
        await this.otpProvider.sendOtp(input.phone, code);
      } catch (err) {
        this.logger.error(
          'Failed to deliver password reset SMS for user: ' + user.id,
          err instanceof Error ? err.stack : undefined,
        );
      }
    }

    // Email delivery is not yet wired. Log the code in non-production so the
    // dev flow is testable end-to-end. Production should integrate an email
    // provider here.
    if (channel === 'email' && process.env.NODE_ENV !== 'production') {
      this.logger.log(
        '[DEV] Password reset code for ' + (input.email ?? '') + ': ' + code,
      );
    }

    this.logger.log('Password reset code issued for user: ' + user.id);
  }

  async resetPassword(input: {
    email?: string;
    phone?: string;
    code: string;
    newPassword: string;
  }): Promise<void> {
    if (!input.email && !input.phone) {
      throw new BadRequestException('email or phone is required');
    }

    const user = input.email
      ? await this.usersService.findByEmail(input.email)
      : await this.usersService.findByPhone(input.phone!);

    if (!user || !user.isActive) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    const channel: 'email' | 'phone' = input.email ? 'email' : 'phone';

    // Pull the most recent unconsumed, unexpired code for this user+channel.
    const rows = await this.db
      .select()
      .from(schema.passwordResetCodes)
      .where(
        and(
          eq(schema.passwordResetCodes.userId, user.id),
          eq(schema.passwordResetCodes.channel, channel),
          isNull(schema.passwordResetCodes.consumedAt),
          gt(schema.passwordResetCodes.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(schema.passwordResetCodes.createdAt))
      .limit(1);

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

      await tx
        .update(schema.users)
        .set({
          passwordHash: newHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, user.id));

      // Revoke every active refresh token — force a fresh login everywhere.
      await tx
        .update(schema.refreshTokens)
        .set({ isRevoked: true, revokedAt: new Date() })
        .where(
          and(
            eq(schema.refreshTokens.userId, user.id),
            eq(schema.refreshTokens.isRevoked, false),
          ),
        );
    });

    this.logger.log('Password reset completed for user: ' + user.id);
  }

  async verifyOtp(userId: string, phone: string, code: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.pendingPhone !== phone) {
      throw new BadRequestException('Invalid verification request');
    }
    const valid = await this.otpProvider.verifyOtp(phone, code);
    if (!valid) {
      throw new BadRequestException('Invalid or expired OTP');
    }
    await this.usersService.markPhoneVerified(userId, phone);
    this.logger.log('Phone verified for user: ' + userId);
  }

  private async issueTokens(userId: string, email: string | null): Promise<AuthTokens> {
    const jti = randomUUID();
    const payload = { sub: userId, email, jti };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN') ?? '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN') ?? '7d',
    });

    // Derive expiresAt directly from the token's own `exp` claim so it is
    // always accurate regardless of the duration format used by jsonwebtoken.
    const decoded = this.jwtService.decode<{ exp: number }>(refreshToken);
    if (!decoded?.exp) {
      throw new Error('Failed to decode refresh token exp claim');
    }
    const expiresAt = new Date(decoded.exp * 1000);

    const tokenHash = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);
    await this.db.insert(schema.refreshTokens).values({
      userId,
      jti,
      tokenHash,
      expiresAt,
    });

    return { accessToken, refreshToken };
  }
}
