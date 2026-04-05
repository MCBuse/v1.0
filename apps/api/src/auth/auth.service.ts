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
import { eq, and, gt, isNull } from 'drizzle-orm';
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
    await this.walletsService.createWalletPair(user.id);
    this.logger.log('User registered: ' + user.id);
    return this.issueTokens(user.id, user.email as string);
  }

  async login(user: { id: string; email: string }): Promise<AuthTokens> {
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

    if (!user.email) throw new UnauthorizedException();
    return this.issueTokens(user.id, user.email);
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

  private async issueTokens(userId: string, email: string): Promise<AuthTokens> {
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
