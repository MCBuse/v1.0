import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import {
  usdCentsToUsdcBaseUnits,
  usdcBaseUnitsToUsdCents,
} from '../financial-operations/operation-money';
import { AccountWalletsService } from './account-wallets.service';
import { AccountTransferService } from './account-transfer.service';
import {
  suggestDayEndAmount,
  type DayEndSuggestion,
} from './day-end-suggestion';

export interface DayEndView {
  businessDate: string;
  timezone: string;
  routine: { availableCents: string; pendingCents: string };
  today: {
    digitalReceiptsCents: string;
    digitalReceiptCount: number;
    /** In the merchant's display currency, not settlement units. */
    cashRecordedMinor: string;
    cashRecordedCurrency: string;
    cashRecordedCount: number;
  };
  previousTransfers: Array<{
    operationId: string;
    amountCents: string;
    status: string;
    confirmedAt: string | null;
    chainSignature: string | null;
    actorUserId: string | null;
  }>;
  suggestion: {
    amountCents: string;
    cappedBy: DayEndSuggestion['cappedBy'];
    explanation: string;
  };
  cashNote: string;
}

/**
 * The day-end sweep: moving the day's takings from Routine into Holding.
 *
 * The amount is suggested, never imposed. The merchant edits and confirms it,
 * and the transfer is tagged with the business date in their own timezone so
 * a sweep run just after midnight still belongs to the day it earned.
 */
