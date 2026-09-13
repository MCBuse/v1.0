import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, lt, desc, isNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { WalletsService } from '../wallets/wallets.service';
import { CreatePaymentRequestDto } from './dto/create-payment-request.dto';
import { MerchantInventoryService } from '../data-capture/merchant-inventory.service';

const DEFAULT_EXPIRY_SECONDS = 300; // 5 minutes for dynamic QR
const BASE_UNITS_PER_CENT = 10_000n; // USDC/EURC use 6 decimals: 0.01 = 10_000
const QR_VERSION = '1';
const QR_SCHEME = 'mcbuse://pay';

@Injectable()
export class PaymentRequestsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentRequestsService.name);
  private expiryInterval?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly walletsService: WalletsService,
    private readonly merchantInventory: MerchantInventoryService,
  ) {}

  onModuleInit() {
    // Expire pending dynamic requests every 60 seconds
    this.expiryInterval = setInterval(() => void this.expireStale(), 60_000);
  }

  onModuleDestroy() {
    if (this.expiryInterval) clearInterval(this.expiryInterval);
  }

  async create(userId: string, dto: CreatePaymentRequestDto) {
    const hasLineItems = !!dto.lineItems?.length;

    if (hasLineItems && dto.type !== 'dynamic') {
      throw new BadRequestException('lineItems require type=dynamic');
    }

    // When line items are provided, the server computes the total — client `amount` is ignored.
    let computedAmount: bigint | null = null;
    if (hasLineItems) {
      dto.lineItems!.forEach((it, index) => {
        this.parseCentAmount(it.unitAmount, `lineItems[${index}].unitAmount`);
      });

      computedAmount = dto.lineItems!.reduce(
        (sum, it) => sum + BigInt(it.unitAmount) * BigInt(it.quantity),
        0n,
      );
      if (!dto.currency) {
        throw new BadRequestException(
          'currency is required when lineItems are provided',
        );
      }
    } else if (dto.type === 'dynamic') {
      if (!dto.amount)
        throw new BadRequestException(
          'amount is required for dynamic payment requests',
        );
      if (!dto.currency)
        throw new BadRequestException(
          'currency is required for dynamic payment requests',
        );
      computedAmount = this.parseCentAmount(dto.amount, 'amount');
    }

    // P2P payments land in the routine wallet
    const wallets = await this.walletsService.findByUserId(userId);
    const routine = wallets['routine'];
    if (!routine) throw new BadRequestException('Routine wallet not found');

    const nonce = randomUUID();
    const now = new Date();

    let expiresAt: Date | null = null;
    if (dto.type === 'dynamic') {
      const secs = dto.expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS;
      expiresAt = new Date(now.getTime() + secs * 1000);
    }

    const rows = await this.db
      .insert(schema.paymentRequests)
      .values({
        creatorWalletId: routine.id,
        type: dto.type,
        amount: computedAmount,
        currency:
          dto.type === 'dynamic' ? (dto.currency?.toUpperCase() ?? null) : null,
        description: dto.description ?? null,
        lineItems: hasLineItems ? dto.lineItems! : null,
        nonce,
        status: 'pending',
        expiresAt,
      })
      .returning();

    const pr = rows[0];
    const qrString = this.buildQrString(pr);

    this.logger.log(
      `Payment request created: ${pr.id} type=${pr.type} nonce=${nonce}`,
    );

    return { ...this.sanitize(pr), qrString };
  }

  async resolve(nonce: string) {
    return this.resolveInternal(nonce, false);
  }

  async resolveForExecution(nonce: string) {
    return this.resolveInternal(nonce, true);
  }

  private async resolveInternal(nonce: string, allowProcessing: boolean) {
    const rows = await this.db
      .select()
      .from(schema.paymentRequests)
      .where(eq(schema.paymentRequests.nonce, nonce))
      .limit(1);

    const pr = rows[0];
    if (!pr) throw new NotFoundException('Payment request not found');
    if (
      pr.status !== 'pending' &&
      !(allowProcessing && pr.status === 'processing')
    ) {
      throw new BadRequestException(`Payment request is ${pr.status}`);
    }
    if (pr.expiresAt && pr.expiresAt < new Date()) {
      if (pr.invoiceNumber) await this.merchantInventory.expireInvoice(pr.id);
      else
        await this.db
          .update(schema.paymentRequests)
          .set({ status: 'expired' })
          .where(eq(schema.paymentRequests.id, pr.id));
      throw new BadRequestException('Payment request has expired');
    }

    // Return creator wallet pubkey + creator identity so payer sees who they're paying
    const rows2 = await this.db
      .select({
        walletId: schema.wallets.id,
        solanaPubkey: schema.wallets.solanaPubkey,
        walletType: schema.wallets.type,
        username: schema.users.username,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
      })
      .from(schema.wallets)
      .innerJoin(schema.users, eq(schema.users.id, schema.wallets.userId))
      .where(
        and(
          eq(schema.wallets.id, pr.creatorWalletId),
          eq(schema.wallets.isActive, true),
        ),
      )
      .limit(1);

    const row = rows2[0];
    if (!row) throw new NotFoundException('Creator wallet not found');

    let merchantName: string | null = null;
    if (pr.merchantId) {
      const merchantRows = await this.db
        .select({ businessName: schema.merchants.businessName })
        .from(schema.merchants)
        .where(
          and(
            eq(schema.merchants.id, pr.merchantId),
            eq(schema.merchants.isActive, true),
          ),
        )
        .limit(1);
      merchantName = merchantRows[0]?.businessName ?? null;
    }
    const invoiceItems = pr.invoiceNumber
      ? await this.db
          .select({
            name: schema.merchantInvoiceItems.name,
            quantity: schema.merchantInvoiceItems.quantity,
            unitPriceMinor: schema.merchantInvoiceItems.unitPriceMinor,
            lineTotalMinor: schema.merchantInvoiceItems.lineTotalMinor,
          })
          .from(schema.merchantInvoiceItems)
          .where(eq(schema.merchantInvoiceItems.paymentRequestId, pr.id))
      : [];

    return {
      ...this.sanitize(pr),
      merchantId: pr.merchantId,
      displayAmountMinor: pr.displayAmountMinor?.toString() ?? null,
      quoteRateScaled: pr.quoteRateScaled?.toString() ?? null,
      creatorWallet: {
        id: row.walletId,
        solanaPubkey: row.solanaPubkey,
        type: row.walletType,
      },
      recipient: {
        username: row.username,
        displayName: merchantName ?? `${row.firstName} ${row.lastName}`.trim(),
        businessName: merchantName,
      },
      merchantInvoice: pr.invoiceNumber
        ? {
            invoiceNumber: pr.invoiceNumber,
            displayAmountMinor: pr.displayAmountMinor?.toString() ?? null,
            displayCurrency: pr.displayCurrency,
            lines: invoiceItems.map((item) => ({
              name: item.name,
              quantity: item.quantity,
              unitPriceMinor: item.unitPriceMinor.toString(),
              lineTotalMinor: item.lineTotalMinor.toString(),
            })),
          }
        : null,
    };
  }

  async findById(userId: string, id: string) {
    const pr = await this.loadAndOwn(userId, id);
    return this.sanitize(pr);
  }

  async list(
    userId: string,
    filters: {
      status?: string;
      type?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    // Get user's routine wallet id first
    const wallets = await this.walletsService.findByUserId(userId);
    const routine = wallets['routine'];
    if (!routine) return [];

    const conditions = [eq(schema.paymentRequests.creatorWalletId, routine.id)];
    if (filters.status)
      conditions.push(eq(schema.paymentRequests.status, filters.status));
    if (filters.type)
      conditions.push(eq(schema.paymentRequests.type, filters.type));

    const rows = await this.db
      .select()
      .from(schema.paymentRequests)
      .where(and(...conditions))
      .orderBy(desc(schema.paymentRequests.createdAt))
      .limit(filters.limit ?? 20)
      .offset(filters.offset ?? 0);

    return rows.map((r) => this.sanitize(r));
  }

  async cancel(userId: string, id: string) {
    const pr = await this.loadAndOwn(userId, id);

    // Itemised merchant invoices use the same underlying payment-request table,
    // but cancelling one must also release its product reservation.
    if (pr.invoiceNumber) {
      await this.merchantInventory.cancelInvoiceByPaymentRequestId(id);
      this.logger.log(`Merchant invoice cancelled: ${id}`);
      return { id, status: 'cancelled' };
    }

    // Atomic conditional UPDATE — prevents race with concurrent completion/expiry
    const result = await this.db
      .update(schema.paymentRequests)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(schema.paymentRequests.id, id),
          eq(schema.paymentRequests.creatorWalletId, pr.creatorWalletId),
          eq(schema.paymentRequests.status, 'pending'),
        ),
      )
      .returning({ id: schema.paymentRequests.id });

    if (result.length === 0) {
      const current = await this.loadAndOwn(userId, id);
      throw new BadRequestException(
        `Cannot cancel a ${current.status} payment request`,
      );
    }

    this.logger.log(`Payment request cancelled: ${id}`);
    return { id, status: 'cancelled' };
  }

  /** Called by Phase 6 (P2P transfer) to mark a dynamic request completed. */
  async markCompleted(id: string, ledgerEntryId: string) {
    const result = await this.db
      .update(schema.paymentRequests)
      .set({ status: 'completed', completedAt: new Date(), ledgerEntryId })
      .where(
        and(
          eq(schema.paymentRequests.id, id),
          eq(schema.paymentRequests.type, 'dynamic'),
          eq(schema.paymentRequests.status, 'pending'),
        ),
      )
      .returning({ id: schema.paymentRequests.id });

    if (result.length !== 1) {
      throw new BadRequestException(
        'Payment request cannot be completed in its current state',
      );
    }
  }

  /** Background job: expire stale dynamic requests. */
  private async expireStale() {
    try {
      const result = await this.db
        .update(schema.paymentRequests)
        .set({ status: 'expired' })
        .where(
          and(
            eq(schema.paymentRequests.status, 'pending'),
            isNull(schema.paymentRequests.invoiceNumber),
            lt(schema.paymentRequests.expiresAt, new Date()),
          ),
        )
        .returning({ id: schema.paymentRequests.id });

      if (result.length > 0) {
        this.logger.log(`Expired ${result.length} stale payment request(s)`);
      }
    } catch (err) {
      this.logger.error('Failed to expire stale payment requests', err);
    }
  }

  private async loadAndOwn(userId: string, id: string) {
    const wallets = await this.walletsService.findByUserId(userId);
    const routine = wallets['routine'];
    if (!routine) throw new NotFoundException('Routine wallet not found');

    const rows = await this.db
      .select()
      .from(schema.paymentRequests)
      .where(eq(schema.paymentRequests.id, id))
      .limit(1);

    const pr = rows[0];
    if (!pr) throw new NotFoundException('Payment request not found');
    if (pr.creatorWalletId !== routine.id) throw new ForbiddenException();
    return pr;
  }

  private buildQrString(
    pr: typeof schema.paymentRequests.$inferSelect,
  ): string {
    const params = new URLSearchParams({ nonce: pr.nonce, v: QR_VERSION });
    if (pr.amount) params.set('amount', pr.amount.toString());
    if (pr.currency) params.set('currency', pr.currency);
    return `${QR_SCHEME}?${params.toString()}`;
  }

  private parseCentAmount(value: string, fieldName: string) {
    if (!/^\d+$/.test(value)) {
      throw new BadRequestException(
        `${fieldName} must be a non-negative integer string`,
      );
    }

    const amount = BigInt(value);
    if (amount < BASE_UNITS_PER_CENT) {
      throw new BadRequestException(
        `${fieldName} must be at least 0.01 USDC/EURC`,
      );
    }
    if (amount % BASE_UNITS_PER_CENT !== 0n) {
      throw new BadRequestException(`${fieldName} must be cent-denominated`);
    }

    return amount;
  }

  private sanitize(pr: typeof schema.paymentRequests.$inferSelect) {
    return {
      id: pr.id,
      type: pr.type,
      amount: pr.amount?.toString() ?? null,
      currency: pr.currency,
      description: pr.description,
      lineItems: pr.lineItems ?? null,
      nonce: pr.nonce,
      status: pr.status,
      expiresAt: pr.expiresAt?.toISOString() ?? null,
      completedAt: pr.completedAt?.toISOString() ?? null,
      createdAt: pr.createdAt.toISOString(),
    };
  }
}
