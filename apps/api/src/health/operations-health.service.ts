import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { ReconciliationService } from '../financial-operations/reconciliation.service';
import type { ReconciliationReport } from '../financial-operations/reconciliation';

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

/** Beyond this, an in-flight operation has stopped being "in progress". */
const OPERATION_STALE_MS = 10 * 60 * 1000;
/** Beyond this, the analytics worker is not keeping up with its one-minute tick. */
const WORKER_BACKLOG_STALE_MS = 5 * 60 * 1000;
/** Beyond this, an event stream has gone quiet enough to be worth checking. */
const STREAM_QUIET_MS = 60 * 60 * 1000;

export interface OperationsHealth {
  status: 'ok' | 'degraded';
  checkedAt: string;
  concerns: string[];
  pendingOperations: {
    total: number;
    byStatus: Record<string, number>;
    oldestAgeSeconds: number | null;
    staleCount: number;
  };
  webhooks: {
    failedLastDay: number;
    unprocessedLastHour: number;
  };
  streams: {
    eventsLastHour: number;
    lastEventAgeSeconds: number | null;
  };
  workerBacklog: {
    pending: number;
    deferred: number;
    lastSuccessfulCalculation: string | null;
    oldestAgeSeconds: number | null;
    failing: number;
  };
  reconciliation: ReconciliationReport | null;
}

/**
 * P.6 — one read that answers "is anything wrong right now?".
 *
 * Every number here is one an operator can act on: an operation that has
 * stopped moving, a webhook that never processed, a worker falling behind, a
 * wallet whose chain balance nothing accounts for. A count that cannot lead to
 * an action was left out.
 */
