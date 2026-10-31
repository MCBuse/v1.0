import { and, eq, isNull } from 'drizzle-orm';
import { Pool } from 'pg';
import { randomInt, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import {
  connectTestDatabase,
  type TestDatabase,
} from '../database/testing/test-database';
import * as schema from '../database/schema';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { VerifiedEmailGuard } from './guards/verified-email.guard';
import type { MailService } from '../mail/mail.service';
import type { ExecutionContext } from '@nestjs/common';
import type { WalletsService } from '../wallets/wallets.service';
import type { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import type { OtpProvider } from '../otp/otp-provider.interface';

type MailMock = jest.Mock<Promise<void>, Parameters<MailService['send']>>;
const mailMock = (): MailMock =>
  jest
    .fn<Promise<void>, Parameters<MailService['send']>>()
    .mockResolvedValue(undefined);

/**
 * Password reset brute-force guard, against real rows: the attempt cap must
 * hold under parallel guesses (which only an atomic claim guarantees), and a
 * newly issued code must invalidate the previous one.
 */
describe('AuthService password reset (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let auth: AuthService;
  let user: typeof schema.users.$inferSelect;
  const CODE = '123456';
  const mail = { send: mailMock() };

  beforeAll(async () => {
    ({ db, pool } = await connectTestDatabase());
    const suffix = randomUUID().slice(0, 8);
    [user] = await db
      .insert(schema.users)
      .values({
        email: `reset-${suffix}@mcbuse.test`,
        passwordHash: 'integration-test-not-a-real-hash',
        firstName: 'Reset',
        lastName: 'Test',
        username: `reset${suffix}`,
      })
      .returning();

    const users = {
      findByEmail: () => Promise.resolve(user),
      findByPhone: () => Promise.resolve(user),
    } as unknown as UsersService;
    auth = new AuthService(
      users,
      {} as WalletsService,
      {} as JwtService,
      {} as ConfigService,
      db,
      { sendOtp: () => Promise.resolve() } as unknown as OtpProvider,
      mail as unknown as MailService,
    );
  });

  afterAll(async () => {
    await db
      .delete(schema.passwordResetCodes)
      .where(eq(schema.passwordResetCodes.userId, user.id));
    await db.delete(schema.users).where(eq(schema.users.id, user.id));
    await pool.end();
  });

  beforeEach(async () => {
    await db
      .delete(schema.passwordResetCodes)
      .where(eq(schema.passwordResetCodes.userId, user.id));
  });

  async function issueKnownCode() {
    const [row] = await db
      .insert(schema.passwordResetCodes)
      .values({
        userId: user.id,
        channel: 'email',
        codeHash: await bcrypt.hash(CODE, 4),
        expiresAt: new Date(Date.now() + 15 * 60_000),
      })
      .returning();
    return row;
  }

  const reset = (code: string) =>
    auth.resetPassword({
      email: user.email!,
      code,
      newPassword: 'N3w-pass!word',
    });

  it('rejects the correct code once 5 guesses have been used', async () => {
    const row = await issueKnownCode();
    for (let i = 0; i < 5; i++) {
      await expect(reset('000000')).rejects.toThrow(
        'Invalid or expired reset code',
      );
    }
    await expect(reset(CODE)).rejects.toThrow('Invalid or expired reset code');

    const [after] = await db
      .select()
      .from(schema.passwordResetCodes)
      .where(eq(schema.passwordResetCodes.id, row.id));
    expect(after.attempts).toBe(5);
  });

  it('caps attempts at 5 even when 20 guesses arrive in parallel', async () => {
    const row = await issueKnownCode();
    await Promise.allSettled(Array.from({ length: 20 }, () => reset('000000')));

    const [after] = await db
      .select()
      .from(schema.passwordResetCodes)
      .where(eq(schema.passwordResetCodes.id, row.id));
    expect(after.attempts).toBe(5);
  });

  it('accepts the correct code within the limit and consumes it', async () => {
    await issueKnownCode();
    await expect(reset('000000')).rejects.toThrow();
    await expect(reset(CODE)).resolves.toBeUndefined();
    await expect(reset(CODE)).rejects.toThrow('Invalid or expired reset code');
  });

  it('issuing a new code invalidates the previous one', async () => {
    const old = await issueKnownCode();
    await auth.forgotPassword({ email: user.email! });

    const live = await db
      .select()
      .from(schema.passwordResetCodes)
      .where(
        and(
          eq(schema.passwordResetCodes.userId, user.id),
          isNull(schema.passwordResetCodes.consumedAt),
        ),
      );
    expect(live).toHaveLength(1);
    expect(live[0].id).not.toBe(old.id);
  });

  it('emails the reset code, and that code resets the password', async () => {
    mail.send.mockClear();
    await auth.forgotPassword({ email: user.email! });

    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: user.email }),
    );
    await expect(reset(sentCode(mail.send))).resolves.toBeUndefined();
  });
});

function sentCode(send: MailMock): string {
  const [{ text }] = send.mock.calls[send.mock.calls.length - 1];
  return /\b(\d{6})\b/.exec(text)![1];
}

/**
 * Email verification codes, against real rows: same guess and issuance caps
 * as password reset, and success is what lets VerifiedEmailGuard through.
 */
