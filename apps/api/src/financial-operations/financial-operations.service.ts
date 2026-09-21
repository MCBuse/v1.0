import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import {
  assertIdempotentReuse,
  operationFingerprint,
} from './operation-fingerprint';
import {
  canTransition,
  isTerminal,
  resumeAction,
  type OperationKind,
  type OperationStatus,
  type ResumeAction,
} from './operation-state';

export type FinancialOperation = typeof schema.financialOperations.$inferSelect;

type Transaction = Parameters<
  Parameters<NodePgDatabase<typeof schema>['transaction']>[0]
>[0];

export interface BeginOperationParams {
  userId: string;
  kind: OperationKind;
  idempotencyKey: string;
  amountBaseUnits: bigint;
  currency: string;
  sourceWalletId?: string | null;
  destinationWalletId?: string | null;
  displayAmountMinor?: bigint | null;
  displayCurrency?: string | null;
  quoteRateScaled?: bigint | null;
  quotedAt?: Date | null;
  provider?: string | null;
  providerAccountId?: string | null;
  providerDestinationId?: string | null;
  reversalOfOperationId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Columns a caller may set while advancing an operation. */
export interface OperationPatch {
  providerRef?: string | null;
  providerStatus?: string | null;
  paymentIntentId?: string | null;
  refundId?: string | null;
  refundStatus?: string | null;
  providerDestinationId?: string | null;
  providerAccountId?: string | null;
  chainSignature?: string | null;
  chainStatus?: string | null;
  ledgerEntryId?: string | null;
  reservedAt?: Date | null;
  collectionSettledAt?: Date | null;
  chainSubmittedAt?: Date | null;
  chainConfirmedAt?: Date | null;
  payoutSubmittedAt?: Date | null;
  finalizedAt?: Date | null;
  nextAttemptAt?: Date | null;
  metadata?: Record<string, unknown> | null;
  failureCode?: string | null;
  failureDetail?: string | null;
}

/**
 * The durable record behind every money movement.
 *
 * Nothing here talks to Stripe or Solana. It owns the questions those callers
 * must never answer for themselves: has this request been seen before, is this
 * step legal from where we are, and what is safe to do after a restart.
 */
@Injectable()
export class FinancialOperationsService {
  private readonly logger = new Logger(FinancialOperationsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Optional() private readonly config?: ConfigService,
  ) {}

  /**
   * Creates the operation, or returns the existing one when the same client
   * key arrives again. A replay with different inputs is refused outright.
   */
  async begin(params: BeginOperationParams): Promise<{
    operation: FinancialOperation;
    replayed: boolean;
  }> {
    if (!params.idempotencyKey) {
      throw new BadRequestException('Idempotency-Key is required');
    }
    if (params.amountBaseUnits <= 0n) {
      throw new BadRequestException('Amount must be positive');
    }

    const inputFingerprint = operationFingerprint({
      kind: params.kind,
      amountBaseUnits: params.amountBaseUnits,
      currency: params.currency,
      sourceWalletId: params.sourceWalletId ?? null,
      destinationWalletId: params.destinationWalletId ?? null,
      displayAmountMinor: params.displayAmountMinor ?? null,
      displayCurrency: params.displayCurrency ?? null,
      provider: params.provider ?? null,
      providerDestinationId: params.providerDestinationId ?? null,
      providerAccountId: params.providerAccountId ?? null,
    });

    const existing = await this.findByKey(params.userId, params.idempotencyKey);
    if (existing) {
      assertIdempotentReuse(
        existing.inputFingerprint,
        inputFingerprint,
        params.kind,
      );
      return { operation: existing, replayed: true };
    }

    if (this.config?.get<string>('FINANCIAL_MODE') === 'mock')
      throw new BadRequestException(
        'Account settlement requires sandbox financial mode',
      );
    if (process.env.MONEY_INITIATION_ENABLED === 'false')
      throw new BadRequestException(
        'New money movements are temporarily disabled',
      );
    try {
      return await this.db.transaction(async (tx) => {
        const [operation] = await tx
          .insert(schema.financialOperations)
          .values({
            userId: params.userId,
            kind: params.kind,
            status: 'created',
            idempotencyKey: params.idempotencyKey,
            inputFingerprint,
            sourceWalletId: params.sourceWalletId ?? null,
            destinationWalletId: params.destinationWalletId ?? null,
            amountBaseUnits: params.amountBaseUnits,
            currency: params.currency,
            displayAmountMinor: params.displayAmountMinor ?? null,
            displayCurrency: params.displayCurrency ?? null,
            quoteRateScaled: params.quoteRateScaled ?? null,
            quotedAt: params.quotedAt ?? null,
            provider: params.provider ?? null,
            providerAccountId: params.providerAccountId ?? null,
            providerDestinationId: params.providerDestinationId ?? null,
            reversalOfOperationId: params.reversalOfOperationId ?? null,
            metadata: params.metadata ?? null,
          })
          .returning();

        await this.appendEvent(tx, operation.id, {
          eventType: 'created',
          fromStatus: null,
          toStatus: 'created',
          detail: { kind: params.kind },
        });

        return { operation, replayed: false };
      });
    } catch (error) {
      // Lost a race on the unique index: the winner's row is the answer.
      const raced = await this.findByKey(params.userId, params.idempotencyKey);
      if (raced) {
        assertIdempotentReuse(
          raced.inputFingerprint,
          inputFingerprint,
          params.kind,
        );
        return { operation: raced, replayed: true };
      }
      throw error;
    }
  }

