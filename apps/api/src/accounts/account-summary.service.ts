import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { RatesService } from '../rates/rates.service';
import {
  decimalRateToScaled,
  usdcBaseUnitsToEuroMinor,
} from '../data-capture/merchant-money';
import { usdcBaseUnitsToUsdCents } from '../financial-operations/operation-money';
import { AccountWalletsService } from './account-wallets.service';

export interface AccountCard {
  account: 'holding' | 'routine';
  name: string;
  purpose: string;
  availableCents: string;
  pendingCents: string;
  /** The underlying token position, kept visible rather than hidden. */
  settlement: {
    currency: string;
    availableBaseUnits: string;
    pendingBaseUnits: string;
  };
  /**
   * A converted view, never an entitlement. The balance is USDC; this is what
   * it is worth in EUR at the quoted moment.
   */
  converted: {
    currency: 'EUR';
    availableMinor: string;
    rate: number;
    quotedAt: string;
    note: string;
  };
  actions: string[];
  recentActivity: AccountActivityEntry[];
}

export interface AccountActivityEntry {
  id: string;
  kind: string;
  description: string;
  direction: 'in' | 'out';
  amountCents: string;
  occurredAt: string;
  status: string;
  reference: string | null;
}

export interface AccountsSummary {
  accounts: AccountCard[];
  today: {
    businessDate: string;
    timezone: string;
    digitalReceiptsCents: string;
    digitalReceiptCount: number;
    cashRecordedCents: string;
    cashRecordedCount: number;
    note: string;
  };
  custody: {
    network: string;
    model: string;
    note: string;
  };
}

const ACTION_LABELS = {
  holding: ['Add money', 'Move money', 'Withdraw'],
  routine: ['Pay', 'Move money'],
} as const;

/**
 * The account view a person actually reads.
 *
 * Amounts are shown in ordinary money. The token position stays available
 * rather than hidden, because the plan requires custody and conversion to be
 * explainable — but no screen asks anyone to pick a token or a network.
 */
