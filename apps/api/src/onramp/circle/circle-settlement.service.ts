import { Injectable, Inject, Logger } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, sql } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.provider';
import * as schema from '../../database/schema';

@Injectable()
export class CircleSettlementService {
  private readonly logger = new Logger(CircleSettlementService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Settle a Circle payment. Idempotent — safe to call from both polling and webhook.
   * - 'paid'   → credit balance + mark ledger entry completed
   * - 'failed' → mark ledger entry failed (no balance change)
   */
  async settle(
    circlePaymentId: string,
    circleStatus: 'paid' | 'failed',
  ): Promise<void> {
    const entries = await this.db
      .select()
      .from(schema.ledgerEntries)
      .where(
        and(
          eq(schema.ledgerEntries.type, 'on_ramp'),
          eq(schema.ledgerEntries.status, 'pending'),
          sql`${schema.ledgerEntries.metadata}::jsonb->>'externalId' = ${circlePaymentId}`,
        ),
      )
      .limit(1);

    const entry = entries[0];
    if (!entry) {
      // Already settled or never existed — nothing to do
      this.logger.debug(`No pending on_ramp entry for payment ${circlePaymentId} — skipping`);
      return;
    }

    if (circleStatus === 'failed') {
      await this.db
        .update(schema.ledgerEntries)
        .set({ status: 'failed' })
        .where(eq(schema.ledgerEntries.id, entry.id));

      this.logger.warn(`On-ramp failed: Circle payment ${circlePaymentId}`);
      return;
    }

    // 'paid' — credit balance atomically and mark completed
    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.balances)
        .set({
          available: sql`${schema.balances.available} + ${entry.amount}`,
        })
        .where(
          and(
            eq(schema.balances.walletId, entry.creditWalletId),
            eq(schema.balances.currency, entry.currency),
          ),
        );

      await tx
        .update(schema.ledgerEntries)
        .set({ status: 'completed' })
        .where(eq(schema.ledgerEntries.id, entry.id));
    });

    this.logger.log(
      `On-ramp settled: ${entry.amount} ${entry.currency} credited to wallet ${entry.creditWalletId} (${circlePaymentId})`,
    );
  }
}
