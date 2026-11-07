import { Injectable, Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  eq,
  and,
  desc,
  inArray,
  isNull,
  lte,
  ne,
  notInArray,
  or,
  sql,
  gte,
} from 'drizzle-orm';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { ListTransactionsDto } from './dto/list-transactions.dto';

export type LedgerDirection = 'credit' | 'debit' | 'neutral';

type LedgerDirectionInput = Pick<
  typeof schema.ledgerEntries.$inferSelect,
  'debitWalletId' | 'creditWalletId' | 'currency' | 'type' | 'metadata'
>;

function parseMetadataObject(
  raw: string | null,
): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function resolveLedgerDirection(
  row: LedgerDirectionInput,
  walletIds: ReadonlySet<string>,
): LedgerDirection {
  if (row.type === 'on_ramp') return 'credit';
  if (row.type === 'off_ramp') return 'debit';

  if (row.type === 'swap') {
    const metadata = parseMetadataObject(row.metadata);
    if (metadata?.toCurrency === row.currency) return 'credit';
    if (metadata?.fromCurrency === row.currency) return 'debit';
  }

  const debitsOwnWallet = walletIds.has(row.debitWalletId);
  const creditsOwnWallet = walletIds.has(row.creditWalletId);

  if (creditsOwnWallet && !debitsOwnWallet) return 'credit';
  if (debitsOwnWallet && !creditsOwnWallet) return 'debit';
  if (creditsOwnWallet && debitsOwnWallet) return 'neutral';

  return 'neutral';
}

type PendingOperationInput = Pick<
  typeof schema.financialOperations.$inferSelect,
  | 'id'
  | 'kind'
  | 'status'
  | 'sourceWalletId'
  | 'destinationWalletId'
  | 'amountBaseUnits'
  | 'currency'
  | 'chainSignature'
  | 'metadata'
  | 'createdAt'
>;

/**
 * Statuses that are not worth showing as activity yet: `created` is a
 * transient instant before funds are reserved, and `collection_pending` is a
 * card/bank checkout the person may simply have abandoned.
 */
const HIDDEN_OPERATION_STATUSES = [
  'created',
  'collection_pending',
  'finalized',
  'failed',
  'reversed',
];

const OPERATION_ENTRY: Record<
  string,
  { type: 'on_ramp' | 'off_ramp' | 'internal'; direction: LedgerDirection }
> = {
  funding_card: { type: 'on_ramp', direction: 'credit' },
  funding_bank: { type: 'on_ramp', direction: 'credit' },
  internal_transfer: { type: 'internal', direction: 'neutral' },
  merchant_dayend: { type: 'internal', direction: 'neutral' },
  withdrawal_bank: { type: 'off_ramp', direction: 'debit' },
  withdrawal_card: { type: 'off_ramp', direction: 'debit' },
};

/**
 * An in-flight money movement, shaped like a ledger entry so activity lists
 * can show it as pending. The real ledger entry only exists once the
 * operation finalizes; until then this is the only trace of it.
 */
export function pendingOperationEntry(op: PendingOperationInput) {
  const mapping = OPERATION_ENTRY[op.kind];
  if (!mapping) return null;
  if (HIDDEN_OPERATION_STATUSES.includes(op.status)) return null;

  // Funding has no source wallet (treasury) and withdrawals no destination;
  // fall back to the person's own wallet so both ids are always present.
  const own = op.destinationWalletId ?? op.sourceWalletId;
  if (!own) return null;

  return {
    id: op.id,
    debitWalletId: op.sourceWalletId ?? own,
    creditWalletId: op.destinationWalletId ?? own,
    amount: op.amountBaseUnits.toString(),
    currency: op.currency,
    direction: mapping.direction,
    type: mapping.type,
    status: 'pending' as const,
    solanaTxSignature: op.chainSignature,
    paymentRequestId: null,
    idempotencyKey: null,
    metadata: op.metadata ?? null,
    createdAt: op.createdAt,
  };
}

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
      conditions.push(
        eq(schema.ledgerEntries.currency, query.currency.toUpperCase()),
      );
    }
    if (query.type) {
      conditions.push(eq(schema.ledgerEntries.type, query.type));
    }
    if (query.from) {
      conditions.push(
        gte(schema.ledgerEntries.createdAt, new Date(query.from)),
      );
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

    const walletIdSet = new Set(walletIds);
    const settled = rows.map((r) => this.serialize(r, walletIdSet));

    // In-flight movements lead the first page; later pages are settled history.
    const pending =
      offset === 0
        ? await this.pendingOperations(userId, walletIds, query)
        : [];

    return {
      data: [...pending, ...settled],
      limit,
      offset,
    };
  }

  private async pendingOperations(
    userId: string,
    walletIds: string[],
    query: ListTransactionsDto,
  ) {
    const ops = schema.financialOperations;
    const conditions = [
      eq(ops.userId, userId),
      notInArray(ops.status, HIDDEN_OPERATION_STATUSES),
      ne(ops.kind, 'reversal'),
      // A ledger entry already exists, so the settled list shows it.
      isNull(ops.ledgerEntryId),
      or(
        inArray(ops.sourceWalletId, walletIds),
        inArray(ops.destinationWalletId, walletIds),
      )!,
    ];
    if (query.currency) {
      conditions.push(eq(ops.currency, query.currency.toUpperCase()));
    }
    if (query.from) conditions.push(gte(ops.createdAt, new Date(query.from)));
    if (query.to) conditions.push(lte(ops.createdAt, new Date(query.to)));

    const rows = await this.db
      .select()
      .from(ops)
      .where(and(...conditions))
      .orderBy(desc(ops.createdAt))
      .limit(20);

    return rows
      .map(pendingOperationEntry)
      .filter((entry) => entry !== null)
      .filter((entry) => !query.type || entry.type === query.type);
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
      if (!summary[row.currency])
        summary[row.currency] = { credited: '0', debited: '0' };
      summary[row.currency].credited = row.total ?? '0';
    }
    for (const row of debitRows) {
      if (!summary[row.currency])
        summary[row.currency] = { credited: '0', debited: '0' };
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
      : and(
          eq(schema.wallets.userId, userId),
          eq(schema.wallets.isActive, true),
        );

    const rows = await this.db
      .select({ id: schema.wallets.id })
      .from(schema.wallets)
      .where(whereClause);

    return rows.map((r) => r.id);
  }

  private serialize(
    row: typeof schema.ledgerEntries.$inferSelect,
    walletIds: ReadonlySet<string>,
  ) {
    return {
      id: row.id,
      debitWalletId: row.debitWalletId,
      creditWalletId: row.creditWalletId,
      amount: row.amount.toString(), // bigint → string
      currency: row.currency,
      direction: resolveLedgerDirection(row, walletIds),
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