@Injectable()
export class DayEndService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly wallets: AccountWalletsService,
    private readonly transfers: AccountTransferService,
  ) {}

  async view(
    userId: string,
    businessDateOverride?: string,
  ): Promise<DayEndView> {
    const merchant = await this.requireMerchantForOwner(userId);
    const businessDate =
      businessDateOverride ?? this.businessDate(new Date(), merchant.timezone);
    const { start, end } = this.dayBounds(businessDate, merchant.timezone);

    const routine = await this.wallets.forUser(userId, 'routine');
    const [balance] = await this.db
      .select({
        available: schema.balances.available,
        pending: schema.balances.pending,
      })
      .from(schema.balances)
      .where(
        and(
          eq(schema.balances.walletId, routine.id),
          eq(schema.balances.currency, 'USDC'),
        ),
      )
      .limit(1);

    const available = balance?.available ?? 0n;
    const pending = balance?.pending ?? 0n;

    const [digital] = await this.db
      .select({
        totalDisplayMinor: sql<string>`COALESCE(SUM(${schema.merchantTransactions.displayAmountMinor}), 0)`,
        totalSettlement: sql<string>`COALESCE(SUM(${schema.merchantTransactions.settlementAmount}), 0)`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(schema.merchantTransactions)
      .where(
        and(
          eq(schema.merchantTransactions.merchantId, merchant.merchantId),
          eq(schema.merchantTransactions.status, 'finalized'),
          gte(schema.merchantTransactions.occurredAt, start),
          lt(schema.merchantTransactions.occurredAt, end),
        ),
      );

    const [cash] = await this.db
      .select({
        total: sql<string>`COALESCE(SUM(${schema.merchantCashSales.amountMinor}), 0)`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(schema.merchantCashSales)
      .where(
        and(
          eq(schema.merchantCashSales.merchantId, merchant.merchantId),
          eq(schema.merchantCashSales.status, 'recorded'),
          gte(schema.merchantCashSales.occurredAt, start),
          lt(schema.merchantCashSales.occurredAt, end),
        ),
      );

    const previous = await this.previousTransfers(userId, businessDate);

    // Receipts are recorded in the merchant's display currency; the sweep moves
    // settlement tokens, so compare like with like.
    const digitalReceiptsBaseUnits = BigInt(digital?.totalSettlement ?? '0');
    const alreadySwept = previous
      .filter((t) => t.status !== 'failed' && t.status !== 'reversed')
      .reduce(
        (sum, t) => sum + usdCentsToUsdcBaseUnits(BigInt(t.amountCents)),
        0n,
      );

    // Cash is reported, never converted into the suggestion. It has no
    // settlement value to move, so giving it one here would be misleading.
    const suggestion = suggestDayEndAmount({
      availableBaseUnits: available,
      digitalReceiptsBaseUnits,
      alreadySweptBaseUnits: alreadySwept,
    });

    return {
      businessDate,
      timezone: merchant.timezone,
      routine: {
        availableCents: usdcBaseUnitsToUsdCents(available).toString(),
        pendingCents: usdcBaseUnitsToUsdCents(pending).toString(),
      },
      today: {
        digitalReceiptsCents: usdcBaseUnitsToUsdCents(
          digitalReceiptsBaseUnits,
        ).toString(),
        digitalReceiptCount: digital?.count ?? 0,
        cashRecordedMinor: String(cash?.total ?? '0'),
        cashRecordedCurrency: 'EUR',
        cashRecordedCount: cash?.count ?? 0,
      },
      previousTransfers: previous,
      suggestion: {
        amountCents: usdcBaseUnitsToUsdCents(
          suggestion.suggestedBaseUnits,
        ).toString(),
        cappedBy: suggestion.cappedBy,
        explanation: this.explain(suggestion),
      },
      cashNote: suggestion.cashNote,
    };
  }

  /** Executes the sweep the merchant confirmed. */
  async confirm(params: {
    userId: string;
    amountCents: bigint;
    idempotencyKey: string;
    businessDate?: string;
  }) {
    const merchant = await this.requireMerchantForOwner(params.userId);
    const businessDate =
      params.businessDate ?? this.businessDate(new Date(), merchant.timezone);

    if (params.amountCents <= 0n) {
      throw new BadRequestException('Enter an amount to move');
    }

    return this.transfers.startTransfer({
      userId: params.userId,
      from: 'routine',
      to: 'holding',
      amountCents: params.amountCents,
      idempotencyKey: params.idempotencyKey,
      purpose: 'day_end',
      businessDate,
      actorUserId: params.userId,
    });
  }

  private async previousTransfers(userId: string, businessDate: string) {
    const rows = await this.db
      .select()
      .from(schema.financialOperations)
      .where(
        and(
          eq(schema.financialOperations.userId, userId),
          eq(schema.financialOperations.kind, 'merchant_dayend'),
          sql`${schema.financialOperations.metadata}->>'businessDate' = ${businessDate}`,
        ),
      )
      .orderBy(desc(schema.financialOperations.createdAt));

    return rows.map((row) => ({
      operationId: row.id,
      amountCents: (row.displayAmountMinor ?? 0n).toString(),
      status: row.status,
      confirmedAt: row.createdAt.toISOString(),
      chainSignature: row.chainSignature,
      actorUserId:
        (row.metadata as { actorUserId?: string } | null)?.actorUserId ?? null,
    }));
  }

  private explain(suggestion: DayEndSuggestion): string {
    switch (suggestion.cappedBy) {
      case 'no_receipts':
        return 'No digital payments were received today, so there is nothing to move.';
      case 'already_swept':
        return "Today's digital takings have already been moved to Holding.";
      case 'available_funds':
        return 'Limited by the funds currently available in Routine, which is less than today’s digital takings.';
      default:
        return 'Matches today’s digital takings, less anything already moved.';
    }
  }

  private async requireMerchantForOwner(userId: string) {
    const rows = await this.db
      .select({
        merchantId: schema.merchants.id,
        timezone: schema.merchants.timezone,
        receivingWalletId: schema.merchants.receivingWalletId,
      })
      .from(schema.merchants)
      .innerJoin(
        schema.merchantMemberships,
        eq(schema.merchantMemberships.merchantId, schema.merchants.id),
      )
      .where(
        and(
          eq(schema.merchantMemberships.userId, userId),
          eq(schema.merchants.isActive, true),
        ),
      )
      .limit(1);

    const merchant = rows[0];
    if (!merchant) throw new NotFoundException('No merchant for this user');

    // Only the owner of the receiving account may sweep its money.
    await this.wallets.forMerchantOwner(merchant.merchantId, userId);
    return merchant;
  }

  /** The merchant-local calendar date, so a sweep after midnight is still today's. */
  private businessDate(at: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  }

  /** UTC instants bounding a merchant-local calendar day. */
  private dayBounds(businessDate: string, timeZone: string) {
    const offsetAt = (utc: Date) => {
      const local = new Date(
        utc.toLocaleString('en-US', { timeZone }),
      ).getTime();
      const asUtc = new Date(
        utc.toLocaleString('en-US', { timeZone: 'UTC' }),
      ).getTime();
      return local - asUtc;
    };

    const naiveStart = Date.parse(`${businessDate}T00:00:00.000Z`);
    const offset = offsetAt(new Date(naiveStart));
    const start = new Date(naiveStart - offset);
    const end = new Date(start.getTime() + 86_400_000);
    return { start, end };
  }
}
