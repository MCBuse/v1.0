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
    phone?: string;
  }) {
    try {
      const results = await this.db
        .insert(schema.users)
        .values({
          email: data.email,
          passwordHash: data.passwordHash,
          phone: data.phone ?? null,
        })
        .returning({
          id: schema.users.id,
          email: schema.users.email,
          phone: schema.users.phone,
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
}
