import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';

export type WorkReason =
  | 'digital_sale_finalized'
  | 'cash_sale_recorded'
  | 'cash_sale_voided'
  | 'stock_adjusted'
  | 'import_committed'
  | 'manual';
export interface WorkTrigger {
  reason: WorkReason;
  sourceType: string;
  sourceId: string | null;
  at: string;
}
export interface ClaimedAnalyticsWork {
  merchantId: string;
  lastQueuedAt: Date;
  attempts: number;
  generation: number;
  token: string;
}

@Injectable()
export class AnalyticsWorkQueueService {
  private claims = new Map<string, ClaimedAnalyticsWork>();
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /** Source mutations use database triggers in their own transaction. Manual refresh uses this entrypoint. */
  async enqueue(
    merchantId: string,
    reason: WorkReason,
    source: { type: string; id?: string | null } = { type: 'unknown' },
  ): Promise<void> {
    await this.db.execute(
      sql`select enqueue_merchant_analytics(${merchantId}::uuid,${reason},${source.type},${source.id ?? null})`,
    );
  }

  private allowed(allowlist: string[]) {
    return allowlist.length === 0
      ? sql`true`
      : sql`(${sql.join(
          allowlist.map((id) => sql`m.id::text=${id} OR m.public_id=${id}`),
          sql` OR `,
        )})`;
  }

  /** Disabled backlogs stay stale but cannot consume every slot ahead of the pilot. */
  async applyEligibility(
    enabled: boolean,
    allowlist: string[],
  ): Promise<number> {
    const eligible = sql`${enabled} AND m.is_active AND ${this.allowed(allowlist)}`;
    const result = await this.db.execute(sql`
      UPDATE merchant_analytics_work w SET status='deferred',last_error='disabled',next_attempt_at=NULL,lease_until=NULL,lease_token=NULL,claimed_at=NULL
      FROM merchants m WHERE m.id=w.merchant_id AND NOT (${eligible})
        AND (w.lease_until IS NULL OR w.lease_until<=now()) AND (w.status<>'deferred' OR w.last_error<>'disabled')
      RETURNING w.merchant_id`);
    await this.db.execute(sql`
      UPDATE merchant_analytics_work w SET status='pending',last_error=NULL,next_attempt_at=now(),lease_until=NULL,lease_token=NULL,claimed_at=NULL
      FROM merchants m WHERE m.id=w.merchant_id AND (${eligible}) AND w.status='deferred'
        AND w.last_error IN ('disabled','not_in_allowlist') AND (w.lease_until IS NULL OR w.lease_until<=now())`);
    return result.rows.length;
  }

  async claim(
    limit = 10,
    allowlist?: string[],
  ): Promise<ClaimedAnalyticsWork[]> {
    const eligible =
      allowlist === undefined
        ? sql`true`
        : sql`EXISTS (SELECT 1 FROM merchants m WHERE m.id=merchant_id AND m.is_active AND ${this.allowed(allowlist)})`;
    const result = await this.db.execute(sql`
      WITH due AS (
        SELECT merchant_id FROM merchant_analytics_work
        WHERE (lease_until IS NULL OR lease_until <= now()) AND (next_attempt_at IS NULL OR next_attempt_at <= now()) AND ${eligible}
        ORDER BY first_queued_at LIMIT ${limit} FOR UPDATE SKIP LOCKED
      )
      UPDATE merchant_analytics_work w SET status='processing', lease_token=gen_random_uuid(), lease_until=now()+interval '120 seconds',
        claimed_at=now(), claimed_generation=generation, attempts=attempts+1
      FROM due WHERE w.merchant_id=due.merchant_id
      RETURNING w.merchant_id AS "merchantId", w.last_queued_at AS "lastQueuedAt", w.attempts, w.claimed_generation AS generation, w.lease_token AS token`);
    const rows = result.rows as unknown as ClaimedAnalyticsWork[];
    for (const row of rows) this.claims.set(row.merchantId, row);
    return rows;
  }

  async renew(work: ClaimedAnalyticsWork) {
    await this.db.execute(
      sql`UPDATE merchant_analytics_work SET lease_until=now()+interval '120 seconds' WHERE merchant_id=${work.merchantId}::uuid AND lease_token=${work.token}::uuid`,
    );
  }

  async complete(
    merchantId: string,
    work = this.claims.get(merchantId),
  ): Promise<void> {
    if (!work) return;
    await this.db.transaction(async (tx) => {
      const locked = await tx.execute(
        sql`SELECT generation FROM merchant_analytics_work WHERE merchant_id=${merchantId}::uuid AND lease_token=${work.token}::uuid FOR UPDATE`,
      );
      if (!locked.rows.length) return;
      await tx.execute(
        sql`DELETE FROM merchant_analytics_outbox WHERE merchant_id=${merchantId}::uuid AND generation<=${work.generation}`,
      );
      if (String(locked.rows[0].generation) === String(work.generation)) {
        await tx.execute(
          sql`DELETE FROM merchant_analytics_work WHERE merchant_id=${merchantId}::uuid`,
        );
      } else {
        await tx.execute(
          sql`UPDATE merchant_analytics_work SET status='pending',lease_until=NULL,lease_token=NULL,claimed_at=NULL,last_error=NULL WHERE merchant_id=${merchantId}::uuid`,
        );
      }
    });
    this.claims.delete(merchantId);
  }

  async fail(
    merchantId: string,
    message: string,
    work = this.claims.get(merchantId),
    deferred = false,
  ): Promise<void> {
    if (!work) return;
    await this.db.execute(
      sql`UPDATE merchant_analytics_work SET status=${deferred ? 'deferred' : 'pending'},lease_token=NULL,lease_until=NULL,claimed_at=NULL,last_error=${message.slice(0, 2000)},next_attempt_at=now()+interval '60 seconds' WHERE merchant_id=${merchantId}::uuid AND lease_token=${work.token}::uuid`,
    );
    this.claims.delete(merchantId);
  }

  async backlog() {
    const rows = await this.db.select().from(schema.merchantAnalyticsWork);
    const oldest = rows
      .map((r) => r.firstQueuedAt)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    return {
      pending: rows.filter((r) => r.status === 'pending').length,
      processing: rows.filter((r) => r.status === 'processing').length,
      deferred: rows.filter((r) => r.status === 'deferred').length,
      oldestQueuedAt: oldest?.toISOString() ?? null,
    };
  }
}
