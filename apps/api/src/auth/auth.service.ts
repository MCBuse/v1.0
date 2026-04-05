import {
  Injectable,
  Inject,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, gt, isNull } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { UsersService } from '../users/users.service';
import type { OtpProvider } from '../otp/otp-provider.interface';
import { OTP_PROVIDER } from '../otp/otp-provider.interface';
import { WalletsService } from '../wallets/wallets.service';
import { SignupDto } from './dto/signup.dto';

const BCRYPT_ROUNDS = 12;

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
      phone: dto.phone,
    });
    await this.walletsService.createWalletPair(user.id);
    this.logger.log('User registered: ' + user.id);
    return this.issueTokens(user.id, user.email as string);
  }

  async login(user: { id: string; email: string }): Promise<AuthTokens> {
    this.logger.log('User logged in: ' + user.id);
    return this.issueTokens(user.id, user.email);
  }

  async refresh(rawRefreshToken: string): Promise<AuthTokens> {
    let payload: { sub: string; email: string };
    try {
      payload = this.jwtService.verify<{ sub: string; email: string }>(
        rawRefreshToken,
        { secret: this.config.getOrThrow('JWT_REFRESH_SECRET') },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Find a valid, un-revoked, non-expired token row that matches
    const rows = await this.db
      .select()
      .from(schema.refreshTokens)
      .where(
        and(
          eq(schema.refreshTokens.userId, payload.sub),
          eq(schema.refreshTokens.isRevoked, false),
          gt(schema.refreshTokens.expiresAt, new Date()),
        ),
      );

    let matched: (typeof schema.refreshTokens.$inferSelect) | null = null;
    for (const row of rows) {
      if (await bcrypt.compare(rawRefreshToken, row.tokenHash)) {
        matched = row;
        break;
      }
    }

    if (!matched) {
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

    if (!user.email) throw new UnauthorizedException();
    return this.issueTokens(user.id, user.email);
  }

  async logout(userId: string, rawRefreshToken: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(schema.refreshTokens)
      .where(
        and(
          eq(schema.refreshTokens.userId, userId),
          eq(schema.refreshTokens.isRevoked, false),
          isNull(schema.refreshTokens.revokedAt),
        ),
      );

    for (const row of rows) {
      if (await bcrypt.compare(rawRefreshToken, row.tokenHash)) {
        await this.db
          .update(schema.refreshTokens)
          .set({ isRevoked: true, revokedAt: new Date() })
          .where(eq(schema.refreshTokens.id, row.id));
        break;
      }
    }
    this.logger.log('User logged out: ' + userId);
  }

  async sendOtp(userId: string, phone: string): Promise<void> {
    const code = String(randomInt(100000, 999999));
    await this.otpProvider.sendOtp(phone, code);
    this.logger.log('OTP sent to ' + phone.slice(-4) + ' for user: ' + userId);
  }

  async verifyOtp(userId: string, phone: string, code: string): Promise<void> {
    const valid = await this.otpProvider.verifyOtp(phone, code);
    if (!valid) {
      throw new BadRequestException('Invalid or expired OTP');
    }
    await this.usersService.markPhoneVerified(userId);
    this.logger.log('Phone verified for user: ' + userId);
  }

  private async issueTokens(userId: string, email: string): Promise<AuthTokens> {
    const payload = { sub: userId, email };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN') ?? '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN') ?? '7d',
    });

    const refreshExpiresIn = this.config.get('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseDays(refreshExpiresIn));

    const tokenHash = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);
    await this.db.insert(schema.refreshTokens).values({
      userId,
      tokenHash,
      expiresAt,
    });

    return { accessToken, refreshToken };
  }
}

function parseDays(duration: string): number {
  if (duration.endsWith('d')) return parseInt(duration, 10);
  if (duration.endsWith('h')) return parseInt(duration, 10) / 24;
  return 7; // fallback
}