describe('AuthService email OTP (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let auth: AuthService;
  let users: UsersService;
  let user: typeof schema.users.$inferSelect;
  const createdUserIds: string[] = [];
  const mail = { send: mailMock() };
  const CODE = '123456';

  beforeAll(async () => {
    ({ db, pool } = await connectTestDatabase());
    users = new UsersService(db);
    auth = new AuthService(
      users,
      {} as WalletsService,
      {} as JwtService,
      {} as ConfigService,
      db,
      {} as OtpProvider,
      mail as unknown as MailService,
    );
  });

  afterAll(async () => {
    for (const id of createdUserIds) {
      await db
        .delete(schema.emailVerificationCodes)
        .where(eq(schema.emailVerificationCodes.userId, id));
      await db.delete(schema.users).where(eq(schema.users.id, id));
    }
    await pool.end();
  });

  beforeEach(async () => {
    mail.send.mockClear();
    const suffix = randomUUID().slice(0, 8);
    [user] = await db
      .insert(schema.users)
      .values({
        email: `verify-${suffix}@mcbuse.test`,
        username: `verify${suffix}`,
        isEmailVerified: false,
      })
      .returning();
    createdUserIds.push(user.id);
  });

  async function issueKnownCode(
    expiresAt = new Date(Date.now() + 15 * 60_000),
  ) {
    const [row] = await db
      .insert(schema.emailVerificationCodes)
      .values({
        userId: user.id,
        codeHash: await bcrypt.hash(CODE, 4),
        expiresAt,
      })
      .returning();
    return row;
  }

  async function codeRow(id: string) {
    const [row] = await db
      .select()
      .from(schema.emailVerificationCodes)
      .where(eq(schema.emailVerificationCodes.id, id));
    return row;
  }

  async function isVerified() {
    return (await users.findById(user.id)).isEmailVerified;
  }

  it('emails a code to the stored address; the code verifies the email', async () => {
    await auth.sendEmailOtp(user.id);

    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: user.email }),
    );
    await expect(
      auth.verifyEmailOtp(user.id, sentCode(mail.send)),
    ).resolves.toBeUndefined();
    expect(await isVerified()).toBe(true);
  });

  it('counts a wrong guess against the code and leaves the email unverified', async () => {
    const row = await issueKnownCode();
    await expect(auth.verifyEmailOtp(user.id, '000000')).rejects.toThrow(
      'Invalid or expired code',
    );
    expect((await codeRow(row.id)).attempts).toBe(1);
    expect(await isVerified()).toBe(false);
  });

  it('rejects the correct code once 5 guesses have been used', async () => {
    await issueKnownCode();
    for (let i = 0; i < 5; i++) {
      await expect(auth.verifyEmailOtp(user.id, '000000')).rejects.toThrow(
        'Invalid or expired code',
      );
    }
    await expect(auth.verifyEmailOtp(user.id, CODE)).rejects.toThrow(
      'Invalid or expired code',
    );
    expect(await isVerified()).toBe(false);
  });

  it('rejects an expired code', async () => {
    await issueKnownCode(new Date(Date.now() - 1000));
    await expect(auth.verifyEmailOtp(user.id, CODE)).rejects.toThrow(
      'Invalid or expired code',
    );
  });

  it('consumes the code on success so it cannot be reused', async () => {
    const row = await issueKnownCode();
    await auth.verifyEmailOtp(user.id, CODE);
    expect((await codeRow(row.id)).consumedAt).not.toBeNull();
    await expect(auth.verifyEmailOtp(user.id, CODE)).rejects.toThrow(
      'Invalid or expired code',
    );
  });

  it('issuing a new code invalidates the previous one', async () => {
    const old = await issueKnownCode();
    await auth.sendEmailOtp(user.id);

    expect((await codeRow(old.id)).consumedAt).not.toBeNull();
    await expect(
      auth.verifyEmailOtp(user.id, sentCode(mail.send)),
    ).resolves.toBeUndefined();
  });

  it('caps issuance at 5 codes per hour', async () => {
    for (let i = 0; i < 5; i++) await auth.sendEmailOtp(user.id);
    await expect(auth.sendEmailOtp(user.id)).rejects.toThrow(
      'Too many codes requested',
    );
    expect(mail.send).toHaveBeenCalledTimes(5);
  });

  it('refuses to send when the email is already verified', async () => {
    await db
      .update(schema.users)
      .set({ isEmailVerified: true })
      .where(eq(schema.users.id, user.id));
    await expect(auth.sendEmailOtp(user.id)).rejects.toThrow(
      'Email is already verified',
    );
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('refuses to send when the user has no email', async () => {
    await db
      .update(schema.users)
      .set({ email: null })
      .where(eq(schema.users.id, user.id));
    await expect(auth.sendEmailOtp(user.id)).rejects.toThrow(
      'No email address on this account',
    );
  });

  it('VerifiedEmailGuard blocks money routes until the email is verified', async () => {
    const guard = new VerifiedEmailGuard(users);
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ user: { id: user.id } }) }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toThrow(
      'Email verification required',
    );
    await auth.sendEmailOtp(user.id);
    await auth.verifyEmailOtp(user.id, sentCode(mail.send));
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('signup with an email starts unverified; phone-only signup is auto-verified', async () => {
    const suffix = randomUUID().slice(0, 8);
    const byEmail = await users.create({
      email: `signup-${suffix}@mcbuse.test`,
      passwordHash: 'not-a-real-hash',
      firstName: 'E',
      lastName: 'Mail',
      username: `semail${suffix}`,
    });
    const byPhone = await users.create({
      phone: `+4479${randomInt(10_000_000, 99_999_999)}`,
      passwordHash: 'not-a-real-hash',
      firstName: 'P',
      lastName: 'Hone',
      username: `sphone${suffix}`,
    });
    createdUserIds.push(byEmail.id, byPhone.id);

    expect(byEmail.isEmailVerified).toBe(false);
    expect(byPhone.isEmailVerified).toBe(true);
  });
});
