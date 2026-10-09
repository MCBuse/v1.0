import { and, eq, isNull } from 'drizzle-orm';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import {
  connectTestDatabase,
  type TestDatabase,
} from '../database/testing/test-database';
import * as schema from '../database/schema';
import { AuthService } from './auth.service';
import type { UsersService } from '../users/users.service';
import type { WalletsService } from '../wallets/wallets.service';
import type { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import type { OtpProvider } from '../otp/otp-provider.interface';

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
});