  async require(operationId: string): Promise<FinancialOperation> {
    const [operation] = await this.db
      .select()
      .from(schema.financialOperations)
      .where(eq(schema.financialOperations.id, operationId))
      .limit(1);
    if (!operation) throw new NotFoundException('Operation not found');
    return operation;
  }

  /**
   * Moves the operation one legal step forward. The status guard is part of the
   * UPDATE, so two callers racing the same step cannot both win.
   */
  async advance(
    operationId: string,
    to: OperationStatus,
    patch: OperationPatch = {},
    detail: Record<string, unknown> = {},
  ): Promise<FinancialOperation> {
    const current = await this.require(operationId);
    const kind = current.kind as OperationKind;
    const from = current.status as OperationStatus;

    if (!canTransition(kind, from, to)) {
      throw new BadRequestException(
        `A ${kind} operation cannot move from ${from} to ${to}`,
      );
    }

    return this.applyTransition(operationId, from, to, patch, detail, to);
  }

  /** Declares failure. Only legal while nothing irreversible has happened. */
  async fail(
    operationId: string,
    failureCode: string,
    failureDetail?: string,
  ): Promise<FinancialOperation> {
    const current = await this.require(operationId);
    const from = current.status as OperationStatus;
    const kind = current.kind as OperationKind;

    // The state machine is the single authority on what is legal. Repeating
    // its rules here by hand is how `compensating` slipped through once.
    if (!canTransition(kind, from, 'failed')) {
      if (isTerminal(from)) {
        throw new BadRequestException(
          `Operation is already ${from} and cannot be failed`,
        );
      }
      throw new BadRequestException(
        `A ${kind} operation at ${from} has already moved value; ` +
          'it must be compensated rather than failed',
      );
    }

    return this.applyTransition(
      operationId,
      from,
      'failed',
      { failureCode, failureDetail: failureDetail ?? null },
      { failureCode, failureDetail },
      'failed',
    );
  }

  /** Starts putting value back after a failure that came too late to refuse. */
  async beginCompensation(
    operationId: string,
    reason: string,
  ): Promise<FinancialOperation> {
    const current = await this.require(operationId);
    const from = current.status as OperationStatus;
    const kind = current.kind as OperationKind;

    if (!canTransition(kind, from, 'compensating')) {
      throw new BadRequestException(
        `A ${kind} operation at ${from} has nothing to compensate`,
      );
    }

    return this.applyTransition(
      operationId,
      from,
      'compensating',
      { failureCode: reason },
      { reason },
      'compensating',
    );
  }

