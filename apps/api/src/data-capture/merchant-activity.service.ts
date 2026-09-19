import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { MerchantActivityPage, MerchantAnalytics } from '@repo/shared';
import { and, desc, eq, gte, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { MerchantService } from './merchant.service';
import { merchantLocalDateKey } from './merchant-summary';
import { CreateMerchantCashSaleDto } from './dto/create-merchant-cash-sale.dto';

type CashLine = CreateMerchantCashSaleDto['lines'][number];
type MerchantActivitySource = 'mcbuse_payment' | 'merchant_cash';
type MerchantEvidenceEnvironment = 'live' | 'test' | 'synthetic' | 'unknown';
type ActivityFilters = { source?: MerchantActivitySource; environment?: MerchantEvidenceEnvironment };

@Injectable()
export class MerchantActivityService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>, private readonly merchants: MerchantService) { }

  async listActivity(userId: string, page = 1, pageSize = 20, filters: ActivityFilters = {}): Promise<MerchantActivityPage> {
    const merchant = await this.merchants.requireMerchant(userId);
    const [digital, cash] = await Promise.all([
      this.db.select({ id: schema.merchantTransactions.id, receiptNumber: schema.merchantTransactions.receiptNumber, amount: schema.merchantTransactions.displayAmountMinor, description: schema.merchantTransactions.description, occurredAt: schema.merchantTransactions.occurredAt, evidenceEnvironment: schema.merchantTransactions.evidenceEnvironment }).from(schema.merchantTransactions).where(and(eq(schema.merchantTransactions.merchantId, merchant.merchantId), eq(schema.merchantTransactions.status, 'finalized'))),
      this.db.select({ id: schema.merchantCashSales.id, receiptNumber: schema.merchantCashSales.receiptNumber, amount: schema.merchantCashSales.amountMinor, description: schema.merchantCashSales.description, occurredAt: schema.merchantCashSales.occurredAt, status: schema.merchantCashSales.status }).from(schema.merchantCashSales).where(eq(schema.merchantCashSales.merchantId, merchant.merchantId)),
    ]);
    const records = [
      ...digital.map((item) => ({ ...item, source: 'mcbuse_payment' as const, verification: 'internally_confirmed' as const, environment: item.evidenceEnvironment as 'live' | 'test' | 'synthetic' | 'unknown', status: 'recorded' as const })),
      ...cash.map((item) => ({ ...item, source: 'merchant_cash' as const, verification: 'merchant_declared' as const, environment: 'unknown' as const })),
    ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    const filtered = records.filter((item) => (!filters.source || item.source === filters.source) && (!filters.environment || item.environment === filters.environment)); const start = (page - 1) * pageSize;
    return { items: filtered.slice(start, start + pageSize).map((item) => ({ id: item.id, receiptNumber: item.receiptNumber, source: item.source, verification: item.verification, environment: item.environment, amount: { minor: item.amount.toString(), currency: 'EUR', estimated: false, rateTimestamp: null }, description: item.description, status: item.status as 'recorded' | 'voided', occurredAt: item.occurredAt.toISOString() })), page, pageSize, totalItems: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)) };
  }

  async createCashSale(userId: string, dto: CreateMerchantCashSaleDto, idempotencyKey: string) {
    if (!idempotencyKey) throw new BadRequestException('Idempotency-Key is required');
    const occurredAt = new Date(dto.occurredAt);
    if (Number.isNaN(occurredAt.getTime()) || occurredAt > new Date()) throw new BadRequestException('Cash sale time must be in the past');
    const inputFingerprint = this.cashSaleFingerprint(dto, occurredAt);
    const merchant = await this.merchants.requireMerchant(userId);
    return this.db.transaction(async (tx) => {
      const existing = await tx.select().from(schema.merchantCashSales).where(and(eq(schema.merchantCashSales.merchantId, merchant.merchantId), eq(schema.merchantCashSales.idempotencyKey, idempotencyKey))).limit(1);
      if (existing[0]) {
        if (existing[0].inputFingerprint === inputFingerprint) return this.cashSaleResponse(existing[0]);
        throw new ConflictException('This Idempotency-Key was already used with different cash-sale input');
      }
      const resolved = await Promise.all(dto.lines.map((line) => this.resolveCashLine(tx, merchant.merchantId, line)));
      const total = resolved.reduce((sum, line) => sum + line.lineTotalMinor, 0n);
      const sale = (await tx.insert(schema.merchantCashSales).values({ merchantId: merchant.merchantId, receiptNumber: MerchantService.receiptNumber(), amountMinor: total, description: dto.description?.trim() || null, occurredAt, stockAccountedFor: dto.stockAlreadyAccountedFor ?? false, actorUserId: userId, idempotencyKey, inputFingerprint }).returning())[0];
      await tx.insert(schema.merchantCashSaleItems).values(resolved.map((line) => ({ ...line, cashSaleId: sale.id })));
      if (!sale.stockAccountedFor) for (const line of resolved) if (line.productId) {
        const updated = await tx.update(schema.merchantProducts).set({ onHandQuantity: sql`${schema.merchantProducts.onHandQuantity} - ${line.quantity}`, updatedAt: new Date() }).where(and(eq(schema.merchantProducts.id, line.productId), eq(schema.merchantProducts.merchantId, merchant.merchantId), sql`${schema.merchantProducts.onHandQuantity} - ${schema.merchantProducts.reservedQuantity} >= ${line.quantity}`)).returning({ id: schema.merchantProducts.id });
        if (!updated[0]) throw new ConflictException('A selected product no longer has enough available stock');
        await tx.insert(schema.merchantStockMovements).values({ merchantId: merchant.merchantId, productId: line.productId, kind: 'cash_sale', onHandChange: -line.quantity, reservedChange: 0, referenceType: 'cash_sale', referenceId: sale.id, occurredAt });
      }
      await tx.insert(schema.auditLogs).values({ userId, action: 'merchant.cash_sale.recorded', entityType: 'merchant_cash_sale', entityId: sale.id, metadata: JSON.stringify({ stockAccountedFor: sale.stockAccountedFor }) });
      return this.cashSaleResponse(sale);
    });
  }

  async voidCashSale(userId: string, id: string, reason: string) {
    const merchant = await this.merchants.requireMerchant(userId);
    return this.db.transaction(async (tx) => {
      const rows = await tx.select().from(schema.merchantCashSales).where(and(eq(schema.merchantCashSales.id, id), eq(schema.merchantCashSales.merchantId, merchant.merchantId))).limit(1);
      const sale = rows[0]; if (!sale) throw new NotFoundException('Cash sale not found'); if (sale.status === 'voided') return this.cashSaleResponse(sale);
      if (!sale.stockAccountedFor) {
        const items = await tx.select().from(schema.merchantCashSaleItems).where(eq(schema.merchantCashSaleItems.cashSaleId, id));
        for (const item of items) if (item.productId) {
          await tx.update(schema.merchantProducts).set({ onHandQuantity: sql`${schema.merchantProducts.onHandQuantity} + ${item.quantity}`, updatedAt: new Date() }).where(eq(schema.merchantProducts.id, item.productId));
          await tx.insert(schema.merchantStockMovements).values({ merchantId: merchant.merchantId, productId: item.productId, kind: 'cash_sale_void', onHandChange: item.quantity, reservedChange: 0, referenceType: 'cash_sale', referenceId: sale.id });
        }
      }
      const result = (await tx.update(schema.merchantCashSales).set({ status: 'voided', voidReason: reason.trim(), voidedAt: new Date() }).where(eq(schema.merchantCashSales.id, id)).returning())[0];
      await tx.insert(schema.auditLogs).values({ userId, action: 'merchant.cash_sale.voided', entityType: 'merchant_cash_sale', entityId: id, metadata: JSON.stringify({ restoredStock: !sale.stockAccountedFor }) });
      return this.cashSaleResponse(result);
    });
  }

  async analytics(userId: string, from: Date, to: Date, filters: ActivityFilters = {}): Promise<MerchantAnalytics> {
    const merchant = await this.merchants.requireMerchant(userId);
    const duration = to.getTime() - from.getTime(); const previousFrom = new Date(from.getTime() - duration); const previousTo = new Date(from.getTime());
    const [digitalRows, cashRows, previousDigitalRows, previousCashRows, products, digitalProductLines, cashProductLines, previousDigitalProductLines, previousCashProductLines, digitalUnassignedLines, cashUnassignedLines, stockMovements, openingBalances] = await Promise.all([
      this.db.select({ amount: schema.merchantTransactions.displayAmountMinor, occurredAt: schema.merchantTransactions.occurredAt, environment: schema.merchantTransactions.evidenceEnvironment }).from(schema.merchantTransactions).where(and(eq(schema.merchantTransactions.merchantId, merchant.merchantId), eq(schema.merchantTransactions.status, 'finalized'), gte(schema.merchantTransactions.occurredAt, from), lte(schema.merchantTransactions.occurredAt, to))),
      this.db.select({ amount: schema.merchantCashSales.amountMinor, occurredAt: schema.merchantCashSales.occurredAt }).from(schema.merchantCashSales).where(and(eq(schema.merchantCashSales.merchantId, merchant.merchantId), eq(schema.merchantCashSales.status, 'recorded'), gte(schema.merchantCashSales.occurredAt, from), lte(schema.merchantCashSales.occurredAt, to))),
      this.db.select({ amount: schema.merchantTransactions.displayAmountMinor, environment: schema.merchantTransactions.evidenceEnvironment }).from(schema.merchantTransactions).where(and(eq(schema.merchantTransactions.merchantId, merchant.merchantId), eq(schema.merchantTransactions.status, 'finalized'), gte(schema.merchantTransactions.occurredAt, previousFrom), sql`${schema.merchantTransactions.occurredAt} < ${previousTo}`)),
      this.db.select({ amount: schema.merchantCashSales.amountMinor }).from(schema.merchantCashSales).where(and(eq(schema.merchantCashSales.merchantId, merchant.merchantId), eq(schema.merchantCashSales.status, 'recorded'), gte(schema.merchantCashSales.occurredAt, previousFrom), sql`${schema.merchantCashSales.occurredAt} < ${previousTo}`)),
      this.db.select({ id: schema.merchantProducts.id, name: schema.merchantProducts.name, category: schema.merchantProducts.category, unitPriceMinor: schema.merchantProducts.unitPriceMinor, onHandQuantity: schema.merchantProducts.onHandQuantity, reservedQuantity: schema.merchantProducts.reservedQuantity, lowStockThreshold: schema.merchantProducts.lowStockThreshold }).from(schema.merchantProducts).where(eq(schema.merchantProducts.merchantId, merchant.merchantId)),
      this.db.select({ productId: schema.merchantInvoiceItems.productId, name: schema.merchantInvoiceItems.name, quantity: schema.merchantInvoiceItems.quantity, total: schema.merchantInvoiceItems.lineTotalMinor, occurredAt: schema.merchantTransactions.occurredAt, environment: schema.merchantTransactions.evidenceEnvironment }).from(schema.merchantInvoiceItems).innerJoin(schema.merchantTransactions, eq(schema.merchantTransactions.paymentRequestId, schema.merchantInvoiceItems.paymentRequestId)).where(and(eq(schema.merchantTransactions.merchantId, merchant.merchantId), eq(schema.merchantTransactions.status, 'finalized'), isNotNull(schema.merchantInvoiceItems.productId), gte(schema.merchantTransactions.occurredAt, from), lte(schema.merchantTransactions.occurredAt, to))),
      this.db.select({ productId: schema.merchantCashSaleItems.productId, name: schema.merchantCashSaleItems.name, quantity: schema.merchantCashSaleItems.quantity, total: schema.merchantCashSaleItems.lineTotalMinor, occurredAt: schema.merchantCashSales.occurredAt }).from(schema.merchantCashSaleItems).innerJoin(schema.merchantCashSales, eq(schema.merchantCashSales.id, schema.merchantCashSaleItems.cashSaleId)).where(and(eq(schema.merchantCashSales.merchantId, merchant.merchantId), eq(schema.merchantCashSales.status, 'recorded'), isNotNull(schema.merchantCashSaleItems.productId), gte(schema.merchantCashSales.occurredAt, from), lte(schema.merchantCashSales.occurredAt, to))),
      this.db.select({ productId: schema.merchantInvoiceItems.productId, quantity: schema.merchantInvoiceItems.quantity, environment: schema.merchantTransactions.evidenceEnvironment }).from(schema.merchantInvoiceItems).innerJoin(schema.merchantTransactions, eq(schema.merchantTransactions.paymentRequestId, schema.merchantInvoiceItems.paymentRequestId)).where(and(eq(schema.merchantTransactions.merchantId, merchant.merchantId), eq(schema.merchantTransactions.status, 'finalized'), isNotNull(schema.merchantInvoiceItems.productId), gte(schema.merchantTransactions.occurredAt, previousFrom), sql`${schema.merchantTransactions.occurredAt} < ${previousTo}`)),
      this.db.select({ productId: schema.merchantCashSaleItems.productId, quantity: schema.merchantCashSaleItems.quantity }).from(schema.merchantCashSaleItems).innerJoin(schema.merchantCashSales, eq(schema.merchantCashSales.id, schema.merchantCashSaleItems.cashSaleId)).where(and(eq(schema.merchantCashSales.merchantId, merchant.merchantId), eq(schema.merchantCashSales.status, 'recorded'), isNotNull(schema.merchantCashSaleItems.productId), gte(schema.merchantCashSales.occurredAt, previousFrom), sql`${schema.merchantCashSales.occurredAt} < ${previousTo}`)),
      this.db.select({ name: schema.merchantInvoiceItems.name, quantity: schema.merchantInvoiceItems.quantity, total: schema.merchantInvoiceItems.lineTotalMinor, environment: schema.merchantTransactions.evidenceEnvironment }).from(schema.merchantInvoiceItems).innerJoin(schema.merchantTransactions, eq(schema.merchantTransactions.paymentRequestId, schema.merchantInvoiceItems.paymentRequestId)).where(and(eq(schema.merchantTransactions.merchantId, merchant.merchantId), eq(schema.merchantTransactions.status, 'finalized'), isNull(schema.merchantInvoiceItems.productId), gte(schema.merchantTransactions.occurredAt, from), lte(schema.merchantTransactions.occurredAt, to))),
      this.db.select({ name: schema.merchantCashSaleItems.name, quantity: schema.merchantCashSaleItems.quantity, total: schema.merchantCashSaleItems.lineTotalMinor }).from(schema.merchantCashSaleItems).innerJoin(schema.merchantCashSales, eq(schema.merchantCashSales.id, schema.merchantCashSaleItems.cashSaleId)).where(and(eq(schema.merchantCashSales.merchantId, merchant.merchantId), eq(schema.merchantCashSales.status, 'recorded'), isNull(schema.merchantCashSaleItems.productId), gte(schema.merchantCashSales.occurredAt, from), lte(schema.merchantCashSales.occurredAt, to))),
      this.db.select({ productId: schema.merchantStockMovements.productId, kind: schema.merchantStockMovements.kind, onHandChange: schema.merchantStockMovements.onHandChange, occurredAt: schema.merchantStockMovements.occurredAt }).from(schema.merchantStockMovements).where(and(eq(schema.merchantStockMovements.merchantId, merchant.merchantId), gte(schema.merchantStockMovements.occurredAt, from))),
      this.db.select({ productId: schema.merchantStockMovements.productId, occurredAt: schema.merchantStockMovements.occurredAt }).from(schema.merchantStockMovements).where(and(eq(schema.merchantStockMovements.merchantId, merchant.merchantId), eq(schema.merchantStockMovements.kind, 'opening_balance'), lte(schema.merchantStockMovements.occurredAt, from))),
    ]);
    const includesDigital = !filters.source || filters.source === 'mcbuse_payment';
    const includesCash = !filters.source || filters.source === 'merchant_cash';
    const matchesEnvironment = (environment: MerchantEvidenceEnvironment) => !filters.environment || environment === filters.environment;
    const digital = includesDigital ? digitalRows.filter((item) => matchesEnvironment(item.environment as MerchantEvidenceEnvironment)) : [];
    const cash = includesCash && matchesEnvironment('unknown') ? cashRows : [];
    const previousDigital = includesDigital ? previousDigitalRows.filter((item) => matchesEnvironment(item.environment as MerchantEvidenceEnvironment)) : [];
    const previousCash = includesCash && matchesEnvironment('unknown') ? previousCashRows : [];
    const filteredDigitalProductLines = includesDigital ? digitalProductLines.filter((item) => matchesEnvironment(item.environment as MerchantEvidenceEnvironment)) : [];
    const filteredCashProductLines = includesCash && matchesEnvironment('unknown') ? cashProductLines : [];
    const filteredPreviousDigitalProductLines = includesDigital ? previousDigitalProductLines.filter((item) => matchesEnvironment(item.environment as MerchantEvidenceEnvironment)) : [];
    const filteredPreviousCashProductLines = includesCash && matchesEnvironment('unknown') ? previousCashProductLines : [];
    const filteredDigitalUnassignedLines = includesDigital ? digitalUnassignedLines.filter((item) => matchesEnvironment(item.environment as MerchantEvidenceEnvironment)) : [];
    const filteredCashUnassignedLines = includesCash && matchesEnvironment('unknown') ? cashUnassignedLines : [];
    const firstDay = merchantLocalDateKey(from, merchant.timezone);
    const lastDay = merchantLocalDateKey(to, merchant.timezone);
    const firstDayUtc = Date.parse(`${firstDay}T00:00:00.000Z`);
    const lastDayUtc = Date.parse(`${lastDay}T00:00:00.000Z`);
    const daily = new Map<string, { amount: bigint; count: number }>();
    for (let cursor = firstDayUtc; cursor <= lastDayUtc; cursor += 86_400_000) {
      daily.set(new Date(cursor).toISOString().slice(0, 10), { amount: 0n, count: 0 });
    }
    const hours = new Map<number, { amount: bigint; count: number }>();
    for (const item of [...digital, ...cash]) { const day = merchantLocalDateKey(item.occurredAt, merchant.timezone); const bucket = daily.get(day) ?? { amount: 0n, count: 0 }; bucket.amount += item.amount; bucket.count++; daily.set(day, bucket); const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: merchant.timezone, hour: '2-digit', hourCycle: 'h23' }).format(item.occurredAt)); const h = hours.get(hour) ?? { amount: 0n, count: 0 }; h.amount += item.amount; h.count++; hours.set(hour, h); }
    const digitalTotal = digital.reduce((sum, item) => sum + item.amount, 0n); const cashTotal = cash.reduce((sum, item) => sum + item.amount, 0n); const total = digitalTotal + cashTotal; const count = digital.length + cash.length; const previousRows = [...previousDigital, ...previousCash]; const previousTotal = previousRows.reduce((sum, item) => sum + item.amount, 0n); const previousCount = previousRows.length;
    const money = (minor: bigint) => ({ minor: minor.toString(), currency: 'EUR' as const, estimated: false, rateTimestamp: null });
    const percentChange = (current: number | bigint, previous: number | bigint) => Number(previous) === 0 ? null : Math.round(((Number(current) - Number(previous)) / Number(previous)) * 10_000) / 100;
    const productById = new Map(products.map((product) => [product.id, product]));
    const productStats = new Map<string, { name: string; quantitySold: number; totalSales: bigint; digitalQuantity: number; cashQuantity: number }>(products.map((product) => [product.id, { name: product.name, quantitySold: 0, totalSales: 0n, digitalQuantity: 0, cashQuantity: 0 }]));
    for (const item of filteredDigitalProductLines) if (item.productId) { const stat = productStats.get(item.productId) ?? { name: item.name, quantitySold: 0, totalSales: 0n, digitalQuantity: 0, cashQuantity: 0 }; stat.name = item.name; stat.quantitySold += item.quantity; stat.digitalQuantity += item.quantity; stat.totalSales += item.total; productStats.set(item.productId, stat); }
    for (const item of filteredCashProductLines) if (item.productId) { const stat = productStats.get(item.productId) ?? { name: item.name, quantitySold: 0, totalSales: 0n, digitalQuantity: 0, cashQuantity: 0 }; stat.name = item.name; stat.quantitySold += item.quantity; stat.cashQuantity += item.quantity; stat.totalSales += item.total; productStats.set(item.productId, stat); }
    const previousProductQuantity = new Map<string, number>();
    for (const item of [...filteredPreviousDigitalProductLines, ...filteredPreviousCashProductLines]) if (item.productId) previousProductQuantity.set(item.productId, (previousProductQuantity.get(item.productId) ?? 0) + item.quantity);
    const movementByProduct = new Map<string, typeof stockMovements>();
    for (const movement of stockMovements) movementByProduct.set(movement.productId, [...(movementByProduct.get(movement.productId) ?? []), movement]);
    const openingProducts = new Set(openingBalances.map((item) => item.productId));
    const periodDays = Math.max(1, daily.size);
    const productPerformance = [...productStats.entries()].map(([productId, item]) => {
      const product = productById.get(productId)!;
      const previousQuantitySold = previousProductQuantity.get(productId) ?? 0;
      const movements = movementByProduct.get(productId) ?? [];
      const closingStocks = [...daily.keys()].map((day) => product.onHandQuantity - movements.filter((movement) => merchantLocalDateKey(movement.occurredAt, merchant.timezone) > day).reduce((sum, movement) => sum + movement.onHandChange, 0));
      const averageClosingStock = closingStocks.length ? closingStocks.reduce((sum, quantity) => sum + quantity, 0) / closingStocks.length : 0;
      const turnoverAvailable = openingProducts.has(productId) && averageClosingStock > 0;
      return { productId, name: item.name, category: product.category?.trim() || 'Uncategorised', quantitySold: item.quantitySold, totalSales: money(item.totalSales), digitalQuantity: item.digitalQuantity, cashQuantity: item.cashQuantity, previousQuantitySold, quantityChangePercent: percentChange(item.quantitySold, previousQuantitySold), averageDailyQuantity: item.quantitySold / periodDays, stockValueAtSellingPrice: money(BigInt(product.onHandQuantity) * product.unitPriceMinor), turnover: turnoverAvailable ? Math.round((item.quantitySold / averageClosingStock) * 100) / 100 : null, turnoverStatus: turnoverAvailable ? 'available' as const : 'insufficient_stock_history' as const };
    }).sort((left, right) => right.totalSales.minor === left.totalSales.minor ? right.quantitySold - left.quantitySold : BigInt(right.totalSales.minor) > BigInt(left.totalSales.minor) ? 1 : -1);
    const categoryStats = new Map<string, { quantitySold: number; totalSales: bigint; previousQuantitySold: number }>();
    for (const product of productPerformance) { const stat = categoryStats.get(product.category) ?? { quantitySold: 0, totalSales: 0n, previousQuantitySold: 0 }; stat.quantitySold += product.quantitySold; stat.totalSales += BigInt(product.totalSales.minor); stat.previousQuantitySold += product.previousQuantitySold; categoryStats.set(product.category, stat); }
    const categoryPerformance = [...categoryStats.entries()].map(([category, item]) => ({ category, quantitySold: item.quantitySold, totalSales: money(item.totalSales), previousQuantitySold: item.previousQuantitySold, quantityChangePercent: percentChange(item.quantitySold, item.previousQuantitySold) })).sort((left, right) => BigInt(right.totalSales.minor) > BigInt(left.totalSales.minor) ? 1 : -1);
    const unassignedStats = new Map<string, { quantitySold: number; totalSales: bigint; digitalQuantity: number; cashQuantity: number }>();
    for (const item of filteredDigitalUnassignedLines) { const stat = unassignedStats.get(item.name) ?? { quantitySold: 0, totalSales: 0n, digitalQuantity: 0, cashQuantity: 0 }; stat.quantitySold += item.quantity; stat.digitalQuantity += item.quantity; stat.totalSales += item.total; unassignedStats.set(item.name, stat); }
    for (const item of filteredCashUnassignedLines) { const stat = unassignedStats.get(item.name) ?? { quantitySold: 0, totalSales: 0n, digitalQuantity: 0, cashQuantity: 0 }; stat.quantitySold += item.quantity; stat.cashQuantity += item.quantity; stat.totalSales += item.total; unassignedStats.set(item.name, stat); }
    const unassignedItems = [...unassignedStats.entries()].map(([name, item]) => ({ name, quantitySold: item.quantitySold, totalSales: money(item.totalSales), digitalQuantity: item.digitalQuantity, cashQuantity: item.cashQuantity })).sort((left, right) => BigInt(right.totalSales.minor) > BigInt(left.totalSales.minor) ? 1 : BigInt(right.totalSales.minor) < BigInt(left.totalSales.minor) ? -1 : left.name.localeCompare(right.name));
    const comparisonPercent = previousTotal === 0n ? null : Number((total - previousTotal) * 10_000n / previousTotal) / 100;
    const average = count ? total / BigInt(count) : 0n; const previousAverage = previousCount ? previousTotal / BigInt(previousCount) : 0n;
    const stockValue = products.reduce((sum, product) => sum + BigInt(product.onHandQuantity) * product.unitPriceMinor, 0n); const availableValue = products.reduce((sum, product) => sum + BigInt(Math.max(0, product.onHandQuantity - product.reservedQuantity)) * product.unitPriceMinor, 0n); const reservedValue = products.reduce((sum, product) => sum + BigInt(product.reservedQuantity) * product.unitPriceMinor, 0n);
    const todayKey = merchantLocalDateKey(to, merchant.timezone); const todayRows = [...digital, ...cash].filter((item) => merchantLocalDateKey(item.occurredAt, merchant.timezone) === todayKey); const todayTotal = todayRows.reduce((sum, item) => sum + item.amount, 0n); const todayProducts = new Map<string, { name: string; quantitySold: number; totalSales: bigint }>(); for (const item of [...filteredDigitalProductLines, ...filteredCashProductLines].filter((line) => merchantLocalDateKey(line.occurredAt, merchant.timezone) === todayKey)) if (item.productId) { const stat = todayProducts.get(item.productId) ?? { name: item.name, quantitySold: 0, totalSales: 0n }; stat.quantitySold += item.quantity; stat.totalSales += item.total; todayProducts.set(item.productId, stat); } const topToday = [...todayProducts.entries()].sort((left, right) => right[1].totalSales > left[1].totalSales ? 1 : right[1].totalSales < left[1].totalSales ? -1 : right[1].quantitySold - left[1].quantitySold)[0]; const todayHours = new Map<number, number>(); for (const item of todayRows) { const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: merchant.timezone, hour: '2-digit', hourCycle: 'h23' }).format(item.occurredAt)); todayHours.set(hour, (todayHours.get(hour) ?? 0) + 1); } const peakToday = [...todayHours.entries()].sort((left, right) => right[1] - left[1])[0];
    return { period: { from: from.toISOString(), to: to.toISOString(), timezone: merchant.timezone, partialCurrentDay: merchantLocalDateKey(to, merchant.timezone) === merchantLocalDateKey(new Date(), merchant.timezone) }, generatedAt: new Date().toISOString(), today: { sales: money(todayTotal), saleCount: todayRows.length, averageSale: money(todayRows.length ? todayTotal / BigInt(todayRows.length) : 0n), topProduct: topToday ? { productId: topToday[0], name: topToday[1].name, quantitySold: topToday[1].quantitySold, totalSales: money(topToday[1].totalSales) } : null, peakSellingHour: peakToday ? `${String(peakToday[0]).padStart(2, '0')}:00` : null }, sourceCoverage: { mcbuse_payment: digital.length, merchant_cash: cash.length, external_import: 0 }, totalRecordedSales: money(total), saleCount: count, averageSale: money(average), comparisonPercent, comparisons: { salesPercent: comparisonPercent, transactionCountPercent: percentChange(count, previousCount), averageSalePercent: percentChange(average, previousAverage) }, digitalSales: money(digitalTotal), cashSales: money(cashTotal), dailyTrend: [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([start, item]) => ({ start, amountMinor: item.amount.toString(), paymentCount: item.count })), hourlyRhythm: Array.from({ length: 24 }, (_, hour) => { const item = hours.get(hour) ?? { amount: 0n, count: 0 }; return { start: `${String(hour).padStart(2, '0')}:00`, amountMinor: item.amount.toString(), paymentCount: item.count }; }), productPerformance, categoryPerformance, inventory: { stockValueAtSellingPrices: money(stockValue), availableValueAtSellingPrices: money(availableValue), reservedValueAtSellingPrices: money(reservedValue), lowStockProductCount: products.filter((product) => product.onHandQuantity - product.reservedQuantity <= product.lowStockThreshold).length, zeroStockProductCount: products.filter((product) => product.onHandQuantity - product.reservedQuantity <= 0).length, valuationBasis: 'current_selling_price' as const }, unassignedItems };
  }

  async productAnalytics(userId: string, productId: string, periodDays: 7 | 30) {
    const merchant = await this.merchants.requireMerchant(userId); const product = (await this.db.select().from(schema.merchantProducts).where(and(eq(schema.merchantProducts.id, productId), eq(schema.merchantProducts.merchantId, merchant.merchantId))).limit(1))[0];
    if (!product) throw new NotFoundException('Product not found'); const from = new Date(Date.now() - periodDays * 86_400_000);
    const [digital, cash, movements] = await Promise.all([
      this.db.select({ quantity: schema.merchantInvoiceItems.quantity, total: schema.merchantInvoiceItems.lineTotalMinor, occurredAt: schema.merchantTransactions.occurredAt }).from(schema.merchantInvoiceItems).innerJoin(schema.merchantTransactions, eq(schema.merchantTransactions.paymentRequestId, schema.merchantInvoiceItems.paymentRequestId)).where(and(eq(schema.merchantInvoiceItems.productId, productId), eq(schema.merchantTransactions.merchantId, merchant.merchantId), eq(schema.merchantTransactions.status, 'finalized'), gte(schema.merchantTransactions.occurredAt, from))),
      this.db.select({ quantity: schema.merchantCashSaleItems.quantity, total: schema.merchantCashSaleItems.lineTotalMinor, occurredAt: schema.merchantCashSales.occurredAt }).from(schema.merchantCashSaleItems).innerJoin(schema.merchantCashSales, eq(schema.merchantCashSales.id, schema.merchantCashSaleItems.cashSaleId)).where(and(eq(schema.merchantCashSaleItems.productId, productId), eq(schema.merchantCashSales.merchantId, merchant.merchantId), eq(schema.merchantCashSales.status, 'recorded'), gte(schema.merchantCashSales.occurredAt, from))),
      this.db.select({ kind: schema.merchantStockMovements.kind, onHandChange: schema.merchantStockMovements.onHandChange, reservedChange: schema.merchantStockMovements.reservedChange, occurredAt: schema.merchantStockMovements.occurredAt }).from(schema.merchantStockMovements).where(eq(schema.merchantStockMovements.productId, productId)).orderBy(desc(schema.merchantStockMovements.occurredAt)).limit(100),
    ]);
    const all = [...digital, ...cash]; const quantitySold = all.reduce((sum, item) => sum + item.quantity, 0); const revenue = all.reduce((sum, item) => sum + item.total, 0n); const hours = new Map<number, number>(); for (const item of all) { const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: merchant.timezone, hour: '2-digit', hourCycle: 'h23' }).format(item.occurredAt)); hours.set(hour, (hours.get(hour) ?? 0) + item.quantity); } const peak = [...hours.entries()].sort((a,b) => b[1] - a[1])[0]?.[0] ?? null;
    return { productId, periodDays, quantitySold, revenue: { minor: revenue.toString(), currency: 'EUR' as const, estimated: false, rateTimestamp: null }, digitalQuantity: digital.reduce((sum, item) => sum + item.quantity, 0), cashQuantity: cash.reduce((sum, item) => sum + item.quantity, 0), averageDailyQuantity: quantitySold / periodDays, peakSellingHour: peak, onHandQuantity: product.onHandQuantity, reservedQuantity: product.reservedQuantity, availableQuantity: product.onHandQuantity - product.reservedQuantity, lowStock: product.onHandQuantity - product.reservedQuantity <= product.lowStockThreshold, stockTrackingNote: 'Stock movement history begins with records captured after this workspace upgrade.', stockMovements: movements.map((movement) => ({ kind: movement.kind, onHandChange: movement.onHandChange, reservedChange: movement.reservedChange, occurredAt: movement.occurredAt.toISOString() })) };
  }

  private async resolveCashLine(tx: any, merchantId: string, line: CashLine) {
    if (line.type === 'custom') { const unitPriceMinor = BigInt(line.unitPriceMinor!); return { productId: null, type: 'custom', name: line.name!.trim(), sku: null, quantity: line.quantity, unitPriceMinor, lineTotalMinor: unitPriceMinor * BigInt(line.quantity) }; }
    const rows = await tx.select().from(schema.merchantProducts).where(and(eq(schema.merchantProducts.id, line.productId!), eq(schema.merchantProducts.merchantId, merchantId), eq(schema.merchantProducts.status, 'active'))).limit(1); const product = rows[0]; if (!product) throw new BadRequestException('Selected product is unavailable');
    return { productId: product.id, type: 'product', name: product.name, sku: product.sku, quantity: line.quantity, unitPriceMinor: product.unitPriceMinor, lineTotalMinor: product.unitPriceMinor * BigInt(line.quantity) };
  }
  private cashSaleFingerprint(dto: CreateMerchantCashSaleDto, occurredAt: Date) {
    const lines = dto.lines.map((line) => line.type === 'product'
      ? { type: 'product', productId: line.productId, quantity: line.quantity }
      : { type: 'custom', name: line.name?.trim(), quantity: line.quantity, unitPriceMinor: line.unitPriceMinor })
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    return createHash('sha256').update(JSON.stringify({
      occurredAt: occurredAt.toISOString(),
      description: dto.description?.trim() || null,
      stockAlreadyAccountedFor: dto.stockAlreadyAccountedFor ?? false,
      lines,
    })).digest('hex');
  }
  private cashSaleResponse(row: typeof schema.merchantCashSales.$inferSelect) { return { id: row.id, receiptNumber: row.receiptNumber, amount: { minor: row.amountMinor.toString(), currency: 'EUR' as const, estimated: false, rateTimestamp: null }, status: row.status, occurredAt: row.occurredAt.toISOString(), recordedAt: row.recordedAt.toISOString() }; }
}
