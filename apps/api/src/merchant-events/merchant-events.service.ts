import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { Observable, Subject, filter, map } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { createPgPoolConfig } from '../database/database.config';

export type MerchantEventType =
  | 'request_presented'
  | 'request_status_changed'
  | 'request_cleared';

export interface MerchantEvent {
  sequence: string;
  merchantId: string;
  type: MerchantEventType;
  paymentRequestId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

const CHANNEL = 'merchant_events';

/**
 * Publishes and streams what a merchant's devices need to see.
 *
 * Events are written to Postgres first and only then announced, so the log is
 * the source of truth and the notification is just a nudge. A device that
 * misses the nudge — because it was offline, or attached to a different API
 * instance — catches up by reading everything after its last sequence.
 */
@Injectable()
export class MerchantEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MerchantEventsService.name);
  private readonly stream = new Subject<MerchantEvent>();
  private listener?: Client;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private stopped = false;

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.startListening();
  }

  async onModuleDestroy() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    await this.listener?.end().catch(() => undefined);
    this.stream.complete();
  }

  /**
   * A dedicated connection, because LISTEN holds its session open and must not
   * be handed back to the request pool between notifications.
   */
  private async startListening(): Promise<void> {
    if (this.stopped) return;
    try {
      const client = new Client(createPgPoolConfig(this.config));
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);

      client.on('notification', (message) => {
        if (!message.payload) return;
        void this.onNotification(message.payload);
      });
      client.on('error', (error: Error) => {
        this.logger.warn(`Event listener lost: ${error.message}`);
        this.scheduleReconnect();
      });

      this.listener = client;
      this.logger.log(`Listening for ${CHANNEL} notifications`);
    } catch (error) {
      this.logger.warn(
        `Could not start the event listener: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.startListening();
    }, 5_000);
  }

  /** Reads the announced row and fans it out to this instance's subscribers. */
  private async onNotification(raw: string): Promise<void> {
    try {
      const { sequence } = JSON.parse(raw) as { sequence: string };
      const [row] = await this.db
        .select()
        .from(schema.merchantEvents)
        .where(eq(schema.merchantEvents.sequence, BigInt(sequence)))
        .limit(1);
      if (row) this.stream.next(this.toEvent(row));
    } catch (error) {
      this.logger.warn(
        `Could not dispatch a merchant event: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Appends an event. The trigger announces it to every instance. */
  async publish(params: {
    merchantId: string;
    type: MerchantEventType;
    paymentRequestId?: string | null;
    payload: Record<string, unknown>;
  }): Promise<MerchantEvent> {
    const [row] = await this.db
      .insert(schema.merchantEvents)
      .values({
        merchantId: params.merchantId,
        type: params.type,
        paymentRequestId: params.paymentRequestId ?? null,
        payload: params.payload,
      })
      .returning();
    return this.toEvent(row);
  }

  /** Everything this merchant has missed since `afterSequence`. */
  async since(
    merchantId: string,
    afterSequence: bigint | null,
    limit = 200,
  ): Promise<MerchantEvent[]> {
    const conditions = [eq(schema.merchantEvents.merchantId, merchantId)];
    if (afterSequence !== null) {
      conditions.push(gt(schema.merchantEvents.sequence, afterSequence));
    }
    const rows = await this.db
      .select()
      .from(schema.merchantEvents)
      .where(and(...conditions))
      .orderBy(asc(schema.merchantEvents.sequence))
      .limit(limit);
    return rows.map((row) => this.toEvent(row));
  }

  async latestSequence(merchantId: string): Promise<bigint | null> {
    const [row] = await this.db
      .select({
        max: sql<string | null>`MAX(${schema.merchantEvents.sequence})`,
      })
      .from(schema.merchantEvents)
      .where(eq(schema.merchantEvents.merchantId, merchantId));
    return row?.max ? BigInt(row.max) : null;
  }

  /** Live events for one merchant only. */
  streamFor(merchantId: string): Observable<MerchantEvent> {
    return this.stream.pipe(
      filter((event) => event.merchantId === merchantId),
      map((event) => event),
    );
  }

  /** True when this instance currently holds a working listener. */
  get isListening(): boolean {
    return this.listener !== undefined;
  }

  private toEvent(
    row: typeof schema.merchantEvents.$inferSelect,
  ): MerchantEvent {
    return {
      sequence: row.sequence.toString(),
      merchantId: row.merchantId,
      type: row.type as MerchantEventType,
      paymentRequestId: row.paymentRequestId,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
