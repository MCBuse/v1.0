import { Injectable, Inject, ConflictException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, isNull } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findByEmail(email: string) {
    const results = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.email, email), isNull(schema.users.deletedAt)));
    return results[0] ?? null;
  }

  async findById(id: string) {
    const results = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        phone: schema.users.phone,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        isEmailVerified: schema.users.isEmailVerified,
        isPhoneVerified: schema.users.isPhoneVerified,
        isActive: schema.users.isActive,
        createdAt: schema.users.createdAt,
        updatedAt: schema.users.updatedAt,
      })
      .from(schema.users)
      .where(and(eq(schema.users.id, id), isNull(schema.users.deletedAt)));
    return results[0] ?? null;
  }

  async create(data: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }) {
    try {
      const results = await this.db
        .insert(schema.users)
        .values({
          email: data.email,
          passwordHash: data.passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone ?? null,
        })
        .returning({
          id: schema.users.id,
          email: schema.users.email,
          phone: schema.users.phone,
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
          isEmailVerified: schema.users.isEmailVerified,
          isPhoneVerified: schema.users.isPhoneVerified,
          isActive: schema.users.isActive,
          createdAt: schema.users.createdAt,
          updatedAt: schema.users.updatedAt,
        });
      return results[0];
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === '23505'
      ) {
        throw new ConflictException('Email already in use');
      }
      throw err;
    }
  }

  async markPhoneVerified(userId: string) {
    await this.db
      .update(schema.users)
      .set({ isPhoneVerified: true })
      .where(eq(schema.users.id, userId));
  }

  /** Increment failed login counter; lock account after MAX_ATTEMPTS. */
  async recordFailedLogin(userId: string): Promise<void> {
    const MAX_ATTEMPTS = 10;
    const LOCK_MINUTES = 30;

    const rows = await this.db
      .select({ failedLoginAttempts: schema.users.failedLoginAttempts })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    const attempts = (rows[0]?.failedLoginAttempts ?? 0) + 1;
    const lockedUntil =
      attempts >= MAX_ATTEMPTS
        ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
        : null;

    await this.db
      .update(schema.users)
      .set({ failedLoginAttempts: attempts, lockedUntil })
      .where(eq(schema.users.id, userId));
  }

  /** Reset counter and lock on successful login. */
  async resetFailedLogins(userId: string): Promise<void> {
    await this.db
      .update(schema.users)
      .set({ failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(schema.users.id, userId));
  }
}