  async completeCompensation(
    operationId: string,
    detail: Record<string, unknown>,
  ): Promise<FinancialOperation> {
    const current = await this.require(operationId);
    const from = current.status as OperationStatus;
    const kind = current.kind as OperationKind;

    if (!canTransition(kind, from, 'reversed')) {
      throw new BadRequestException(
        `A ${kind} operation at ${from} cannot be marked reversed`,
      );
    }

    return this.applyTransition(
      operationId,
      from,
      'reversed',
      {},
      detail,
      'reversed',
    );
  }

  /** Records something worth keeping without changing the status. */
  async note(
    operationId: string,
    eventType: string,
    detail: Record<string, unknown>,
  ): Promise<void> {
    const current = await this.require(operationId);
    await this.db.transaction(async (tx) => {
      await this.appendEvent(tx, operationId, {
        eventType,
        fromStatus: current.status,
        toStatus: current.status,
        detail,
      });
    });
  }

  /** In-flight operations whose next attempt is due. */
  async due(limit = 25): Promise<FinancialOperation[]> {
    const now = new Date();
    return this.db
      .select()
      .from(schema.financialOperations)
      .where(
        and(
          inArray(schema.financialOperations.status, [
            'created',
            'reserved',
            'collection_pending',
            'collection_settled',
            'chain_submitted',
            'chain_confirmed',
            'payout_submitted',
            'payout_settled',
            'compensating',
          ]),
          or(
            isNull(schema.financialOperations.nextAttemptAt),
            lte(schema.financialOperations.nextAttemptAt, now),
          ),
          // Skip anything another worker is already acting on.
          or(
            isNull(schema.financialOperations.claimedUntil),
            lte(schema.financialOperations.claimedUntil, now),
          ),
        ),
      )
      .orderBy(asc(schema.financialOperations.updatedAt))
      .limit(limit);
  }

  /**
   * Takes an exclusive lease on an operation, returning it only to the worker
   * that won.
   *
   * Without this, two instances sweeping at the same moment both read an
   * operation at `reserved`, both pass their status check, and both broadcast
   * the transfer. The status change would reject the second one — after the
   * money had already moved twice on chain. The claim has to happen before any
   * irreversible work, which means before the key is even decrypted.
   */
  async claim(
    operationId: string,
    workerId: string,
    leaseMs: number,
  ): Promise<FinancialOperation | null> {
    const now = new Date();
    const [claimed] = await this.db
      .update(schema.financialOperations)
      .set({
        claimedUntil: new Date(now.getTime() + leaseMs),
        claimedBy: workerId,
        // `attempts` deliberately untouched: taking a lease is not an attempt
        // at the provider. `deferNextAttempt` is what counts retries.
      })
      .where(
        and(
          eq(schema.financialOperations.id, operationId),
          or(
            isNull(schema.financialOperations.claimedUntil),
            lte(schema.financialOperations.claimedUntil, now),
          ),
        ),
      )
      .returning();

    return claimed ?? null;
  }

  /** Hands the operation back so the next due sweep can pick it up. */
  async release(operationId: string, workerId: string): Promise<void> {
    await this.db
      .update(schema.financialOperations)
      .set({ claimedUntil: null, claimedBy: null })
      .where(
        and(
          eq(schema.financialOperations.id, operationId),
          eq(schema.financialOperations.claimedBy, workerId),
        ),
      );
  }

  actionFor(operation: FinancialOperation): ResumeAction {
    return resumeAction(
      operation.kind as OperationKind,
      operation.status as OperationStatus,
    );
  }

