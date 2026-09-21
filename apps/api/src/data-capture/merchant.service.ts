import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  MerchantConsent,
  MerchantPaymentRequest,
  MerchantPaymentRequestPage,
  MerchantProfile,
  MerchantSummary,
  MerchantTransaction,
  MerchantTransactionPage,
} from '@repo/shared';
import { randomUUID } from 'crypto';
import { and, count, desc, eq, gte, ilike, inArray, isNull, or } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { RatesService } from '../rates/rates.service';
import { CreateMerchantPaymentRequestDto } from './dto/create-merchant-payment-request.dto';
import { ListMerchantTransactionsDto } from './dto/list-merchant-transactions.dto';
import { ListMerchantPaymentRequestsDto } from './dto/list-merchant-payment-requests.dto';
import { UpdateMerchantProfileDto } from './dto/update-merchant-profile.dto';
import { calculateMerchantReadiness } from './merchant-readiness';
import {
  decimalRateToScaled,
  euroMinorToUsdcBaseUnits,
  usdcBaseUnitsToEuroMinor,
} from './merchant-money';
import { toMerchantProblem } from './merchant-problem';
import {
  buildMerchantActivitySummary,
  calculateCaptureQualityPercent,
  merchantCalendarDaySpan,
  merchantLocalDateKey,
} from './merchant-summary';

const CONSENT_PURPOSE = 'evidence_assessment';
const CONSENT_VERSION = '2026-09-merchant-v1';
const QR_SCHEME = 'mcbuse://pay';
const QR_VERSION = '1';
const REQUEST_TTL_MS = 10 * 60 * 1000;

export type MerchantContext = {
  merchantId: string;
  publicId: string;
  businessName: string;
  timezone: string;
  displayCurrency: string;
  receivingWalletId: string;
  role: string;
};

