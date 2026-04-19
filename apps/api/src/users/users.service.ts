import { Injectable, Inject, ConflictException, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, isNull, sql } from 'drizzle-orm';
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

  async findByPhone(phone: string) {
    const results = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.phone, phone), isNull(schema.users.deletedAt)));
    return results[0] ?? null;
  }

  async findById(id: string) {
    const results = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        phone: schema.users.phone,
        pendingPhone: schema.users.pendingPhone,
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
    email?: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }) {
    try {
      const results = await this.db
        .insert(schema.users)
        .values({
          email: data.email ?? null,
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
        throw new ConflictException('Email or phone already in use');
      }
      throw err;
    }
  }

  async setPendingPhone(userId: string, phone: string): Promise<void> {
    const rows = await this.db
      .update(schema.users)
      .set({ pendingPhone: phone })
      .where(and(eq(schema.users.id, userId), isNull(schema.users.deletedAt)))
      .returning({ id: schema.users.id });
    if (rows.length === 0) {
      throw new NotFoundException('User not found');
    }
  }

  async markPhoneVerified(userId: string, phone: string): Promise<void> {
    const rows = await this.db
      .update(schema.users)
      .set({ phone, isPhoneVerified: true, pendingPhone: null })
      .where(and(eq(schema.users.id, userId), isNull(schema.users.deletedAt)))
      .returning({ id: schema.users.id });
    if (rows.length === 0) {
      throw new NotFoundException('User not found');
    }
  }

  /** Atomically increment failed login counter; lock account after MAX_ATTEMPTS. */
  async recordFailedLogin(userId: string): Promise<void> {
    const MAX_ATTEMPTS = 10;
    const LOCK_MINUTES = 30;

    // Single atomic UPDATE — avoids read-then-write race under concurrent logins
    await this.db
      .update(schema.users)
      .set({
        failedLoginAttempts: sql`${schema.users.failedLoginAttempts} + 1`,
        lockedUntil: sql`CASE WHEN ${schema.users.failedLoginAttempts} + 1 >= ${MAX_ATTEMPTS}
                              THEN NOW() + (${LOCK_MINUTES} * INTERVAL '1 minute')
                              ELSE NULL END`,
      })
      .where(and(eq(schema.users.id, userId), isNull(schema.users.deletedAt)));
  }

  /** Reset counter and lock on successful login. */
  async resetFailedLogins(userId: string): Promise<void> {
    await this.db
      .update(schema.users)
      .set({ failedLoginAttempts: 0, lockedUntil: null })
      .where(and(eq(schema.users.id, userId), isNull(schema.users.deletedAt)));
  }
}