  async reserveBalance(operation: FinancialOperation): Promise<void> {
    const insufficient = await this.db.transaction(async (tx) => {
      const [changed] = await tx
        .update(schema.financialOperations)
        .set({
          status: 'reserved',
          reservedAt: new Date(),
          nextAttemptAt: new Date(),
        })
        .where(
          and(
            eq(schema.financialOperations.id, operation.id),
            eq(schema.financialOperations.status, 'created'),
          ),
        )
        .returning();
      if (!changed) return;
      const rows = await tx
        .update(schema.balances)
        .set({
          available: sql`${schema.balances.available} - ${operation.amountBaseUnits}`,
          pending: sql`${schema.balances.pending} + ${operation.amountBaseUnits}`,
        })
        .where(
          and(
            eq(schema.balances.walletId, operation.sourceWalletId!),
            eq(schema.balances.currency, operation.currency),
            sql`${schema.balances.available} >= ${operation.amountBaseUnits}`,
          ),
        )
        .returning();
      if (rows.length !== 1) {
        await tx
          .update(schema.financialOperations)
          .set({
            status: 'failed',
            reservedAt: null,
            nextAttemptAt: null,
            failureCode: 'insufficient_balance',
            updatedAt: new Date(),
          })
          .where(eq(schema.financialOperations.id, operation.id));
        await this.appendEvent(tx, operation.id, {
          eventType: 'failed',
          fromStatus: 'created',
          toStatus: 'failed',
          detail: { failureCode: 'insufficient_balance' },
        });
        return true;
      }
      await this.appendEvent(tx, operation.id, {
        eventType: 'reserved',
        fromStatus: 'created',
        toStatus: 'reserved',
        detail: {},
      });
    });
    // Commit the refusal before returning the error, so recovery cannot later
    // execute a request the merchant was told had been rejected.
    if (insufficient)
      throw new BadRequestException('Insufficient available balance');
  }

