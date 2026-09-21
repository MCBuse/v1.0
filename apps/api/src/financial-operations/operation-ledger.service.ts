import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';

type Executor = NodePgDatabase<typeof schema>;
type Transaction = Parameters<Parameters<Executor['transaction']>[0]>[0];
type Runner = Executor | Transaction;

/**
 * Balance and ledger mechanics for account movements.
 *
 * Every mutation is a conditional UPDATE: the condition carries the money rule
 * (there must be enough available, there must be enough reserved), so two
 * concurrent callers cannot both succeed against the same funds.
 *
 * Top-ups, internal transfers and withdrawals recorded here are account
 * movements. None of them is a merchant sale and none of them touches merchant
 * transaction records.
 */
@Injectable()
export class OperationLedgerService {
  constructor(@Inject(DRIZZLE) private readonly db: Executor) {}

  /** Moves funds from available to pending. Fails when there are not enough. */
  async reserve(
    runner: Runner,
    walletId: string,
    currency: string,
    amount: bigint,
  ): Promise<void> {
    const reserved = await runner
      .update(schema.balances)
      .set({
        available: sql`${schema.balances.available} - ${amount}`,
        pending: sql`${schema.balances.pending} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.balances.walletId, walletId),
          eq(schema.balances.currency, currency),
          gte(schema.balances.available, amount),
        ),
      )
      .returning({ id: schema.balances.id });

    if (reserved.length !== 1) {
      throw new BadRequestException('Insufficient available balance');
    }
  }

  /** Returns reserved funds to available, after a confirmed failure. */
  async releaseReservation(
    runner: Runner,
    walletId: string,
    currency: string,
    amount: bigint,
  ): Promise<void> {
    const released = await runner
      .update(schema.balances)
      .set({
        available: sql`${schema.balances.available} + ${amount}`,
        pending: sql`${schema.balances.pending} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.balances.walletId, walletId),
          eq(schema.balances.currency, currency),
          gte(schema.balances.pending, amount),
        ),
      )
      .returning({ id: schema.balances.id });

    if (released.length !== 1) {
      throw new Error('Reserved balance is no longer available to release');
    }
  }

  /** Consumes a reservation once the funds have genuinely left the wallet. */
  async consumeReservation(
    runner: Runner,
    walletId: string,
    currency: string,
    amount: bigint,
  ): Promise<void> {
    const consumed = await runner
      .update(schema.balances)
      .set({
        pending: sql`${schema.balances.pending} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.balances.walletId, walletId),
          eq(schema.balances.currency, currency),
          gte(schema.balances.pending, amount),
        ),
      )
      .returning({ id: schema.balances.id });

    if (consumed.length !== 1) {
      throw new Error('Reserved balance is no longer available to consume');
    }
  }

  async credit(
    runner: Runner,
    walletId: string,
    currency: string,
    amount: bigint,
  ): Promise<void> {
    const credited = await runner
      .update(schema.balances)
      .set({
        available: sql`${schema.balances.available} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.balances.walletId, walletId),
          eq(schema.balances.currency, currency),
        ),
      )
      .returning({ id: schema.balances.id });

    if (credited.length !== 1) {
      throw new BadRequestException(
        `No ${currency} balance record exists for this wallet`,
      );
    }
  }

  async availableBalance(
    walletId: string,
    currency: string,
  ): Promise<{ available: bigint; pending: bigint }> {
    const [row] = await this.db
      .select({
        available: schema.balances.available,
        pending: schema.balances.pending,
      })
      .from(schema.balances)
      .where(
        and(
          eq(schema.balances.walletId, walletId),
          eq(schema.balances.currency, currency),
        ),
      )
      .limit(1);
    return row ?? { available: 0n, pending: 0n };
  }

  /**
   * Writes the ledger entry for an operation, exactly once.
   *
   * The operation id is the idempotency key, so a retry after a crash between
   * the chain confirming and the ledger being written cannot double-credit.
   * Returns the existing entry id when the work was already done.
   */
  async recordOnce(
    runner: Runner,
    params: {
      operationId: string;
      debitWalletId: string;
      creditWalletId: string;
      amount: bigint;
      currency: string;
      type: string;
      chainSignature?: string | null;
      metadata?: Record<string, unknown>;
    },
  ): Promise<{ ledgerEntryId: string; created: boolean }> {
    const idempotencyKey = `operation:${params.operationId}`;

    const inserted = await runner
      .insert(schema.ledgerEntries)
      .values({
        debitWalletId: params.debitWalletId,
        creditWalletId: params.creditWalletId,
        amount: params.amount,
        currency: params.currency,
        type: params.type,
        status: 'completed',
        solanaTxSignature: params.chainSignature ?? undefined,
        idempotencyKey,
        metadata: JSON.stringify({
          ...(params.metadata ?? {}),
          operationId: params.operationId,
        }),
      })
      .onConflictDoNothing({ target: schema.ledgerEntries.idempotencyKey })
      .returning({ id: schema.ledgerEntries.id });

    if (inserted.length === 1) {
      return { ledgerEntryId: inserted[0].id, created: true };
    }

    const [existing] = await runner
      .select({ id: schema.ledgerEntries.id })
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.idempotencyKey, idempotencyKey))
      .limit(1);
    if (!existing) {
      throw new Error(
        `Ledger entry for operation ${params.operationId} could neither be written nor found`,
      );
    }
    return { ledgerEntryId: existing.id, created: false };
  }

  transaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.db.transaction(work);
  }
}
