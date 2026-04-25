import { Injectable, Inject, Logger } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, sql } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';

const USDC_DECIMALS = 6;

function quoteAmountToMicroUnits(amountStr: string | null | undefined): bigint | null {
  if (!amountStr) return null;
  const n = Number(amountStr);
  if (!Number.isFinite(n) || n <= 0) return null;
  return BigInt(Math.round(n * 10 ** USDC_DECIMALS));
}

@Injectable()
export class WidgetOnrampSettlementService {
  private readonly logger = new Logger(WidgetOnrampSettlementService.name);

  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>) {}

  /**
   * Credits USDC savings balance once per onramp row (ledger idempotency).
   * Safe to call from webhooks and chain reconciliation.
   */
  async creditIfPending(onrampRowId: string): Promise<{ credited: boolean }> {
    const idempotencyKey = `onramp_widget_credit:${onrampRowId}`;

    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(schema.onrampTransactions)
        .where(eq(schema.onrampTransactions.id, onrampRowId))
        .limit(1);

      const row = rows[0];
      if (!row) return { credited: false };
      if (row.status !== 'completed') return { credited: false };

      const amountMicros =
        quoteAmountToMicroUnits(row.cryptoAmount?.toString() ?? undefined) ??
        0n;
      if (amountMicros <= 0n) {
        this.logger.warn(`Onramp ${onrampRowId} completed but no crypto amount — skipping credit`);
        return { credited: false };
      }

      const inserted = await tx
        .insert(schema.ledgerEntries)
        .values({
          debitWalletId: row.walletId,
          creditWalletId: row.walletId,
          amount: amountMicros,
          currency: 'USDC',
          type: 'on_ramp',
          status: 'completed',
          idempotencyKey,
          solanaTxSignature: row.txHash ?? undefined,
          metadata: JSON.stringify({
            source: 'widget_onramp',
            provider: row.provider,
            onrampTransactionId: row.id,
            moonpayExternalId: row.externalTransactionId,
          }),
        })
        .onConflictDoNothing({ target: schema.ledgerEntries.idempotencyKey })
        .returning({ id: schema.ledgerEntries.id });

      if (inserted.length === 0) {
        return { credited: false };
      }

      const updated = await tx
        .update(schema.balances)
        .set({ available: sql`${schema.balances.available} + ${amountMicros}` })
        .where(
          and(
            eq(schema.balances.walletId, row.walletId),
            eq(schema.balances.currency, 'USDC'),
          ),
        )
        .returning({ id: schema.balances.id });

      if (updated.length !== 1) {
        throw new Error(`Balance row missing for wallet ${row.walletId} USDC`);
      }

      this.logger.log(`Widget on-ramp credited ${amountMicros} micro USDC for ${onrampRowId}`);
      return { credited: true };
    });
  }
}