@Injectable()
export class AccountSummaryService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly wallets: AccountWalletsService,
    private readonly rates: RatesService,
  ) {}

  async forUser(
    userId: string,
    options: { timezone?: string; merchantId?: string } = {},
  ): Promise<AccountsSummary> {
    const { holding, routine } = await this.wallets.bothForUser(userId);
    const timezone = options.timezone ?? 'Europe/Berlin';

    const rate = this.rates.getAll().USD_TO_EUR;
    const rateScaled = decimalRateToScaled(rate.rate);

    const [holdingCard, routineCard] = await Promise.all([
      this.buildCard(holding.id, 'holding', rate, rateScaled),
      this.buildCard(routine.id, 'routine', rate, rateScaled),
    ]);

    return {
      accounts: [holdingCard, routineCard],
      today: await this.todaySummary(options.merchantId, timezone),
      custody: {
        network: 'Solana devnet',
        model:
          'Balances are held as test USDC in accounts MCBuse operates for you.',
        note: 'Network fees are paid by MCBuse. You never need to hold SOL or manage a seed phrase.',
      },
    };
  }

  private async buildCard(
    walletId: string,
    account: 'holding' | 'routine',
    rate: { rate: number; updatedAt: string },
    rateScaled: bigint,
  ): Promise<AccountCard> {
    const [balance] = await this.db
      .select({
        available: schema.balances.available,
        pending: schema.balances.pending,
      })
      .from(schema.balances)
      .where(
        and(
          eq(schema.balances.walletId, walletId),
          eq(schema.balances.currency, 'USDC'),
        ),
      )
      .limit(1);

    const available = balance?.available ?? 0n;
    const pending = balance?.pending ?? 0n;

    return {
      account,
      name: account === 'holding' ? 'Holding' : 'Routine',
      purpose:
        account === 'holding'
          ? 'Where you keep money and move it to your bank.'
          : 'What you spend from and receive payments into.',
      availableCents: usdcBaseUnitsToUsdCents(available).toString(),
      pendingCents: usdcBaseUnitsToUsdCents(pending).toString(),
      settlement: {
        currency: 'USDC',
        availableBaseUnits: available.toString(),
        pendingBaseUnits: pending.toString(),
      },
      converted: {
        currency: 'EUR',
        availableMinor: usdcBaseUnitsToEuroMinor(
          available,
          rateScaled,
        ).toString(),
        rate: rate.rate,
        quotedAt: rate.updatedAt,
        note: 'Converted for display. Your balance is held in USD-denominated test USDC, not in euro.',
      },
      actions: [...ACTION_LABELS[account]],
      recentActivity: await this.recentActivity(walletId),
    };
  }

  private async recentActivity(
    walletId: string,
  ): Promise<AccountActivityEntry[]> {
    const entries = await this.db
      .select()
      .from(schema.ledgerEntries)
      .where(
        or(
          eq(schema.ledgerEntries.debitWalletId, walletId),
          eq(schema.ledgerEntries.creditWalletId, walletId),
        ),
      )
      .orderBy(desc(schema.ledgerEntries.createdAt))
      .limit(10);

    return entries.map((entry) => {
      const incoming = entry.creditWalletId === walletId;
      const selfFunded = entry.creditWalletId === entry.debitWalletId;
      return {
        id: entry.id,
        kind: entry.type,
        description: this.describe(entry.type, incoming, selfFunded),
        direction: selfFunded
          ? entry.type === 'off_ramp'
            ? 'out'
            : 'in'
          : incoming
            ? 'in'
            : 'out',
        amountCents: usdcBaseUnitsToUsdCents(entry.amount).toString(),
        occurredAt: entry.createdAt.toISOString(),
        status: entry.status,
        reference: entry.solanaTxSignature,
      };
    });
  }

  private describe(
    type: string,
    incoming: boolean,
    selfFunded: boolean,
  ): string {
    if (type === 'on_ramp') return 'Money added';
    if (type === 'off_ramp') return 'Withdrawal';
    if (type === 'internal') return incoming ? 'Moved in' : 'Moved out';
    if (type === 'p2p') return incoming ? 'Payment received' : 'Payment sent';
    if (selfFunded) return 'Adjustment';
    return incoming ? 'Received' : 'Sent';
  }

  /**
   * Today's takings, kept separate from spendable funds. Recorded cash is
   * shown apart because it never became a digital balance and cannot be swept.
   */
  private async todaySummary(
    merchantId: string | undefined,
    timezone: string,
  ): Promise<AccountsSummary['today']> {
    const businessDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const empty = {
      businessDate,
      timezone,
      digitalReceiptsCents: '0',
      digitalReceiptCount: 0,
      cashRecordedCents: '0',
      cashRecordedCount: 0,
      note: 'Recorded cash is not part of your digital balance and cannot be moved between accounts.',
    };

    if (!merchantId) return empty;

    const dayStart = new Date(`${businessDate}T00:00:00`);

    const [digital] = await this.db
      .select({
        total: sql<string>`COALESCE(SUM(${schema.merchantTransactions.displayAmountMinor}), 0)`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(schema.merchantTransactions)
      .where(
        and(
          eq(schema.merchantTransactions.merchantId, merchantId),
          eq(schema.merchantTransactions.status, 'finalized'),
          gte(schema.merchantTransactions.occurredAt, dayStart),
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
          eq(schema.merchantCashSales.merchantId, merchantId),
          eq(schema.merchantCashSales.status, 'recorded'),
          gte(schema.merchantCashSales.occurredAt, dayStart),
        ),
      );

    return {
      ...empty,
      digitalReceiptsCents: String(digital?.total ?? '0'),
      digitalReceiptCount: digital?.count ?? 0,
      cashRecordedCents: String(cash?.total ?? '0'),
      cashRecordedCount: cash?.count ?? 0,
    };
  }
}
