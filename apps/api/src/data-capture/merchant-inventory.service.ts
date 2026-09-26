import { STOCK_MOVEMENTS } from './stock-movements';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type {
  MerchantInvoice,
  MerchantInvoiceLine,
  MerchantInvoicePage,
  MerchantProduct,
  MerchantProductPage,
} from '@repo/shared';
import { randomUUID } from 'crypto';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { RatesService } from '../rates/rates.service';
import {
  decimalRateToScaled,
  euroMinorToUsdcBaseUnits,
} from './merchant-money';
import { MerchantImageService } from './merchant-image.service';
import { MerchantService } from './merchant.service';
import { AdjustMerchantProductStockDto } from './dto/adjust-merchant-product-stock.dto';
import { CreateMerchantInvoiceDto } from './dto/create-merchant-invoice.dto';
import { CreateMerchantProductDto } from './dto/create-merchant-product.dto';
import { ListMerchantInvoicesDto } from './dto/list-merchant-invoices.dto';
import { ListMerchantProductsDto } from './dto/list-merchant-products.dto';
import { UpdateMerchantProductDto } from './dto/update-merchant-product.dto';
import { AnalyticsWorkQueueService } from '../analytics-intelligence/analytics-work-queue.service';

const QR_SCHEME = 'mcbuse://pay';
const QR_VERSION = '1';
const MAX_AMOUNT_MINOR = 999_999_999n;
type Transaction = Parameters<
  Parameters<NodePgDatabase<typeof schema>['transaction']>[0]
>[0];
type InvoiceLineDraft = Omit<
  typeof schema.merchantInvoiceItems.$inferInsert,
  'paymentRequestId'
>;