@Injectable()
export class MerchantService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly rates: RatesService,
    private readonly config: ConfigService,
  ) {}

  async getMe(userId: string): Promise<MerchantProfile> {
    const merchant = await this.requireMerchant(userId);
    return {
      id: merchant.publicId,
      businessName: merchant.businessName,
      timezone: merchant.timezone,
      displayCurrency: 'EUR',
      role: 'owner',
    };
  }

  async updateProfile(userId: string, dto: UpdateMerchantProfileDto): Promise<MerchantProfile> {
    const merchant = await this.requireMerchant(userId);
    const rows = await this.db.update(schema.merchants).set({ ...(dto.businessName !== undefined ? { businessName: dto.businessName.trim() } : {}), ...(dto.timezone !== undefined ? { timezone: dto.timezone.trim() } : {}), updatedAt: new Date() }).where(eq(schema.merchants.id, merchant.merchantId)).returning();
    const row = rows[0];
    return { id: merchant.publicId, businessName: row.businessName, timezone: row.timezone, displayCurrency: 'EUR', role: 'owner' };
  }

  async createPaymentRequest(
    userId: string,
    dto: CreateMerchantPaymentRequestDto,
  ): Promise<MerchantPaymentRequest> {
    const merchant = await this.requireMerchant(userId);
    const displayAmountMinor = BigInt(dto.amountMinor);
    const rate = this.rates.getAll().USD_TO_EUR;
    const quoteRateScaled = decimalRateToScaled(rate.rate);
    const settlementAmount = euroMinorToUsdcBaseUnits(
      displayAmountMinor,
      quoteRateScaled,
    );
    const now = new Date();
    const expiresAt = new Date(now.getTime() + REQUEST_TTL_MS);
    const nonce = randomUUID();

    const rows = await this.db
      .insert(schema.paymentRequests)
      .values({
        creatorWalletId: merchant.receivingWalletId,
        merchantId: merchant.merchantId,
        type: 'dynamic',
        amount: settlementAmount,
        currency: 'USDC',
        description: dto.description?.trim() || null,
        nonce,
        status: 'pending',
        expiresAt,
        displayAmountMinor,
        displayCurrency: 'EUR',
        quoteRateScaled,
        quotedAt: new Date(rate.updatedAt),
      })
      .returning();

    return this.paymentRequestResponse(rows[0]);
  }

  async getPaymentRequest(
    userId: string,
    id: string,
  ): Promise<MerchantPaymentRequest> {
    const merchant = await this.requireMerchant(userId);
    const rows = await this.db
      .select()
      .from(schema.paymentRequests)
      .where(
        and(
          eq(schema.paymentRequests.id, id),
          eq(schema.paymentRequests.merchantId, merchant.merchantId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Payment request not found');
    return this.paymentRequestResponse(rows[0]);
  }

  async listPaymentRequests(
    userId: string,
    filters: ListMerchantPaymentRequestsDto,
  ): Promise<MerchantPaymentRequestPage> {
    const merchant = await this.requireMerchant(userId);
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const conditions = [
      eq(schema.paymentRequests.merchantId, merchant.merchantId),
      isNull(schema.paymentRequests.invoiceNumber),
    ];
    if (filters.status)
      conditions.push(eq(schema.paymentRequests.status, filters.status));
    if (filters.query?.trim()) {
      const term = `%${filters.query.trim()}%`;
      conditions.push(ilike(schema.paymentRequests.description, term));
    }
    const where = and(...conditions);
    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(schema.paymentRequests)
        .where(where)
        .orderBy(desc(schema.paymentRequests.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db
        .select({ value: count() })
        .from(schema.paymentRequests)
        .where(where),
    ]);
    const totalItems = totals[0]?.value ?? 0;
    return {
      items: rows.map((row) => this.paymentRequestResponse(row)),
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    };
  }

  async getSummary(userId: string, period: string): Promise<MerchantSummary> {
    if (period !== '30d')
      throw new BadRequestException('Only period=30d is supported');
    const merchant = await this.requireMerchant(userId);
    const now = new Date();
    const thirtyOneDaysAgo = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);

    const [
      transactions,
      balanceRows,
      pendingRows,
      captureExceptionRows,
      openProblemRows,
      latestTransactionRows,
    ] = await Promise.all([
      this.db
        .select()
        .from(schema.merchantTransactions)
        .where(
          and(
            eq(schema.merchantTransactions.merchantId, merchant.merchantId),
            eq(schema.merchantTransactions.status, 'finalized'),
            gte(schema.merchantTransactions.occurredAt, thirtyOneDaysAgo),
          ),
        )
        .orderBy(schema.merchantTransactions.occurredAt),
      this.db
        .select({ available: schema.balances.available })
        .from(schema.balances)
        .where(
          and(
            eq(schema.balances.walletId, merchant.receivingWalletId),
            eq(schema.balances.currency, 'USDC'),
          ),
        )
        .limit(1),
      this.db
        .select({ value: count() })
        .from(schema.paymentRequests)
        .where(
          and(
            eq(schema.paymentRequests.merchantId, merchant.merchantId),
            or(
              eq(schema.paymentRequests.status, 'pending'),
              eq(schema.paymentRequests.status, 'processing'),
            ),
          ),
        ),
      this.db
        .select({
          reasonCode: schema.merchantCaptureExceptions.reasonCode,
          createdAt: schema.merchantCaptureExceptions.createdAt,
        })
        .from(schema.merchantCaptureExceptions)
        .where(
          and(
            eq(
              schema.merchantCaptureExceptions.merchantId,
              merchant.merchantId,
            ),
            gte(schema.merchantCaptureExceptions.createdAt, thirtyOneDaysAgo),
          ),
        ),
      this.db
        .select({
          id: schema.merchantCaptureExceptions.id,
          reasonCode: schema.merchantCaptureExceptions.reasonCode,
          severity: schema.merchantCaptureExceptions.severity,
          createdAt: schema.merchantCaptureExceptions.createdAt,
        })
        .from(schema.merchantCaptureExceptions)
        .where(
          and(
            eq(
              schema.merchantCaptureExceptions.merchantId,
              merchant.merchantId,
            ),
            eq(schema.merchantCaptureExceptions.status, 'open'),
          ),
        )
        .orderBy(desc(schema.merchantCaptureExceptions.createdAt)),
      this.db
        .select({ occurredAt: schema.merchantTransactions.occurredAt })
        .from(schema.merchantTransactions)
        .where(
          and(
            eq(schema.merchantTransactions.merchantId, merchant.merchantId),
            eq(schema.merchantTransactions.status, 'finalized'),
          ),
        )
        .orderBy(desc(schema.merchantTransactions.occurredAt))
        .limit(1),
    ]);

    const currentRate = this.rates.getAll().USD_TO_EUR;
    const rateScaled = decimalRateToScaled(currentRate.rate);
    const availableMinor = usdcBaseUnitsToEuroMinor(
      balanceRows[0]?.available ?? 0n,
      rateScaled,
    );
    const activity = buildMerchantActivitySummary({
      now,
      timeZone: merchant.timezone,
      transactions,
      exceptions: captureExceptionRows,
    });
    const money = (
      minor: bigint,
      estimated = false,
      rateTimestamp: string | null = null,
    ) => ({
      minor: minor.toString(),
      currency: 'EUR' as const,
      estimated,
      rateTimestamp,
    });

    return {
      availableValue: money(availableMinor, true, currentRate.updatedAt),
      receivedToday: money(activity.receivedTodayMinor),
      received30Days: money(activity.received30DaysMinor),
      paymentCount30Days: activity.paymentCount30Days,
      averageSale: money(activity.averageSaleMinor),
      dailyTrend: activity.dailyTrend,
      hourlyRhythm: activity.hourlyRhythm,
      captureQualityPercent: activity.captureQualityPercent,
      lastCapturedAt:
        latestTransactionRows[0]?.occurredAt.toISOString() ?? null,
      pendingRequestCount: pendingRows[0]?.value ?? 0,
      problemCount: openProblemRows.length,
      problems: openProblemRows.slice(0, 3).map(toMerchantProblem),
      lastUpdatedAt: now.toISOString(),
    };
  }

  async listTransactions(
    userId: string,
    filters: ListMerchantTransactionsDto,
  ): Promise<MerchantTransactionPage> {
    const merchant = await this.requireMerchant(userId);
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const conditions = [
      eq(schema.merchantTransactions.merchantId, merchant.merchantId),
      eq(schema.merchantTransactions.status, 'finalized'),
    ];
    if (filters.query?.trim()) {
      const term = `%${filters.query.trim()}%`;
      conditions.push(
        or(
          ilike(schema.merchantTransactions.description, term),
          ilike(schema.merchantTransactions.receiptNumber, term),
        )!,
      );
    }

    const where = and(...conditions);
    const [rows, totalRows] = await Promise.all([
      this.db
        .select()
        .from(schema.merchantTransactions)
        .where(where)
        .orderBy(desc(schema.merchantTransactions.occurredAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db
        .select({ value: count() })
        .from(schema.merchantTransactions)
        .where(where),
    ]);
    const totalItems = totalRows[0]?.value ?? 0;

    const [stockByRequest, reconciliationByTransaction, hasSourceRecords] =
      await Promise.all([
        this.stockImpactFor(rows.map((row) => row.paymentRequestId)),
        this.reconciliationFor(rows.map((row) => row.id)),
        this.hasSettlementImports(merchant.merchantId),
      ]);

    return {
      items: rows.map((row) => {
        const stock = stockByRequest.get(row.paymentRequestId);
        const matched = reconciliationByTransaction.get(row.id) ?? null;
        return {
          id: row.id,
          receiptNumber: row.receiptNumber,
          amount: {
            minor: row.displayAmountMinor.toString(),
            currency: 'EUR' as const,
            estimated: false,
            rateTimestamp: null,
          },
          description: row.description,
          status: 'received' as const,
          receivedAt: row.occurredAt.toISOString(),
          settlement: {
            amount: row.settlementAmount.toString(),
            currency: row.settlementCurrency,
            quoteRateScaled: row.quoteRateScaled.toString(),
          },
          fees: {
            // No merchant fee is charged in this release, and the network fee
            // was paid by the treasury. Both are stated rather than omitted:
            // a missing field reads as unknown, and this is known.
            merchantFeeMinor: '0',
            networkFeePaidBy: 'treasury' as const,
            note: 'No merchant fee was charged. The network fee was paid by MCBuse, not deducted from this sale.',
          },
          netAmount: {
            minor: row.displayAmountMinor.toString(),
            currency: 'EUR' as const,
            estimated: false,
            rateTimestamp: null,
          },
          stockImpact: {
            unitsSold: stock?.units ?? null,
            lines: stock?.lines ?? 0,
            note: stock
              ? null
              : 'This sale had no product lines, so it moved no stock.',
          },
          reconciliation: matched
            ? {
                state: 'matched' as const,
                reference: matched,
                note: 'An imported settlement record references this sale.',
              }
            : hasSourceRecords
              ? {
                  state: 'unmatched' as const,
                  reference: null,
                  note: 'No imported settlement record references this sale yet.',
                }
              : {
                  state: 'no_source_records' as const,
                  reference: null,
                  note: 'No settlement records have been imported, so there is nothing to reconcile against.',
                },
          environment:
            row.evidenceEnvironment as MerchantTransaction['environment'],
        };
      }),
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    };
  }

  /** Units and line counts per payment request, for the sales in one page. */
  private async stockImpactFor(paymentRequestIds: string[]) {
    const impact = new Map<string, { units: number; lines: number }>();
    if (!paymentRequestIds.length) return impact;

    const lines = await this.db
      .select({
        paymentRequestId: schema.merchantInvoiceItems.paymentRequestId,
        quantity: schema.merchantInvoiceItems.quantity,
        productId: schema.merchantInvoiceItems.productId,
      })
      .from(schema.merchantInvoiceItems)
      .where(
        inArray(schema.merchantInvoiceItems.paymentRequestId, paymentRequestIds),
      );

    for (const line of lines) {
      const entry = impact.get(line.paymentRequestId) ?? { units: 0, lines: 0 };
      entry.lines += 1;
      // Only product lines move stock; a custom line is just money.
      if (line.productId) entry.units += line.quantity;
      impact.set(line.paymentRequestId, entry);
    }
    return impact;
  }

  /** The imported settlement reference matching each sale, where one exists. */
  private async reconciliationFor(transactionIds: string[]) {
    const matched = new Map<string, string>();
    if (!transactionIds.length) return matched;

    const allocations = await this.db
      .select({
        merchantTransactionId:
          schema.merchantPayoutAllocations.merchantTransactionId,
        paymentReference: schema.merchantPayoutAllocations.paymentReference,
      })
      .from(schema.merchantPayoutAllocations)
      .where(
        inArray(
          schema.merchantPayoutAllocations.merchantTransactionId,
          transactionIds,
        ),
      );

    for (const allocation of allocations) {
      if (allocation.merchantTransactionId)
        matched.set(
          allocation.merchantTransactionId,
          allocation.paymentReference,
        );
    }
    return matched;
  }

  /**
   * Whether anything has been imported to reconcile against.
   *
   * Without this, every sale would be reported as "unmatched", which reads as
   * a problem when it is simply that no settlement file has been uploaded.
   */
  private async hasSettlementImports(merchantId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: schema.merchantPayouts.id })
      .from(schema.merchantPayouts)
      .where(eq(schema.merchantPayouts.merchantId, merchantId))
      .limit(1);
    return Boolean(row);
  }

  async getConsent(userId: string): Promise<MerchantConsent> {
    const merchant = await this.requireMerchant(userId);
    const row = await this.latestConsent(merchant.merchantId);
    return {
      active: row?.action === 'granted',
      purpose: CONSENT_PURPOSE,
      version: CONSENT_VERSION,
      recordedAt: row?.recordedAt.toISOString() ?? null,
    };
  }

  async updateConsent(
    userId: string,
    active: boolean,
  ): Promise<MerchantConsent> {
    const merchant = await this.requireMerchant(userId);
    const rows = await this.db
      .insert(schema.merchantConsentRecords)
      .values({
        merchantId: merchant.merchantId,
        actorUserId: userId,
        purpose: CONSENT_PURPOSE,
        version: CONSENT_VERSION,
        action: active ? 'granted' : 'revoked',
      })
      .returning({ recordedAt: schema.merchantConsentRecords.recordedAt });
    return {
      active,
      purpose: CONSENT_PURPOSE,
      version: CONSENT_VERSION,
      recordedAt: rows[0].recordedAt.toISOString(),
    };
  }

  async getReadiness(userId: string) {
    const merchant = await this.requireMerchant(userId);
    const [transactions, attempts, exceptions, consent] = await Promise.all([
      this.db
        .select({ occurredAt: schema.merchantTransactions.occurredAt })
        .from(schema.merchantTransactions)
        .where(
          and(
            eq(schema.merchantTransactions.merchantId, merchant.merchantId),
            eq(schema.merchantTransactions.status, 'finalized'),
          ),
        )
        .orderBy(schema.merchantTransactions.occurredAt),
      this.db
        .select({ status: schema.merchantPaymentAttempts.status })
        .from(schema.merchantPaymentAttempts)
        .innerJoin(
          schema.paymentRequests,
          eq(
            schema.paymentRequests.id,
            schema.merchantPaymentAttempts.paymentRequestId,
          ),
        )
        .where(eq(schema.paymentRequests.merchantId, merchant.merchantId)),
      this.db
        .select({
          reasonCode: schema.merchantCaptureExceptions.reasonCode,
          severity: schema.merchantCaptureExceptions.severity,
          status: schema.merchantCaptureExceptions.status,
        })
        .from(schema.merchantCaptureExceptions)
        .where(
          eq(schema.merchantCaptureExceptions.merchantId, merchant.merchantId),
        ),
      this.latestConsent(merchant.merchantId),
    ]);

    const activeDays = new Set(
      transactions.map((transaction) =>
        merchantLocalDateKey(transaction.occurredAt, merchant.timezone),
      ),
    ).size;
    const observedDays = transactions[0]
      ? merchantCalendarDaySpan(
          transactions[0].occurredAt,
          new Date(),
          merchant.timezone,
        )
      : 0;
    const finalizedAttempts = attempts.filter(
      (attempt) => attempt.status === 'finalized',
    ).length;
    return calculateMerchantReadiness({
      observedDays,
      activeDays,
      finalizedPayments: transactions.length,
      captureQualityPercent: calculateCaptureQualityPercent(
        transactions.length,
        exceptions.map((exception) => exception.reasonCode),
      ),
      finalityPercent: attempts.length
        ? Math.round((finalizedAttempts / attempts.length) * 10_000) / 100
        : 0,
      activeConsent: consent?.action === 'granted',
      unresolvedCriticalException: exceptions.some(
        (exception) =>
          exception.severity === 'critical' && exception.status === 'open',
      ),
    });
  }

  async requireMerchant(userId: string): Promise<MerchantContext> {
    this.assertEnabled();
    const rows = await this.db
      .select({
        merchantId: schema.merchants.id,
        publicId: schema.merchants.publicId,
        businessName: schema.merchants.businessName,
        timezone: schema.merchants.timezone,
        displayCurrency: schema.merchants.displayCurrency,
        receivingWalletId: schema.merchants.receivingWalletId,
        role: schema.merchantMemberships.role,
      })
      .from(schema.merchantMemberships)
      .innerJoin(
        schema.merchants,
        eq(schema.merchants.id, schema.merchantMemberships.merchantId),
      )
      .where(
        and(
          eq(schema.merchantMemberships.userId, userId),
          eq(schema.merchantMemberships.role, 'owner'),
          eq(schema.merchants.isActive, true),
        ),
      )
      .limit(1);
    if (!rows[0])
      throw new ForbiddenException('Merchant access is not provisioned');
    return rows[0];
  }

  assertEnabled() {
    const configured = this.config.get<string>('MERCHANT_PORTAL_ENABLED');
    if (
      configured === 'false' ||
      (configured !== 'true' && process.env.NODE_ENV === 'production')
    ) {
      throw new NotFoundException();
    }
  }

  private async latestConsent(merchantId: string) {
    const rows = await this.db
      .select()
      .from(schema.merchantConsentRecords)
      .where(
        and(
          eq(schema.merchantConsentRecords.merchantId, merchantId),
          eq(schema.merchantConsentRecords.purpose, CONSENT_PURPOSE),
        ),
      )
      .orderBy(desc(schema.merchantConsentRecords.recordedAt))
      .limit(1);
    return rows[0] ?? null;
  }

  private paymentRequestResponse(
    row: typeof schema.paymentRequests.$inferSelect,
  ): MerchantPaymentRequest {
    if (
      !row.displayAmountMinor ||
      row.displayCurrency !== 'EUR' ||
      !row.expiresAt
    ) {
      throw new NotFoundException('Merchant payment request not found');
    }
    const params = new URLSearchParams({ nonce: row.nonce, v: QR_VERSION });
    if (row.amount) params.set('amount', row.amount.toString());
    if (row.currency) params.set('currency', row.currency);
    return {
      id: row.id,
      amount: {
        minor: row.displayAmountMinor.toString(),
        currency: 'EUR',
        estimated: false,
        rateTimestamp: row.quotedAt?.toISOString() ?? null,
      },
      description: row.description,
      status: row.status as MerchantPaymentRequest['status'],
      expiresAt: row.expiresAt.toISOString(),
      qrPayload: `${QR_SCHEME}?${params.toString()}`,
      completedAt: row.completedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  static receiptNumber() {
    return `MCB-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  }
}