@Injectable()
export class OperationsHealthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly reconciliation: ReconciliationService,
  ) {}

  async check(
    options: { reconcile?: boolean; now?: Date } = {},
  ): Promise<OperationsHealth> {
    const now = options.now ?? new Date();
    const concerns: string[] = [];

    const pendingOperations = await this.pendingOperations(now);
    if (pendingOperations.staleCount > 0) {
      concerns.push(
        `${pendingOperations.staleCount} operation(s) have not advanced in 10 minutes`,
      );
    }

    const webhooks = await this.webhooks(now);
    if (webhooks.failedLastDay > 0) {
      concerns.push(`${webhooks.failedLastDay} webhook(s) failed in the last day`);
    }
    if (webhooks.unprocessedLastHour > 0) {
      concerns.push(
        `${webhooks.unprocessedLastHour} webhook(s) received in the last hour were never processed`,
      );
    }

    const streams = await this.streams(now);
    const workerBacklog = await this.workerBacklog(now);
    if (
      workerBacklog.oldestAgeSeconds !== null &&
      workerBacklog.oldestAgeSeconds * 1000 > WORKER_BACKLOG_STALE_MS
    ) {
      concerns.push(
        `analytics work has been queued for ${workerBacklog.oldestAgeSeconds}s without being processed`,
      );
    }
    if (workerBacklog.failing > 0) {
      concerns.push(
        `${workerBacklog.failing} merchant(s) have analytics work failing repeatedly`,
      );
    }

    let reconciliation: ReconciliationReport | null = null;
    if (options.reconcile) {
      // Opt-in: this reads every wallet's balance from the chain.
      reconciliation = await this.reconciliation.reconcile({ now });
      if (reconciliation.unexplained.length > 0) {
        concerns.push(
          `${reconciliation.unexplained.length} wallet(s) hold a balance the ledger does not account for`,
        );
      }
    }

    return {
      status: concerns.length === 0 ? 'ok' : 'degraded',
      checkedAt: now.toISOString(),
      concerns,
      pendingOperations,
      webhooks,
      streams,
      workerBacklog,
      reconciliation,
    };
  }

  private async pendingOperations(now: Date) {
    const rows = await this.db
      .select({
        status: schema.financialOperations.status,
        total: count(),
      })
      .from(schema.financialOperations)
      .where(inArray(schema.financialOperations.status, IN_FLIGHT))
      .groupBy(schema.financialOperations.status);

    const byStatus = Object.fromEntries(
      rows.map((row) => [row.status, Number(row.total)]),
    );
    const total = rows.reduce((sum, row) => sum + Number(row.total), 0);

    const [oldest] = await this.db
      .select({ updatedAt: schema.financialOperations.updatedAt })
      .from(schema.financialOperations)
      .where(inArray(schema.financialOperations.status, IN_FLIGHT))
      .orderBy(asc(schema.financialOperations.updatedAt))
      .limit(1);

    const [{ stale } = { stale: 0 }] = await this.db
      .select({ stale: count() })
      .from(schema.financialOperations)
      .where(
        and(
          inArray(schema.financialOperations.status, IN_FLIGHT),
          lte(
            schema.financialOperations.updatedAt,
            new Date(now.getTime() - OPERATION_STALE_MS),
          ),
        ),
      );

    return {
      total,
      byStatus,
      oldestAgeSeconds: oldest
        ? Math.max(
            0,
            Math.floor((now.getTime() - oldest.updatedAt.getTime()) / 1000),
          )
        : null,
      staleCount: Number(stale),
    };
  }

  private async webhooks(now: Date) {
    const [{ failed } = { failed: 0 }] = await this.db
      .select({ failed: count() })
      .from(schema.providerWebhookEvents)
      .where(
        and(
          eq(schema.providerWebhookEvents.status, 'failed'),
          gte(
            schema.providerWebhookEvents.receivedAt,
            new Date(now.getTime() - 24 * 60 * 60 * 1000),
          ),
        ),
      );

    const [{ unprocessed } = { unprocessed: 0 }] = await this.db
      .select({ unprocessed: count() })
      .from(schema.providerWebhookEvents)
      .where(
        and(
          eq(schema.providerWebhookEvents.status, 'received'),
          lte(
            schema.providerWebhookEvents.receivedAt,
            new Date(now.getTime() - 60 * 60 * 1000),
          ),
        ),
      );

    return {
      failedLastDay: Number(failed),
      unprocessedLastHour: Number(unprocessed),
    };
  }

  private async streams(now: Date) {
    const [{ recent } = { recent: 0 }] = await this.db
      .select({ recent: count() })
      .from(schema.merchantEvents)
      .where(
        gte(
          schema.merchantEvents.createdAt,
          new Date(now.getTime() - STREAM_QUIET_MS),
        ),
      );

    const [latest] = await this.db
      .select({ createdAt: schema.merchantEvents.createdAt })
      .from(schema.merchantEvents)
      .orderBy(sql`${schema.merchantEvents.sequence} desc`)
      .limit(1);

    return {
      eventsLastHour: Number(recent),
      lastEventAgeSeconds: latest
        ? Math.max(
            0,
            Math.floor((now.getTime() - latest.createdAt.getTime()) / 1000),
          )
        : null,
    };
  }

  private async workerBacklog(now: Date) {
    const rows = await this.db
      .select({
        firstQueuedAt: schema.merchantAnalyticsWork.firstQueuedAt,
        status: schema.merchantAnalyticsWork.status,
        attempts: schema.merchantAnalyticsWork.attempts,
      })
      .from(schema.merchantAnalyticsWork)
      ;

    const oldest = rows.reduce<Date | null>(
      (earliest, row) =>
        !earliest || row.firstQueuedAt < earliest ? row.firstQueuedAt : earliest,
      null,
    );

    const [latest] = await this.db.select({ at: sql<Date | null>`max(${schema.merchantAnalyticsSnapshots.generatedAt})` }).from(schema.merchantAnalyticsSnapshots);
    return {
      deferred: rows.filter(row => row.status === 'deferred').length,
      lastSuccessfulCalculation: latest?.at ? new Date(latest.at).toISOString() : null,
      pending: rows.length,
      oldestAgeSeconds: oldest
        ? Math.max(0, Math.floor((now.getTime() - oldest.getTime()) / 1000))
        : null,
      failing: rows.filter((row) => row.attempts >= 3).length,
    };
  }
}