@Injectable()
export class MerchantInventoryService implements OnModuleInit, OnModuleDestroy {
  private expiryInterval?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly merchants: MerchantService,
    private readonly rates: RatesService,
    private readonly images: MerchantImageService,
    private readonly analyticsWork: AnalyticsWorkQueueService,
  ) {}

  onModuleInit() {
    this.expiryInterval = setInterval(
      () => void this.expireStaleInvoices(),
      60_000,
    );
  }

  onModuleDestroy() {
    if (this.expiryInterval) clearInterval(this.expiryInterval);
  }

  async listProducts(
    userId: string,
    filters: ListMerchantProductsDto,
  ): Promise<MerchantProductPage> {
    const merchant = await this.merchants.requireMerchant(userId);
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 30;
    const conditions = [
      eq(schema.merchantProducts.merchantId, merchant.merchantId),
    ];
    if (filters.status && filters.status !== 'all') {
      conditions.push(eq(schema.merchantProducts.status, filters.status));
    }
    if (filters.query?.trim()) {
      const term = `%${filters.query.trim()}%`;
      conditions.push(
        or(
          ilike(schema.merchantProducts.name, term),
          ilike(schema.merchantProducts.sku, term),
        )!,
      );
    }
    if (filters.source === 'manual' || filters.source === 'imported') {
      const imported = sql`exists (select 1 from ${schema.merchantProductSourceMappings} where ${schema.merchantProductSourceMappings.productId} = ${schema.merchantProducts.id} and ${schema.merchantProductSourceMappings.merchantId} = ${merchant.merchantId})`;
      conditions.push(filters.source === 'imported' ? imported : sql`not ${imported}`);
    }
    const where = and(...conditions);
    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(schema.merchantProducts)
        .where(where)
        // Stable order: stock changes bump updatedAt and must not move a row between pages.
        .orderBy(asc(sql`lower(${schema.merchantProducts.name})`), asc(schema.merchantProducts.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db
        .select({ value: count() })
        .from(schema.merchantProducts)
        .where(where),
    ]);
    const sourceRows = rows.length
      ? await this.db
          .select({ productId: schema.merchantProductSourceMappings.productId, sourceName: schema.merchantProductSourceMappings.sourceName })
          .from(schema.merchantProductSourceMappings)
          .where(and(
            eq(schema.merchantProductSourceMappings.merchantId, merchant.merchantId),
            inArray(schema.merchantProductSourceMappings.productId, rows.map((row) => row.id)),
          ))
      : [];
    const sources = new Map<string, string[]>();
    for (const row of sourceRows) {
      const names = sources.get(row.productId) ?? [];
      if (!names.includes(row.sourceName)) names.push(row.sourceName);
      sources.set(row.productId, names);
    }
    const totalItems = totals[0]?.value ?? 0;
    return {
      items: rows.map((row) => ({ ...this.productResponse(row), sourceNames: sources.get(row.id) ?? [] })),
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    };
  }

  async lowStockCount(userId: string): Promise<number> {
    const merchant = await this.merchants.requireMerchant(userId);
    const rows = await this.db
      .select({ value: count() })
      .from(schema.merchantProducts)
      .where(
        and(
          eq(schema.merchantProducts.merchantId, merchant.merchantId),
          eq(schema.merchantProducts.status, 'active'),
          sql`${schema.merchantProducts.onHandQuantity} - ${schema.merchantProducts.reservedQuantity} <= ${schema.merchantProducts.lowStockThreshold}`,
        ),
      );
    return rows[0]?.value ?? 0;
  }

  async createProduct(
    userId: string,
    dto: CreateMerchantProductDto,
  ): Promise<MerchantProduct> {
    const merchant = await this.merchants.requireMerchant(userId);
    try {
      const rows = await this.db.transaction(async (tx) => {
        const created = await tx
        .insert(schema.merchantProducts)
        .values({
          merchantId: merchant.merchantId,
          name: dto.name.trim(),
          category: this.normalizeOptional(dto.category),
          sku: this.normalizeOptional(dto.sku)?.toUpperCase() ?? null,
          description: this.normalizeOptional(dto.description),
          unitPriceMinor: BigInt(dto.unitPriceMinor),
          onHandQuantity: dto.quantity,
          reservedQuantity: 0,
          lowStockThreshold: dto.lowStockThreshold ?? 5,
          status: 'active',
        })
        .returning();
        await this.recordStockMovement(tx, merchant.merchantId, created[0].id, STOCK_MOVEMENTS.opening, dto.quantity, 0, 'product', created[0].id);
        return created;
      });
      return this.productResponse(rows[0]);
    } catch (error) {
      this.rethrowProductConflict(error);
    }
  }

  async updateProduct(
    userId: string,
    productId: string,
    dto: UpdateMerchantProductDto,
  ): Promise<MerchantProduct> {
    const merchant = await this.merchants.requireMerchant(userId);
    const update: Partial<typeof schema.merchantProducts.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (dto.name !== undefined) update.name = dto.name.trim();
    if (dto.category !== undefined)
      update.category = this.normalizeOptional(dto.category ?? undefined);
    if (dto.sku !== undefined)
      update.sku =
        this.normalizeOptional(dto.sku ?? undefined)?.toUpperCase() ?? null;
    if (dto.description !== undefined)
      update.description = this.normalizeOptional(dto.description ?? undefined);
    if (dto.unitPriceMinor !== undefined)
      update.unitPriceMinor = BigInt(dto.unitPriceMinor);
    if (dto.lowStockThreshold !== undefined)
      update.lowStockThreshold = dto.lowStockThreshold;
    if (dto.status !== undefined) update.status = dto.status;
    try {
      const rows = await this.db
        .update(schema.merchantProducts)
        .set(update)
        .where(
          and(
            eq(schema.merchantProducts.id, productId),
            eq(schema.merchantProducts.merchantId, merchant.merchantId),
          ),
        )
        .returning();
      if (!rows[0]) throw new NotFoundException('Product not found');
      return this.productResponse(rows[0]);
    } catch (error) {
      this.rethrowProductConflict(error);
    }
  }

  async adjustStock(
    userId: string,
    productId: string,
    dto: AdjustMerchantProductStockDto,
  ): Promise<MerchantProduct> {
    const merchant = await this.merchants.requireMerchant(userId);
    if (dto.reason === 'restock' && dto.change <= 0) throw new BadRequestException('Restocking requires a positive quantity');
    return this.db.transaction(async tx => {
    const rows = await tx
      .update(schema.merchantProducts)
      .set({
        onHandQuantity: sql`${schema.merchantProducts.onHandQuantity} + ${dto.change}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.merchantProducts.id, productId),
          eq(schema.merchantProducts.merchantId, merchant.merchantId),
          gte(
            sql`${schema.merchantProducts.onHandQuantity} + ${dto.change}`,
            schema.merchantProducts.reservedQuantity,
          ),
        ),
      )
      .returning();
    if (!rows[0]) {
      const exists = await tx
        .select({ id: schema.merchantProducts.id })
        .from(schema.merchantProducts)
        .where(
          and(
            eq(schema.merchantProducts.id, productId),
            eq(schema.merchantProducts.merchantId, merchant.merchantId),
          ),
        )
        .limit(1);
      if (!exists[0]) throw new NotFoundException('Product not found');
      throw new ConflictException(
        'Stock cannot be reduced below quantities reserved for invoices',
      );
    }
    await tx.insert(schema.merchantStockMovements).values({ merchantId: merchant.merchantId, productId, kind: dto.reason === 'restock' ? STOCK_MOVEMENTS.restock : STOCK_MOVEMENTS.adjustment, onHandChange: dto.change, reservedChange: 0, referenceType: 'product', referenceId: productId });
    return this.productResponse(rows[0]);
    });
  }

  async setProductImage(
    userId: string,
    productId: string,
    file: Express.Multer.File,
  ): Promise<MerchantProduct> {
    const merchant = await this.merchants.requireMerchant(userId);
    const current = await this.requireProduct(merchant.merchantId, productId);
    const imageObjectKey = await this.images.upload(merchant.merchantId, file);
    const rows = await this.db
      .update(schema.merchantProducts)
      .set({ imageObjectKey, updatedAt: new Date() })
      .where(eq(schema.merchantProducts.id, productId))
      .returning();
    void this.images.delete(current.imageObjectKey);
    return this.productResponse(rows[0]);
  }

  async deleteProductImage(
    userId: string,
    productId: string,
  ): Promise<MerchantProduct> {
    const merchant = await this.merchants.requireMerchant(userId);
    const current = await this.requireProduct(merchant.merchantId, productId);
    const rows = await this.db
      .update(schema.merchantProducts)
      .set({ imageObjectKey: null, updatedAt: new Date() })
      .where(eq(schema.merchantProducts.id, productId))
      .returning();
    void this.images.delete(current.imageObjectKey);
    return this.productResponse(rows[0]);
  }

  async createInvoice(
    userId: string,
    dto: CreateMerchantInvoiceDto,
  ): Promise<MerchantInvoice> {
    const merchant = await this.merchants.requireMerchant(userId);
    const expiryMs = (dto.expiresInSeconds ?? 3600) * 1000;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiryMs);
    const invoiceNumber = this.invoiceNumber();
    const response = await this.db.transaction(async (tx) => {
      const grouped = new Map<string, number>();
      for (const line of dto.lines) {
        if (line.type === 'product')
          grouped.set(
            line.productId!,
            (grouped.get(line.productId!) ?? 0) + line.quantity,
          );
      }
      const productIds = [...grouped.keys()];
      const products = productIds.length
        ? await tx
            .select()
            .from(schema.merchantProducts)
            .where(
              and(
                eq(schema.merchantProducts.merchantId, merchant.merchantId),
                inArray(schema.merchantProducts.id, productIds),
              ),
            )
        : [];
      const productById = new Map(
        products.map((product) => [product.id, product]),
      );
      if (productById.size !== productIds.length)
        throw new NotFoundException('One or more products were not found');
      let displayAmountMinor = 0n;
      const lines: InvoiceLineDraft[] = [];
      for (const input of dto.lines) {
        if (input.type === 'product') {
          const product = productById.get(input.productId!)!;
          if (product.status !== 'active')
            throw new ConflictException(
              `${product.name} is archived and cannot be invoiced`,
            );
          const lineTotal = product.unitPriceMinor * BigInt(input.quantity);
          displayAmountMinor += lineTotal;
          lines.push({
            productId: product.id,
            type: 'product',
            name: product.name,
            sku: product.sku,
            // Snapshotted, so re-categorising the product later does not
            // rewrite what this sale was.
            category: product.category,
            quantity: input.quantity,
            unitPriceMinor: product.unitPriceMinor,
            lineTotalMinor: lineTotal,
          });
        } else {
          const unitPriceMinor = BigInt(input.unitPriceMinor!);
          const lineTotal = unitPriceMinor * BigInt(input.quantity);
          displayAmountMinor += lineTotal;
          lines.push({
            productId: null,
            type: 'custom',
            name: input.name!.trim(),
            sku: null,
            category: null,
            quantity: input.quantity,
            unitPriceMinor,
            lineTotalMinor: lineTotal,
          });
        }
      }
      if (displayAmountMinor <= 0n || displayAmountMinor > MAX_AMOUNT_MINOR)
        throw new BadRequestException(
          'Invoice total is outside the supported range',
        );
      for (const [productId, quantity] of grouped) {
        const reserved = await tx
          .update(schema.merchantProducts)
          .set({
            reservedQuantity: sql`${schema.merchantProducts.reservedQuantity} + ${quantity}`,
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.merchantProducts.id, productId),
              eq(schema.merchantProducts.status, 'active'),
              gte(
                sql`${schema.merchantProducts.onHandQuantity} - ${schema.merchantProducts.reservedQuantity}`,
                quantity,
              ),
            ),
          )
          .returning({ id: schema.merchantProducts.id });
        if (reserved.length !== 1)
          throw new ConflictException(
            'A selected product no longer has enough available stock',
          );
        await this.recordStockMovement(tx, merchant.merchantId, productId, 'invoice_reservation', 0, quantity, 'invoice', null);
      }
      const rate = this.rates.getAll().USD_TO_EUR;
      const quoteRateScaled = decimalRateToScaled(rate.rate);
      const settlementAmount = euroMinorToUsdcBaseUnits(
        displayAmountMinor,
        quoteRateScaled,
      );
      const requests = await tx
        .insert(schema.paymentRequests)
        .values({
          creatorWalletId: merchant.receivingWalletId,
          merchantId: merchant.merchantId,
          invoiceNumber,
          type: 'dynamic',
          amount: settlementAmount,
          currency: 'USDC',
          description: this.normalizeOptional(dto.description),
          nonce: randomUUID(),
          status: 'pending',
          expiresAt,
          displayAmountMinor,
          displayCurrency: 'EUR',
          quoteRateScaled,
          quotedAt: new Date(rate.updatedAt),
        })
        .returning();
      const request = requests[0];
      await tx
        .insert(schema.merchantInvoiceItems)
        .values(
          lines.map((line) => ({ ...line, paymentRequestId: request.id })),
        );
      const itemRows = await tx
        .select()
        .from(schema.merchantInvoiceItems)
        .where(eq(schema.merchantInvoiceItems.paymentRequestId, request.id));
      return this.invoiceResponse(request, itemRows);
    });
    return response;
  }

  async listInvoices(
    userId: string,
    filters: ListMerchantInvoicesDto,
  ): Promise<MerchantInvoicePage> {
    const merchant = await this.merchants.requireMerchant(userId);
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const conditions = [
      eq(schema.paymentRequests.merchantId, merchant.merchantId),
      isNotNull(schema.paymentRequests.invoiceNumber),
    ];
    if (filters.status === 'open')
      conditions.push(
        inArray(schema.paymentRequests.status, ['pending', 'processing']),
      );
    else if (filters.status === 'history')
      conditions.push(
        inArray(schema.paymentRequests.status, [
          'completed',
          'expired',
          'cancelled',
          'failed',
        ]),
      );
    else if (filters.status)
      conditions.push(eq(schema.paymentRequests.status, filters.status));
    if (filters.query?.trim()) {
      const term = `%${filters.query.trim()}%`;
      conditions.push(
        or(
          ilike(schema.paymentRequests.invoiceNumber, term),
          ilike(schema.paymentRequests.description, term),
        )!,
      );
    }
    const where = and(...conditions);
    const [requests, totals] = await Promise.all([
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
    const itemRows = requests.length
      ? await this.db
          .select()
          .from(schema.merchantInvoiceItems)
          .where(
            inArray(
              schema.merchantInvoiceItems.paymentRequestId,
              requests.map((request) => request.id),
            ),
          )
      : [];
    const itemsByRequest = new Map<string, typeof itemRows>();
    for (const item of itemRows)
      itemsByRequest.set(item.paymentRequestId, [
        ...(itemsByRequest.get(item.paymentRequestId) ?? []),
        item,
      ]);
    const totalItems = totals[0]?.value ?? 0;
    return {
      items: requests.map((request) =>
        this.invoiceResponse(request, itemsByRequest.get(request.id) ?? []),
      ),
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    };
  }

  async getInvoice(
    userId: string,
    invoiceId: string,
  ): Promise<MerchantInvoice> {
    const merchant = await this.merchants.requireMerchant(userId);
    return this.loadInvoice(merchant.merchantId, invoiceId);
  }

  async cancelInvoice(
    userId: string,
    invoiceId: string,
  ): Promise<MerchantInvoice> {
    const merchant = await this.merchants.requireMerchant(userId);
    // Establish that the invoice is this merchant's before saying anything
    // about its state. Without this, another merchant's invoice answered
    // "only pending invoices can be cancelled", which is both wrong and a
    // statement about a row the caller has no business hearing about.
    await this.loadInvoice(merchant.merchantId, invoiceId);
    await this.cancelPendingInvoice(invoiceId, merchant.merchantId);
    return this.loadInvoice(merchant.merchantId, invoiceId);
  }

  /** Used by the legacy payment-request cancellation endpoint after it has checked wallet ownership. */
  async cancelInvoiceByPaymentRequestId(invoiceId: string) {
    await this.cancelPendingInvoice(invoiceId);
  }

  async expireInvoice(invoiceId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const expired = await tx
        .update(schema.paymentRequests)
        .set({ status: 'expired' })
        .where(
          and(
            eq(schema.paymentRequests.id, invoiceId),
            isNotNull(schema.paymentRequests.invoiceNumber),
            eq(schema.paymentRequests.status, 'pending'),
            lt(schema.paymentRequests.expiresAt, new Date()),
          ),
        )
        .returning({ id: schema.paymentRequests.id });
      if (!expired[0]) return false;
      await this.releaseReservedInventory(tx, invoiceId);
      return true;
    });
  }

  async expireStaleInvoices() {
    const rows = await this.db
      .select({ id: schema.paymentRequests.id })
      .from(schema.paymentRequests)
      .where(
        and(
          isNotNull(schema.paymentRequests.invoiceNumber),
          eq(schema.paymentRequests.status, 'pending'),
          lt(schema.paymentRequests.expiresAt, new Date()),
        ),
      )
      .limit(100);
    await Promise.all(rows.map((row) => this.expireInvoice(row.id)));
  }

  async releaseReservedInventory(tx: Transaction, invoiceId: string) {
    const lines = await tx
      .select({
        productId: schema.merchantInvoiceItems.productId,
        quantity: schema.merchantInvoiceItems.quantity,
      })
      .from(schema.merchantInvoiceItems)
      .where(
        and(
          eq(schema.merchantInvoiceItems.paymentRequestId, invoiceId),
          isNotNull(schema.merchantInvoiceItems.productId),
        ),
      );
    for (const line of lines) {
      const released = await tx
        .update(schema.merchantProducts)
        .set({
          reservedQuantity: sql`${schema.merchantProducts.reservedQuantity} - ${line.quantity}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.merchantProducts.id, line.productId!),
            gte(schema.merchantProducts.reservedQuantity, line.quantity),
          ),
        )
        .returning({ id: schema.merchantProducts.id, merchantId: schema.merchantProducts.merchantId });
      if (!released[0])
        throw new InternalServerErrorException(
          'Reserved stock could not be released',
        );
      await this.recordStockMovement(tx, released[0].merchantId, line.productId!, 'reservation_release', 0, -line.quantity, 'invoice', invoiceId);
    }
  }

  async settleReservedInventory(tx: Transaction, invoiceId: string) {
    const lines = await tx
      .select({
        productId: schema.merchantInvoiceItems.productId,
        quantity: schema.merchantInvoiceItems.quantity,
      })
      .from(schema.merchantInvoiceItems)
      .where(
        and(
          eq(schema.merchantInvoiceItems.paymentRequestId, invoiceId),
          isNotNull(schema.merchantInvoiceItems.productId),
        ),
      );
    for (const line of lines) {
      const settled = await tx
        .update(schema.merchantProducts)
        .set({
          onHandQuantity: sql`${schema.merchantProducts.onHandQuantity} - ${line.quantity}`,
          reservedQuantity: sql`${schema.merchantProducts.reservedQuantity} - ${line.quantity}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.merchantProducts.id, line.productId!),
            gte(schema.merchantProducts.onHandQuantity, line.quantity),
            gte(schema.merchantProducts.reservedQuantity, line.quantity),
          ),
        )
        .returning({ id: schema.merchantProducts.id, merchantId: schema.merchantProducts.merchantId });
      if (!settled[0])
        throw new InternalServerErrorException(
          'Reserved stock could not be settled',
        );
      await this.recordStockMovement(tx, settled[0].merchantId, line.productId!, 'digital_sale', -line.quantity, -line.quantity, 'invoice', invoiceId);
    }
  }

  private async loadInvoice(merchantId: string, invoiceId: string) {
    const requests = await this.db
      .select()
      .from(schema.paymentRequests)
      .where(
        and(
          eq(schema.paymentRequests.id, invoiceId),
          eq(schema.paymentRequests.merchantId, merchantId),
          isNotNull(schema.paymentRequests.invoiceNumber),
        ),
      )
      .limit(1);
    if (!requests[0]) throw new NotFoundException('Invoice not found');
    const lines = await this.db
      .select()
      .from(schema.merchantInvoiceItems)
      .where(eq(schema.merchantInvoiceItems.paymentRequestId, invoiceId));
    return this.invoiceResponse(requests[0], lines);
  }

  private async cancelPendingInvoice(invoiceId: string, merchantId?: string) {
    await this.db.transaction(async (tx) => {
      const conditions = [
        eq(schema.paymentRequests.id, invoiceId),
        isNotNull(schema.paymentRequests.invoiceNumber),
        eq(schema.paymentRequests.status, 'pending'),
      ];
      if (merchantId)
        conditions.push(eq(schema.paymentRequests.merchantId, merchantId));
      const cancelled = await tx
        .update(schema.paymentRequests)
        .set({ status: 'cancelled' })
        .where(and(...conditions))
        .returning({ id: schema.paymentRequests.id });
      if (!cancelled[0])
        throw new ConflictException('Only pending invoices can be cancelled');
      await this.releaseReservedInventory(tx, invoiceId);
    });
  }

  private async requireProduct(merchantId: string, productId: string) {
    const rows = await this.db
      .select()
      .from(schema.merchantProducts)
      .where(
        and(
          eq(schema.merchantProducts.id, productId),
          eq(schema.merchantProducts.merchantId, merchantId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Product not found');
    return rows[0];
  }

  private async recordStockMovement(tx: Transaction, merchantId: string, productId: string, kind: string, onHandChange: number, reservedChange: number, referenceType: string, referenceId: string | null) {
    await tx.insert(schema.merchantStockMovements).values({ merchantId, productId, kind, onHandChange, reservedChange, referenceType, referenceId });
  }

  private productResponse(
    row: typeof schema.merchantProducts.$inferSelect,
  ): MerchantProduct {
    const availableQuantity = row.onHandQuantity - row.reservedQuantity;
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      sku: row.sku,
      description: row.description,
      unitPrice: {
        minor: row.unitPriceMinor.toString(),
        currency: 'EUR',
        estimated: false,
        rateTimestamp: null,
      },
      onHandQuantity: row.onHandQuantity,
      reservedQuantity: row.reservedQuantity,
      availableQuantity,
      lowStockThreshold: row.lowStockThreshold,
      lowStock: availableQuantity <= row.lowStockThreshold,
      imageUrl: this.images.publicUrl(row.imageObjectKey),
      status: row.status as MerchantProduct['status'],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private invoiceResponse(
    request: typeof schema.paymentRequests.$inferSelect,
    rows: (typeof schema.merchantInvoiceItems.$inferSelect)[],
  ): MerchantInvoice {
    if (
      !request.invoiceNumber ||
      !request.displayAmountMinor ||
      !request.expiresAt
    )
      throw new InternalServerErrorException('Invoice data is incomplete');
    const params = new URLSearchParams({ nonce: request.nonce, v: QR_VERSION });
    if (request.amount) params.set('amount', request.amount.toString());
    if (request.currency) params.set('currency', request.currency);
    const money = (minor: bigint) => ({
      minor: minor.toString(),
      currency: 'EUR' as const,
      estimated: false,
      rateTimestamp: request.quotedAt?.toISOString() ?? null,
    });
    return {
      id: request.id,
      invoiceNumber: request.invoiceNumber,
      description: request.description,
      lines: rows.map(
        (row): MerchantInvoiceLine => ({
          id: row.id,
          type: row.type as 'product' | 'custom',
          productId: row.productId,
          name: row.name,
          sku: row.sku,
          quantity: row.quantity,
          unitPrice: money(row.unitPriceMinor),
          lineTotal: money(row.lineTotalMinor),
        }),
      ),
      amount: money(request.displayAmountMinor),
      status: request.status as MerchantInvoice['status'],
      expiresAt: request.expiresAt.toISOString(),
      qrPayload: `${QR_SCHEME}?${params.toString()}`,
      completedAt: request.completedAt?.toISOString() ?? null,
      createdAt: request.createdAt.toISOString(),
    };
  }

  private normalizeOptional(value?: string) {
    const trimmed = value?.trim();
    return trimmed || null;
  }

  private invoiceNumber() {
    return `INV-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`;
  }

  private rethrowProductConflict(error: unknown): never {
    if (
      error instanceof NotFoundException ||
      error instanceof ConflictException
    )
      throw error;
    if (
      typeof error === 'object' &&
      error &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    ) {
      throw new ConflictException('A product with that SKU already exists');
    }
    throw error;
  }
}
