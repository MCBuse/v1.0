import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, inArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { SolanaService } from '../solana/solana.service';
import {
  buildReport,
  reconcileWallet,
  stuckOperations,
  type InFlightOperation,
  type LedgerPosition,
  type ReconciliationReport,
  type WalletReconciliation,
} from './reconciliation';

/** In-flight statuses: anything not yet terminal. */
const IN_FLIGHT = [
  'created',
  'reserved',
  'collection_pending',
  'collection_settled',
  'chain_submitted',
  'chain_confirmed',
  'payout_submitted',
  'payout_settled',
  'compensating',
];

const DEFAULT_STUCK_THRESHOLD_MS = 15 * 60 * 1000;

/**
 * Compares the ledger against the chain and names the differences nothing
 * accounts for.
 *
 * Reconciliation is read-only by design. Recovery is the operation runner's
 * job: this service's output tells you *which* operations to look at, and the
 * runner resumes them from their last confirmed step. Having the reconciler
 * write balances would defeat the point of having a ledger.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly solana: SolanaService,
    private readonly config: ConfigService,
  ) {}

  async reconcile(
    options: {
      walletIds?: string[];
      currency?: string;
      stuckThresholdMs?: number;
      now?: Date;
    } = {},
  ): Promise<ReconciliationReport> {
    const currency = options.currency ?? 'USDC';
    const mint = this.config.getOrThrow<string>('SOLANA_USDC_MINT');
    const now = options.now ?? new Date();

    const positions = await this.ledgerPositions(options.walletIds, currency);
    const inFlight = await this.inFlightOperations(
      positions.map((p) => p.walletId),
    );

    const wallets: WalletReconciliation[] = [];
    for (const position of positions) {
      const read = await this.solana.readTokenBalance(position.address, mint);
      if (read.baseUnits === null) {
        this.logger.warn(
          `Could not read ${position.address} on chain: ${read.reason ?? 'unknown'}`,
        );
      }
      wallets.push(reconcileWallet(position, read.baseUnits, inFlight));
    }

    return buildReport({
      wallets,
      stuck: stuckOperations(
        inFlight,
        now,
        options.stuckThresholdMs ?? DEFAULT_STUCK_THRESHOLD_MS,
      ),
      checkedAt: now,
    });
  }

  private async ledgerPositions(
    walletIds: string[] | undefined,
    currency: string,
  ): Promise<LedgerPosition[]> {
    const rows = await this.db
      .select({
        walletId: schema.wallets.id,
        address: schema.wallets.solanaPubkey,
        available: schema.balances.available,
        pending: schema.balances.pending,
      })
      .from(schema.wallets)
      .innerJoin(
        schema.balances,
        eq(schema.balances.walletId, schema.wallets.id),
      )
      .where(
        walletIds?.length
          ? and(
              inArray(schema.wallets.id, walletIds),
              eq(schema.balances.currency, currency),
            )
          : and(
              eq(schema.wallets.isActive, true),
              eq(schema.balances.currency, currency),
            ),
      );

    return rows.map((row) => ({
      walletId: row.walletId,
      address: row.address,
      available: row.available,
      pending: row.pending,
    }));
  }

  private async inFlightOperations(
    walletIds: string[],
  ): Promise<InFlightOperation[]> {
    if (walletIds.length === 0) return [];
    const rows = await this.db
      .select({
        id: schema.financialOperations.id,
        kind: schema.financialOperations.kind,
        status: schema.financialOperations.status,
        amountBaseUnits: schema.financialOperations.amountBaseUnits,
        sourceWalletId: schema.financialOperations.sourceWalletId,
        destinationWalletId: schema.financialOperations.destinationWalletId,
        updatedAt: schema.financialOperations.updatedAt,
      })
      .from(schema.financialOperations)
      .where(inArray(schema.financialOperations.status, IN_FLIGHT));

    const relevant = new Set(walletIds);
    return rows.filter(
      (row) =>
        (row.sourceWalletId && relevant.has(row.sourceWalletId)) ||
        (row.destinationWalletId && relevant.has(row.destinationWalletId)),
    );
  }
}
