import { Injectable, Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, desc, inArray, lte, or, sql, gte } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { ListTransactionsDto } from './dto/list-transactions.dto';

@Injectable()
export class TransactionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * List ledger entries for the authenticated user.
   *
   * - If walletType is provided, query that wallet only.
   * - Otherwise, query all wallets belonging to the user.
   * - BigInt amounts are serialised as strings to avoid JSON precision loss.
   */
  async list(userId: string, query: ListTransactionsDto) {
    const walletIds = await this.resolveWalletIds(userId, query.walletType);

    if (walletIds.length === 0) {
      return { data: [], limit: query.limit ?? 20, offset: query.offset ?? 0 };
    }

    const conditions = [
      or(
        inArray(schema.ledgerEntries.debitWalletId, walletIds),
        inArray(schema.ledgerEntries.creditWalletId, walletIds),
      )!,
    ];

    if (query.currency) {
      conditions.push(eq(schema.ledgerEntries.currency, query.currency.toUpperCase()));
    }
    if (query.type) {
      conditions.push(eq(schema.ledgerEntries.type, query.type));
    }
    if (query.from) {
      conditions.push(gte(schema.ledgerEntries.createdAt, new Date(query.from)));
    }
    if (query.to) {
      conditions.push(lte(schema.ledgerEntries.createdAt, new Date(query.to)));
    }

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const rows = await this.db
      .select()
      .from(schema.ledgerEntries)
      .where(and(...conditions))
      .orderBy(desc(schema.ledgerEntries.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data: rows.map((r) => this.serialize(r)),
      limit,
      offset,
    };
  }

  /**
   * Summarise total credited / debited per currency for each wallet.
   * Returns an object keyed by currency with { credited, debited } as strings.
   */
  async summary(userId: string, walletType?: string) {
    const walletIds = await this.resolveWalletIds(userId, walletType);

    if (walletIds.length === 0) {
      return { summary: {} };
    }

    // One query: group by currency and direction
    const creditRows = await this.db
      .select({
        currency: schema.ledgerEntries.currency,
        total: sql<string>`SUM(${schema.ledgerEntries.amount})`,
      })
      .from(schema.ledgerEntries)
      .where(inArray(schema.ledgerEntries.creditWalletId, walletIds))
      .groupBy(schema.ledgerEntries.currency);

    const debitRows = await this.db
      .select({
        currency: schema.ledgerEntries.currency,
        total: sql<string>`SUM(${schema.ledgerEntries.amount})`,
      })
      .from(schema.ledgerEntries)
      .where(inArray(schema.ledgerEntries.debitWalletId, walletIds))
      .groupBy(schema.ledgerEntries.currency);

    const summary: Record<string, { credited: string; debited: string }> = {};

    for (const row of creditRows) {
      if (!summary[row.currency]) summary[row.currency] = { credited: '0', debited: '0' };
      summary[row.currency].credited = row.total ?? '0';
    }
    for (const row of debitRows) {
      if (!summary[row.currency]) summary[row.currency] = { credited: '0', debited: '0' };
      summary[row.currency].debited = row.total ?? '0';
    }

    return { summary };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async resolveWalletIds(userId: string, walletType?: string) {
    const whereClause = walletType
      ? and(
          eq(schema.wallets.userId, userId),
          eq(schema.wallets.type, walletType),
          eq(schema.wallets.isActive, true),
        )
      : and(eq(schema.wallets.userId, userId), eq(schema.wallets.isActive, true));

    const rows = await this.db
      .select({ id: schema.wallets.id })
      .from(schema.wallets)
      .where(whereClause);

    return rows.map((r) => r.id);
  }

  private serialize(row: typeof schema.ledgerEntries.$inferSelect) {
    return {
      id: row.id,
      debitWalletId: row.debitWalletId,
      creditWalletId: row.creditWalletId,
      amount: row.amount.toString(), // bigint → string
      currency: row.currency,
      type: row.type,
      status: row.status,
      solanaTxSignature: row.solanaTxSignature,
      paymentRequestId: row.paymentRequestId,
      idempotencyKey: row.idempotencyKey,
      metadata: row.metadata ? this.safeParseJson(row.metadata) : null,
      createdAt: row.createdAt,
    };
  }

  private safeParseJson(raw: string): unknown {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }
}
