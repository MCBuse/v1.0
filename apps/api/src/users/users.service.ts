import {
  Injectable,
  Inject,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';

export const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;
export const RESERVED_USERNAMES = new Set([
  'admin',
  'support',
  'mcbuse',
  'root',
  'system',
  'help',
  'security',
  'payments',
  'wallet',
  'api',
  'official',
]);

export type UsernameAvailability = {
  username: string;
  available: boolean;
  suggestions: string[];
};

@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  normalizeUsername(input: string): string {
    return input.trim().replace(/^@/, '').toLowerCase();
  }

  validateUsername(input: string): string {
    const username = this.normalizeUsername(input);
    if (!USERNAME_PATTERN.test(username)) {
      throw new BadRequestException(
        'Username must be 3-30 characters and use lowercase letters, numbers, or underscores',
      );
    }
    return username;
  }

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
        username: schema.users.username,
        primaryCurrency: schema.users.primaryCurrency,
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

  async findByUsername(usernameInput: string) {
    const username = this.normalizeUsername(usernameInput);
    const results = await this.db
      .select({
        id: schema.users.id,
        username: schema.users.username,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        isActive: schema.users.isActive,
      })
      .from(schema.users)
      .where(and(eq(schema.users.username, username), isNull(schema.users.deletedAt)))
      .limit(1);
    return results[0] ?? null;
  }

  async create(data: {
    email?: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    phone?: string;
    username: string;
  }) {
    const username = this.validateUsername(data.username);
    const availability = await this.checkUsernameAvailability(username);
    if (!availability.available) {
      throw new ConflictException({
        message: 'Username is not available',
        suggestions: availability.suggestions,
      });
    }

    try {
      const results = await this.db
        .insert(schema.users)
        .values({
          email: data.email ?? null,
          passwordHash: data.passwordHash,
          username,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone ?? null,
          isEmailVerified: true,
        })
        .returning({
          id: schema.users.id,
          email: schema.users.email,
          phone: schema.users.phone,
          username: schema.users.username,
          primaryCurrency: schema.users.primaryCurrency,
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
        const constraint = (err as { constraint?: string }).constraint ?? '';
        if (constraint.includes('username')) {
          throw new ConflictException({
            message: 'Username is not available',
            suggestions: await this.suggestUsernames(username),
          });
        }
        throw new ConflictException('Email or phone already in use');
      }
      throw err;
    }
  }

  async checkUsernameAvailability(
    usernameInput: string,
    excludeUserId?: string,
  ): Promise<UsernameAvailability> {
    const username = this.normalizeUsername(usernameInput);
    const invalid = !USERNAME_PATTERN.test(username) || RESERVED_USERNAMES.has(username);
    if (invalid) {
      return {
        username,
        available: false,
        suggestions: await this.suggestUsernames(username, excludeUserId),
      };
    }

    const available = await this.isUsernameAvailable(username, excludeUserId);
    return {
      username,
      available,
      suggestions: available ? [] : await this.suggestUsernames(username, excludeUserId),
    };
  }

  async updateProfile(
    userId: string,
    data: { username?: string; primaryCurrency?: 'USDC' | 'EURC' },
  ) {
    const update: Partial<typeof schema.users.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (data.username !== undefined) {
      const username = this.validateUsername(data.username);
      const availability = await this.checkUsernameAvailability(username, userId);
      if (!availability.available) {
        throw new ConflictException({
          message: 'Username is not available',
          suggestions: availability.suggestions,
        });
      }
      update.username = username;
    }

    if (data.primaryCurrency !== undefined) {
      update.primaryCurrency = data.primaryCurrency;
    }

    const rows = await this.db
      .update(schema.users)
      .set(update)
      .where(and(eq(schema.users.id, userId), isNull(schema.users.deletedAt)))
      .returning({
        id: schema.users.id,
        email: schema.users.email,
        phone: schema.users.phone,
        username: schema.users.username,
        primaryCurrency: schema.users.primaryCurrency,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        isEmailVerified: schema.users.isEmailVerified,
        isPhoneVerified: schema.users.isPhoneVerified,
        isActive: schema.users.isActive,
        createdAt: schema.users.createdAt,
        updatedAt: schema.users.updatedAt,
      });

    if (!rows[0]) throw new NotFoundException('User not found');
    return rows[0];
  }

  async suggestUsernames(usernameInput: string, excludeUserId?: string): Promise<string[]> {
    const normalized = this.normalizeUsername(usernameInput);
    const clean = normalized
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    const base = (clean.length >= 3 ? clean : `${clean}user`).slice(0, 30) || 'user';
    const suggestions: string[] = [];

    for (let suffix = 1; suggestions.length < 3 && suffix <= 999; suffix += 1) {
      const suffixText = String(suffix);
      const stem = base.slice(0, 30 - suffixText.length);
      const candidate = `${stem}${suffixText}`;
      if (!USERNAME_PATTERN.test(candidate) || RESERVED_USERNAMES.has(candidate)) {
        continue;
      }
      if (await this.isUsernameAvailable(candidate, excludeUserId)) {
        suggestions.push(candidate);
      }
    }

    return suggestions;
  }

  private async isUsernameAvailable(username: string, excludeUserId?: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.username, username), isNull(schema.users.deletedAt)))
      .limit(1);

    const owner = rows[0] ?? null;
    return !owner || owner.id === excludeUserId;
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
