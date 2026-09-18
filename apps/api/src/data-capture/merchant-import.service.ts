import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { MerchantService } from './merchant.service';

type ImportKind = 'inventory' | 'settlement';
type ImportedRow = Record<string, string>;
type BatchMapping = { headers: string[]; fieldMap?: Record<string, string>; applyStockSnapshot?: boolean };

@Injectable()
export class MerchantImportService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>, private readonly merchants: MerchantService) {}

  async preview(userId: string, kind: ImportKind, sourceName: string, file: Express.Multer.File, applyStockSnapshot = false) {
    if (!file || file.size === 0 || file.size > 5 * 1024 * 1024) throw new BadRequestException('Upload must be between 1 byte and 5 MB');
    if (!['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'].includes(file.mimetype)) throw new BadRequestException('Upload a CSV or XLSX file');
    if (!sourceName?.trim()) throw new BadRequestException('Source system is required');
    const merchant = await this.merchants.requireMerchant(userId); const rows = await this.parseFile(file);
    if (!rows.length || rows.length > 5000) throw new BadRequestException('Upload must contain 1 to 5,000 data rows');
    const headers = Object.keys(rows[0]); const fieldMap = this.defaultFieldMap(kind, headers); const errors = this.validateRows(kind, this.mappedRows(rows, fieldMap), applyStockSnapshot);
    const hash = createHash('sha256').update(file.buffer).digest('hex');
    const found = await this.db.select().from(schema.merchantImportBatches).where(and(eq(schema.merchantImportBatches.merchantId, merchant.merchantId), eq(schema.merchantImportBatches.kind, kind), eq(schema.merchantImportBatches.contentHash, hash))).limit(1);
    if (found[0]) { const mapping = found[0].mapping as BatchMapping; const mapped = this.mappedRows(found[0].rowsJson as ImportedRow[], mapping.fieldMap ?? this.defaultFieldMap(kind, headers)); const existingErrors = this.validateRows(kind, mapped, Boolean(mapping.applyStockSnapshot)); return { id: found[0].id, duplicate: true, headers, fieldMap: mapping.fieldMap ?? fieldMap, rowCount: rows.length, errors: existingErrors, canCommit: found[0].status === 'previewed' && existingErrors.length === 0 }; }
    const batch = (await this.db.insert(schema.merchantImportBatches).values({ merchantId: merchant.merchantId, kind, sourceName: sourceName.trim(), contentHash: hash, mapping: { headers, fieldMap, applyStockSnapshot }, rowsJson: rows, actorUserId: userId }).returning())[0];
    return { id: batch.id, duplicate: false, headers, fieldMap, rowCount: rows.length, errors, canCommit: errors.length === 0 };
  }

  async updateMapping(userId: string, id: string, fieldMap: Record<string, string>) {
    const merchant = await this.merchants.requireMerchant(userId);
    const batch = (await this.db.select().from(schema.merchantImportBatches).where(and(eq(schema.merchantImportBatches.id, id), eq(schema.merchantImportBatches.merchantId, merchant.merchantId))).limit(1))[0];
    if (!batch || batch.status !== 'previewed') throw new BadRequestException('Import preview is unavailable for mapping');
    const mapping = batch.mapping as BatchMapping; this.validateFieldMap(batch.kind as ImportKind, mapping.headers, fieldMap);
    const rows = this.mappedRows(batch.rowsJson as ImportedRow[], fieldMap); const errors = this.validateRows(batch.kind as ImportKind, rows, Boolean(mapping.applyStockSnapshot));
    await this.db.update(schema.merchantImportBatches).set({ mapping: { ...mapping, fieldMap } }).where(eq(schema.merchantImportBatches.id, id));
    return { id, duplicate: false, headers: mapping.headers, fieldMap, rowCount: rows.length, errors, canCommit: errors.length === 0 };
  }

  async listImports(userId: string) {
    const merchant = await this.merchants.requireMerchant(userId);
    const rows = await this.db.select({ id: schema.merchantImportBatches.id, kind: schema.merchantImportBatches.kind, sourceName: schema.merchantImportBatches.sourceName, status: schema.merchantImportBatches.status, committedAt: schema.merchantImportBatches.committedAt, createdAt: schema.merchantImportBatches.createdAt }).from(schema.merchantImportBatches).where(eq(schema.merchantImportBatches.merchantId, merchant.merchantId)).orderBy(desc(schema.merchantImportBatches.createdAt)).limit(100);
    return { items: rows.map((row) => ({ id: row.id, kind: row.kind, sourceName: row.sourceName, status: row.status, committedAt: row.committedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() })) };
  }

  async commit(userId: string, id: string) {
    const merchant = await this.merchants.requireMerchant(userId);
    return this.db.transaction(async (tx) => {
      const batch = (await tx.select().from(schema.merchantImportBatches).where(and(eq(schema.merchantImportBatches.id, id), eq(schema.merchantImportBatches.merchantId, merchant.merchantId))).limit(1))[0];
      if (!batch) throw new BadRequestException('Import preview not found');
      if (batch.status === 'committed') return { id: batch.id, status: batch.status, imported: 0 };
      const mapping = batch.mapping as BatchMapping; const rows = this.mappedRows(batch.rowsJson as ImportedRow[], mapping.fieldMap ?? this.defaultFieldMap(batch.kind as ImportKind, mapping.headers)); const errors = this.validateRows(batch.kind as ImportKind, rows, Boolean(mapping.applyStockSnapshot)); if (errors.length) throw new BadRequestException(errors.join('; '));
      if (batch.kind === 'inventory') await this.commitInventory(tx, merchant.merchantId, batch.sourceName, rows, Boolean(mapping.applyStockSnapshot));
      else await this.commitSettlement(tx, merchant.merchantId, batch.id, batch.sourceName, rows);
      await tx.update(schema.merchantImportBatches).set({ status: 'committed', committedAt: new Date() }).where(eq(schema.merchantImportBatches.id, id));
      await tx.insert(schema.auditLogs).values({ userId, action: `merchant.import.${batch.kind}.committed`, entityType: 'merchant_import_batch', entityId: id, metadata: JSON.stringify({ rows: rows.length }) });
      return { id, status: 'committed', imported: rows.length };
    });
  }

  async listReconciliation(userId: string) {
    const merchant = await this.merchants.requireMerchant(userId);
    const payouts = await this.db.select().from(schema.merchantPayouts).where(eq(schema.merchantPayouts.merchantId, merchant.merchantId));
    const allocations = payouts.length ? await this.db.select().from(schema.merchantPayoutAllocations).where(inArray(schema.merchantPayoutAllocations.payoutId, payouts.map((payout) => payout.id))) : [];
    const allocationsByPayout = new Map<string, typeof allocations>(); for (const allocation of allocations) allocationsByPayout.set(allocation.payoutId, [...(allocationsByPayout.get(allocation.payoutId) ?? []), allocation]);
    return { coverage: payouts.length > 0, items: payouts.map((payout) => { const payoutAllocations = allocationsByPayout.get(payout.id) ?? []; return { id: payout.id, sourceName: payout.sourceName, externalReference: payout.externalReference, currency: payout.currency, expectedAmountMinor: payout.expectedAmountMinor?.toString() ?? null, actualAmountMinor: payout.actualAmountMinor?.toString() ?? null, expectedAt: payout.expectedAt?.toISOString() ?? null, receivedAt: payout.receivedAt?.toISOString() ?? null, providerStatus: payout.providerStatus, payoutStatus: this.payoutStatus(payout), reconciliationStatus: this.reconciliationStatus(payout, payoutAllocations.some((allocation) => allocation.merchantTransactionId !== null)), allocations: payoutAllocations.map((allocation) => ({ paymentReference: allocation.paymentReference, amountMinor: allocation.amountMinor.toString(), merchantTransactionId: allocation.merchantTransactionId })) }; }) };
  }

  private async parseFile(file: Express.Multer.File): Promise<ImportedRow[]> {
    const isXlsx = file.originalname.toLowerCase().endsWith('.xlsx');
    if (!isXlsx) { const rows = parse(file.buffer, { columns: true, skip_empty_lines: true, bom: true, trim: true }) as ImportedRow[]; return rows.map((row) => this.normaliseRow(row)); }
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(file.buffer as any); if (workbook.worksheets.length !== 1) throw new BadRequestException('XLSX upload must have one worksheet'); const sheet = workbook.worksheets[0];
    const header = Array.from({ length: sheet.columnCount }, (_, index) => String(sheet.getRow(1).getCell(index + 1).text ?? '').trim());
    const output: ImportedRow[] = [];
    for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex++) { const row = sheet.getRow(rowIndex); if (header.every((_, index) => !row.getCell(index + 1).text)) continue; const result: ImportedRow = {}; header.forEach((key, index) => { const cell = row.getCell(index + 1); if (cell.type === ExcelJS.ValueType.Formula) throw new BadRequestException(`Formula cells are not allowed (${key})`); result[key] = String(cell.text ?? '').trim(); }); output.push(this.normaliseRow(result)); }
    return output;
  }
  private normaliseRow(row: ImportedRow) { return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase().replace(/[\s-]+/g, '_'), String(value).trim()])); }
  private fields(kind: ImportKind) { return kind === 'inventory' ? ['name', 'external_id', 'sku', 'unit_price_minor', 'stock_on_hand', 'description', 'low_stock_threshold', 'snapshot_at'] : ['external_reference', 'currency', 'expected_amount_minor', 'actual_amount_minor', 'expected_at', 'received_at', 'provider_status', 'payment_reference', 'allocation_amount_minor']; }
  private defaultFieldMap(kind: ImportKind, headers: string[]) { return Object.fromEntries(this.fields(kind).filter((field) => headers.includes(field)).map((field) => [field, field])); }
  private validateFieldMap(kind: ImportKind, headers: string[], fieldMap: Record<string, string>) { for (const [field, header] of Object.entries(fieldMap)) { if (!this.fields(kind).includes(field)) throw new BadRequestException(`Unsupported mapped field: ${field}`); if (!headers.includes(header)) throw new BadRequestException(`Mapped column is not present in the uploaded file: ${header}`); } }
  private mappedRows(rows: ImportedRow[], fieldMap: Record<string, string>) { return rows.map((row) => Object.fromEntries(Object.entries(fieldMap).map(([field, header]) => [field, row[header] ?? '']))); }
  private validateRows(kind: ImportKind, rows: ImportedRow[], enforceStockSnapshot = false) { const required = kind === 'inventory' ? ['name', 'unit_price_minor'] : ['external_reference', 'currency']; const errors = rows.flatMap((row, index) => required.filter((field) => !row[field]).map((field) => `Row ${index + 2}: ${field} is required`)); rows.forEach((row, index) => { if (kind === 'inventory') { if (!row.external_id && !row.sku) errors.push(`Row ${index + 2}: external_id or sku is required`); if (!/^[1-9]\d*$/.test(row.unit_price_minor ?? '')) errors.push(`Row ${index + 2}: unit_price_minor must be a positive integer`); if (enforceStockSnapshot && row.stock_on_hand !== undefined && row.stock_on_hand !== '' && (!/^\d+$/.test(row.stock_on_hand) || !row.snapshot_at)) errors.push(`Row ${index + 2}: stock_on_hand requires a snapshot_at timestamp`); } }); return errors.slice(0, 100); }
  private async commitInventory(tx: any, merchantId: string, sourceName: string, rows: ImportedRow[], applyStockSnapshot: boolean) {
    for (const row of rows) { const externalId = row.external_id || row.sku; if (!externalId) throw new BadRequestException('Inventory import requires external_id or sku'); const mappings = await tx.select().from(schema.merchantProductSourceMappings).where(and(eq(schema.merchantProductSourceMappings.merchantId, merchantId), eq(schema.merchantProductSourceMappings.sourceName, sourceName), eq(schema.merchantProductSourceMappings.externalId, externalId))).limit(1); let productId = mappings[0]?.productId;
      if (!productId && row.sku) { const products = await tx.select().from(schema.merchantProducts).where(and(eq(schema.merchantProducts.merchantId, merchantId), eq(schema.merchantProducts.sku, row.sku.toUpperCase()))).limit(1); productId = products[0]?.id; }
      const price = BigInt(row.unit_price_minor); const hasStockSnapshot = applyStockSnapshot && row.stock_on_hand !== undefined && row.stock_on_hand !== ''; const snapshotAt = row.snapshot_at ? new Date(row.snapshot_at) : null; if (snapshotAt && Number.isNaN(snapshotAt.getTime())) throw new BadRequestException('Inventory snapshot_at must be a valid timestamp'); if (productId) { const current = (await tx.select().from(schema.merchantProducts).where(eq(schema.merchantProducts.id, productId)).limit(1))[0]; if (hasStockSnapshot && snapshotAt && mappings[0]?.lastSnapshotAt && mappings[0].lastSnapshotAt >= snapshotAt) throw new ConflictException('Inventory snapshot is older than the last committed source snapshot'); if (hasStockSnapshot && snapshotAt) { const localMovement = (await tx.select({ id: schema.merchantStockMovements.id }).from(schema.merchantStockMovements).where(and(eq(schema.merchantStockMovements.productId, productId), gte(schema.merchantStockMovements.occurredAt, snapshotAt))).limit(1))[0]; if (localMovement) throw new ConflictException('Inventory snapshot is stale because local stock changed after its source timestamp'); } const stockUpdate = hasStockSnapshot ? { onHandQuantity: Number(row.stock_on_hand) } : {}; if (hasStockSnapshot && Number(row.stock_on_hand) < current.reservedQuantity) throw new ConflictException('Imported stock cannot be below quantities reserved for invoices'); await tx.update(schema.merchantProducts).set({ name: row.name, description: row.description || null, unitPriceMinor: price, ...stockUpdate, updatedAt: new Date() }).where(eq(schema.merchantProducts.id, productId)); if (hasStockSnapshot) await tx.insert(schema.merchantStockMovements).values({ merchantId, productId, kind: 'import_snapshot', onHandChange: Number(row.stock_on_hand) - current.onHandQuantity, reservedChange: 0, referenceType: 'import_batch', referenceId: null, occurredAt: snapshotAt ?? new Date(), metadata: { sourceName } }); } else { const created = (await tx.insert(schema.merchantProducts).values({ merchantId, name: row.name, sku: row.sku?.toUpperCase() || null, description: row.description || null, unitPriceMinor: price, onHandQuantity: hasStockSnapshot ? Number(row.stock_on_hand) : 0, reservedQuantity: 0, lowStockThreshold: Number(row.low_stock_threshold || 5), status: 'active' }).returning())[0]; productId = created.id; await tx.insert(schema.merchantStockMovements).values({ merchantId, productId, kind: 'opening_balance', onHandChange: hasStockSnapshot ? Number(row.stock_on_hand) : 0, reservedChange: 0, referenceType: 'import_batch', referenceId: null, occurredAt: snapshotAt ?? new Date(), metadata: { sourceName } }); }
      if (!mappings[0]) await tx.insert(schema.merchantProductSourceMappings).values({ merchantId, productId, sourceName, externalId, lastSnapshotAt: hasStockSnapshot ? snapshotAt : null }); else if (hasStockSnapshot && snapshotAt) await tx.update(schema.merchantProductSourceMappings).set({ lastSnapshotAt: snapshotAt }).where(eq(schema.merchantProductSourceMappings.id, mappings[0].id));
    }
  }
  private async commitSettlement(tx: any, merchantId: string, batchId: string, sourceName: string, rows: ImportedRow[]) { for (const row of rows) { const expected = row.expected_amount_minor ? BigInt(row.expected_amount_minor) : null; const actual = row.actual_amount_minor ? BigInt(row.actual_amount_minor) : null; const payout = (await tx.insert(schema.merchantPayouts).values({ merchantId, sourceName, externalReference: row.external_reference, currency: row.currency, expectedAmountMinor: expected, actualAmountMinor: actual, expectedAt: row.expected_at ? new Date(row.expected_at) : null, receivedAt: row.received_at ? new Date(row.received_at) : null, providerStatus: row.provider_status || 'expected', importBatchId: batchId }).onConflictDoNothing().returning())[0]; if (payout && row.payment_reference && row.allocation_amount_minor) { const transactions = await tx.select({ id: schema.merchantTransactions.id }).from(schema.merchantTransactions).where(and(eq(schema.merchantTransactions.merchantId, merchantId), eq(schema.merchantTransactions.receiptNumber, row.payment_reference))).limit(1); await tx.insert(schema.merchantPayoutAllocations).values({ payoutId: payout.id, merchantTransactionId: transactions[0]?.id ?? null, paymentReference: row.payment_reference, amountMinor: BigInt(row.allocation_amount_minor) }); } } }
  private payoutStatus(row: typeof schema.merchantPayouts.$inferSelect): 'expected' | 'processing' | 'settled' | 'delayed' | 'missing' { if (row.providerStatus === 'missing') return 'missing'; if (row.providerStatus === 'processing') return 'processing'; if (row.actualAmountMinor !== null) return 'settled'; if (row.expectedAt && row.expectedAt < new Date()) return 'delayed'; return 'expected'; }
  private reconciliationStatus(row: typeof schema.merchantPayouts.$inferSelect, hasUsableAllocation: boolean): 'matched' | 'difference' | 'unmatched' { if (!hasUsableAllocation || row.expectedAmountMinor === null || row.actualAmountMinor === null) return 'unmatched'; return row.expectedAmountMinor === row.actualAmountMinor ? 'matched' : 'difference'; }
}
