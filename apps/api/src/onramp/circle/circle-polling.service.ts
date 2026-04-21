import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.provider';
import * as schema from '../../database/schema';
import { CircleClient } from './circle.client';
import { CircleSettlementService } from './circle-settlement.service';

interface CirclePayment {
  id: string;
  status: string;
}

@Injectable()
export class CirclePollingService {
  private readonly logger = new Logger(CirclePollingService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly circleClient: CircleClient,
    private readonly settlement: CircleSettlementService,
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async pollPendingPayments(): Promise<void> {
    if (this.config.get<string>('CIRCLE_SETTLEMENT_MODE') !== 'polling') return;
    if (!this.config.get<string>('CIRCLE_API_KEY')) return;

    const pending = await this.db
      .select()
      .from(schema.ledgerEntries)
      .where(
        and(
          eq(schema.ledgerEntries.type, 'on_ramp'),
          eq(schema.ledgerEntries.status, 'pending'),
        ),
      );

    if (pending.length === 0) return;

    this.logger.debug(`Polling ${pending.length} pending on-ramp entries`);

    for (const entry of pending) {
      const metadata = this.parseMetadata(entry.metadata);
      const paymentId = metadata?.externalId;
      if (!paymentId) continue;

      try {
        const payment = await this.circleClient.get<CirclePayment>(
          `/v1/payments/${paymentId}`,
        );

        if (payment.status === 'paid' || payment.status === 'confirmed') {
          await this.settlement.settle(paymentId, 'paid');
        } else if (payment.status === 'failed') {
          await this.settlement.settle(paymentId, 'failed');
        }
        // 'pending' | 'action_required' — leave for next poll
      } catch (err) {
        this.logger.error(
          `Failed to poll Circle payment ${paymentId}`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  private parseMetadata(raw: string | null): Record<string, string> | null {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return null;
    }
  }
}
