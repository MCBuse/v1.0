import { Injectable, Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, or, desc, and, gte, lte } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';

export interface RecordEntryDto {
  debitWalletId: string;
  creditWalletId: string;
  amount: bigint;
  currency: string;
  type: string;
  status?: string;
  solanaTxSignature?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class LedgerService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async recordEntry(dto: RecordEntryDto) {
    const rows = await this.db
      .insert(schema.ledgerEntries)
      .values({
        debitWalletId: dto.debitWalletId,
        creditWalletId: dto.creditWalletId,
        amount: dto.amount,
        currency: dto.currency,
        type: dto.type,
        status: dto.status ?? 'completed',
        solanaTxSignature: dto.solanaTxSignature,
        idempotencyKey: dto.idempotencyKey,
        metadata: dto.metadata ? JSON.stringify(dto.metadata) : null,
      })
      .returning();
    return rows[0];
  }

  async getEntriesForWallet(
    walletId: string,
    filters?: {
      currency?: string;
      type?: string;
      from?: Date;
      to?: Date;
      limit?: number;
      offset?: number;
    },
  ) {
    const conditions = [
      or(
        eq(schema.ledgerEntries.debitWalletId, walletId),
        eq(schema.ledgerEntries.creditWalletId, walletId),
      )!,
    ];

    if (filters?.currency) {
      conditions.push(eq(schema.ledgerEntries.currency, filters.currency));
    }
    if (filters?.type) {
      conditions.push(eq(schema.ledgerEntries.type, filters.type));
    }
    if (filters?.from) {
      conditions.push(gte(schema.ledgerEntries.createdAt, filters.from));
    }
    if (filters?.to) {
      conditions.push(lte(schema.ledgerEntries.createdAt, filters.to));
    }

    return this.db
      .select()
      .from(schema.ledgerEntries)
      .where(and(...conditions))
      .orderBy(desc(schema.ledgerEntries.createdAt))
      .limit(filters?.limit ?? 50)
      .offset(filters?.offset ?? 0);
  }
}
