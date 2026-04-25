import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { ConfigService } from '@nestjs/config';
import { WalletsService } from '../wallets/wallets.service';
import { CreateOnrampSessionDto } from './dto/create-onramp-session.dto';
import { MoonpayWidgetProvider } from './widget/moonpay-widget.provider';
import type { NormalizedOnrampEvent } from './widget/onramp-widget.types';
import { WidgetOnrampSettlementService } from './widget-onramp-settlement.service';

const MIN_EUR_DEFAULT = 20;
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'expired']);

@Injectable()
export class OnrampSessionsService {
  private readonly logger = new Logger(OnrampSessionsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly config: ConfigService,
    private readonly walletsService: WalletsService,
    private readonly moonpay: MoonpayWidgetProvider,
    private readonly settlement: WidgetOnrampSettlementService,
  ) {}

  private getMinEur(): number {
    const v = this.config.get<string>('MOONPAY_MIN_EUR');
    if (v === undefined || v === '') return MIN_EUR_DEFAULT;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : MIN_EUR_DEFAULT;
  }

  async createSession(userId: string, dto: CreateOnrampSessionDto) {
    if (dto.provider !== 'moonpay') {
      throw new BadRequestException('Unsupported provider');
    }

    const amount = Number(dto.fiatAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Invalid fiatAmount');
    }
    const minEur = this.getMinEur();
    if (amount < minEur) {
      throw new BadRequestException(`Minimum amount is €${minEur} (sandbox guideline)`);
    }

    const wallets = await this.walletsService.findByUserId(userId);
    const savings = wallets['savings'];
    if (!savings) throw new BadRequestException('Savings wallet not found');

    const internalReference = randomUUID();
    const redirectUrl =
      this.config.get<string>('APP_REDIRECT_URL') ?? 'mcbuse://onramp/complete';

    const { widgetUrl } = await this.moonpay.createWidgetSession({
      userId,
      walletId: savings.id,
      walletAddress: savings.solanaPubkey,
      fiatAmount: dto.fiatAmount,
      fiatCurrency: dto.fiatCurrency,
      cryptoCurrency: 'USDC',
      network: 'solana',
      redirectUrl,
      internalReference,
    });

    const [row] = await this.db
      .insert(schema.onrampTransactions)
      .values({
        userId,
        walletId: savings.id,
        provider: 'moonpay',
        internalReference,
        fiatAmount: dto.fiatAmount,
        fiatCurrency: dto.fiatCurrency.toUpperCase(),
        cryptoCurrency: 'USDC',
        network: 'solana',
        walletAddress: savings.solanaPubkey,
        status: 'pending',
      })
      .returning({ id: schema.onrampTransactions.id });

    this.logger.log(`Created MoonPay onramp session ${row.id} ref=${internalReference}`);

    return {
      widgetUrl,
      transactionId: row.id,
      internalReference,
    };
  }

  async listTransactions(userId: string, limit = 20) {
    const safeLimit = Math.min(Math.max(Number.isFinite(limit) ? limit : 20, 1), 50);
    const rows = await this.db
      .select()
      .from(schema.onrampTransactions)
      .where(
        and(
          eq(schema.onrampTransactions.userId, userId),
          eq(schema.onrampTransactions.provider, 'moonpay'),
        ),
      )
      .orderBy(desc(schema.onrampTransactions.createdAt))
      .limit(safeLimit);

    return { data: rows.map((row) => this.serialize(row)), limit: safeLimit };
  }

  async getTransaction(userId: string, id: string) {
    const rows = await this.db
      .select()
      .from(schema.onrampTransactions)
      .where(eq(schema.onrampTransactions.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) throw new NotFoundException('Transaction not found');
    if (row.userId !== userId) throw new ForbiddenException();

    return this.serialize(row);
  }

  private serialize(row: typeof schema.onrampTransactions.$inferSelect) {
    return {
      id: row.id,
      provider: row.provider,
      status: row.status,
      fiatAmount: row.fiatAmount?.toString() ?? null,
      fiatCurrency: row.fiatCurrency,
      cryptoAmount: row.cryptoAmount?.toString() ?? null,
      cryptoCurrency: row.cryptoCurrency,
      network: row.network,
      walletAddress: row.walletAddress,
      txHash: row.txHash,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Apply a verified MoonPay webhook: upsert row state and settle balance when appropriate.
   */
  async applyMoonpayWebhook(event: NormalizedOnrampEvent, rawPayload: unknown): Promise<void> {
    const internalRef = event.internalReference;
    if (!internalRef) {
      this.logger.warn('MoonPay webhook missing externalTransactionId (internal ref) — cannot correlate');
      return;
    }

    const rows = await this.db
      .select()
      .from(schema.onrampTransactions)
      .where(
        and(
          eq(schema.onrampTransactions.internalReference, internalRef),
          eq(schema.onrampTransactions.provider, 'moonpay'),
        ),
      )
      .orderBy(desc(schema.onrampTransactions.createdAt))
      .limit(1);

    const row = rows[0];
    if (!row) {
      this.logger.warn(`No onramp row for internalReference=${internalRef}`);
      return;
    }

    const newStatus = this.nextStatus(row.status, event.status);

    const moonpayId = event.moonpayTransactionId ?? event.externalTransactionId;

    await this.db
      .update(schema.onrampTransactions)
      .set({
        externalTransactionId: moonpayId,
        status: newStatus,
        cryptoAmount: event.cryptoAmount ?? row.cryptoAmount?.toString() ?? undefined,
        cryptoCurrency: event.cryptoCurrency ?? row.cryptoCurrency,
        fiatAmount: event.fiatAmount ?? row.fiatAmount?.toString() ?? undefined,
        fiatCurrency: event.fiatCurrency ?? row.fiatCurrency,
        txHash: event.txHash ?? row.txHash ?? undefined,
        rawWebhookPayload: rawPayload as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(schema.onrampTransactions.id, row.id));

    if (newStatus === 'completed') {
      await this.settlement.creditIfPending(row.id);
    }
  }

  private nextStatus(current: string, incoming: string): string {
    if (current === 'completed') return 'completed';
    if (incoming === 'completed') return 'completed';
    if (TERMINAL_STATUSES.has(current)) return current;
    return incoming;
  }
}