  /** Reservation release and terminal status share one commit, including retries. */
  async releaseBalanceAndEnd(
    operation: FinancialOperation,
    status: 'failed' | 'reversed',
    reason: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const current = (
        await tx
          .select()
          .from(schema.financialOperations)
          .where(eq(schema.financialOperations.id, operation.id))
          .for('update')
      )[0];
      if (!current || current.status === status) return;
      if (
        !canTransition(
          current.kind as OperationKind,
          current.status as OperationStatus,
          status,
        )
      )
        throw new BadRequestException('Invalid reservation release state');
      const rows = await tx
        .update(schema.balances)
        .set({
          available: sql`${schema.balances.available} + ${current.amountBaseUnits}`,
          pending: sql`${schema.balances.pending} - ${current.amountBaseUnits}`,
        })
        .where(
          and(
            eq(schema.balances.walletId, current.sourceWalletId!),
            eq(schema.balances.currency, current.currency),
            sql`${schema.balances.pending} >= ${current.amountBaseUnits}`,
          ),
        )
        .returning();
      if (rows.length !== 1) throw new Error('Reserved balance is unavailable');
      await tx
        .update(schema.financialOperations)
        .set({
          status,
          failureCode: reason,
          nextAttemptAt: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.financialOperations.id, current.id));
      await this.appendEvent(tx, current.id, {
        eventType: status,
        fromStatus: current.status,
        toStatus: status,
        detail: { reason },
      });
    });
  }

  async patchMetadata(id: string, patch: Record<string, unknown>) {
    await this.db
      .update(schema.financialOperations)
      .set({
        metadata: sql`coalesce(${schema.financialOperations.metadata}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
      })
      .where(eq(schema.financialOperations.id, id));
  }

  async patchProvider(
    id: string,
    patch: Pick<
      OperationPatch,
      | 'paymentIntentId'
      | 'refundId'
      | 'refundStatus'
      | 'providerRef'
      | 'providerStatus'
    >,
  ) {
    await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(schema.financialOperations)
        .where(eq(schema.financialOperations.id, id))
        .for('update');
      if (!current) throw new NotFoundException('Operation not found');
      const changed = Object.entries(patch).some(
        ([key, value]) =>
          value !== undefined &&
          current[key as keyof FinancialOperation] !== value,
      );
      if (!changed) return;
      await tx
        .update(schema.financialOperations)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(schema.financialOperations.id, id));
      await this.appendEvent(tx, id, {
        eventType: 'provider_updated',
        fromStatus: current.status,
        toStatus: current.status,
        detail: patch,
      });
    });
  }

  async renew(id: string, worker: string, leaseMs: number) {
    await this.db
      .update(schema.financialOperations)
      .set({ claimedUntil: new Date(Date.now() + leaseMs) })
      .where(
        and(
          eq(schema.financialOperations.id, id),
          eq(schema.financialOperations.claimedBy, worker),
        ),
      );
  }

  /** Records the provider's latest status without touching the lifecycle. */
  async updateProviderStatus(
    operationId: string,
    providerStatus: string | null,
  ): Promise<void> {
    await this.db
      .update(schema.financialOperations)
      .set({ providerStatus, updatedAt: new Date() })
      .where(eq(schema.financialOperations.id, operationId));
  }

  /** Schedules the next recovery look, with a simple linear backoff. */
  async deferNextAttempt(operationId: string, delayMs: number): Promise<void> {
    await this.db
      .update(schema.financialOperations)
      .set({
        attempts: sql`${schema.financialOperations.attempts} + 1`,
        nextAttemptAt: new Date(Date.now() + delayMs),
      })
      .where(eq(schema.financialOperations.id, operationId));
  }

  async findByProviderRef(
    providerRef: string,
  ): Promise<FinancialOperation | null> {
    const [operation] = await this.db
      .select()
      .from(schema.financialOperations)
      .where(eq(schema.financialOperations.providerRef, providerRef))
      .limit(1);
    return operation ?? null;
  }

  async listForUser(userId: string, limit = 25): Promise<FinancialOperation[]> {
    return this.db
      .select()
      .from(schema.financialOperations)
      .where(eq(schema.financialOperations.userId, userId))
      .orderBy(sql`${schema.financialOperations.createdAt} desc`)
      .limit(limit);
  }

  async findByKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<FinancialOperation | null> {
    const [operation] = await this.db
      .select()
      .from(schema.financialOperations)
      .where(
        and(
          eq(schema.financialOperations.userId, userId),
          eq(schema.financialOperations.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return operation ?? null;
  }

  private async applyTransition(
    operationId: string,
    from: OperationStatus,
    to: OperationStatus,
    patch: OperationPatch,
    detail: Record<string, unknown>,
    eventType: string,
  ): Promise<FinancialOperation> {
    return this.db.transaction(async (tx) => {
      const updated = await tx
        .update(schema.financialOperations)
        .set({
          ...this.cleanPatch(patch),
          status: to,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.financialOperations.id, operationId),
            // The guard makes the transition atomic: a concurrent caller that
            // already moved this operation leaves nothing for us to update.
            eq(schema.financialOperations.status, from),
          ),
        )
        .returning();

      if (updated.length !== 1) {
        throw new BadRequestException(
          `Operation is no longer at ${from}; it cannot move to ${to}`,
        );
      }

      await this.appendEvent(tx, operationId, {
        eventType,
        fromStatus: from,
        toStatus: to,
        detail,
      });

      return updated[0];
    });
  }

  private cleanPatch(patch: OperationPatch): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
  }

  private async appendEvent(
    tx: Transaction,
    operationId: string,
    event: {
      eventType: string;
      fromStatus: string | null;
      toStatus: string | null;
      detail: Record<string, unknown>;
    },
  ): Promise<void> {
    // The sequence is derived inside the same transaction and protected by a
    // unique index, so the log cannot develop gaps or duplicates.
    await tx.execute(sql`
      INSERT INTO financial_operation_events
        (operation_id, sequence, event_type, from_status, to_status, detail)
      SELECT
        ${operationId}::uuid,
        COALESCE(MAX(sequence), 0) + 1,
        ${event.eventType},
        ${event.fromStatus},
        ${event.toStatus},
        ${JSON.stringify(event.detail)}::jsonb
      FROM financial_operation_events
      WHERE operation_id = ${operationId}::uuid
    `);
  }
}
