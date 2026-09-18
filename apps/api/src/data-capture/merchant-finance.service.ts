import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import PDFDocument from 'pdfkit';
import archiver = require('archiver');
import nodemailer = require('nodemailer');
import { PassThrough } from 'stream';
import { and, eq, gte, lte } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { MerchantActivityService } from './merchant-activity.service';
import { MerchantService } from './merchant.service';
import { MerchantImportService } from './merchant-import.service';

@Injectable()
export class MerchantFinanceService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly merchants: MerchantService,
    private readonly activity: MerchantActivityService,
    private readonly imports: MerchantImportService,
    private readonly config: ConfigService,
  ) {}
  async createPackage(
    userId: string,
    periodDays = 30,
    demonstrationData = false,
    idempotencyKey = '',
  ) {
    if (![7, 30, 90].includes(periodDays))
      throw new BadRequestException('Period must be 7, 30 or 90 days');
    if (!idempotencyKey)
      throw new BadRequestException('Idempotency-Key is required');
    const merchant = await this.merchants.requireMerchant(userId);
    const inputFingerprint = createHash('sha256')
      .update(JSON.stringify({ periodDays, demonstrationData }))
      .digest('hex');
    const existing = (
      await this.db
        .select()
        .from(schema.merchantFinancePackages)
        .where(
          and(
            eq(schema.merchantFinancePackages.merchantId, merchant.merchantId),
            eq(schema.merchantFinancePackages.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1)
    )[0];
    if (existing) {
      if (existing.inputFingerprint === inputFingerprint)
        return this.packageResponse(existing);
      throw new ConflictException(
        'This Idempotency-Key was already used with different package input',
      );
    }
    const to = new Date();
    const from = new Date(to.getTime() - periodDays * 86_400_000);
    const [
      analytics,
      readiness,
      reconciliation,
      products,
      activityPage,
      digitalItems,
      cashItems,
    ] = await Promise.all([
      this.activity.analytics(userId, from, to),
      this.merchants.getReadiness(userId),
      this.imports.listReconciliation(userId),
      this.db
        .select({
          id: schema.merchantProducts.id,
          name: schema.merchantProducts.name,
        })
        .from(schema.merchantProducts)
        .where(eq(schema.merchantProducts.merchantId, merchant.merchantId))
        .limit(100),
      this.activity.listActivity(userId, 1, 5000),
      this.db
        .select({
          receiptNumber: schema.merchantTransactions.receiptNumber,
          occurredAt: schema.merchantTransactions.occurredAt,
          name: schema.merchantInvoiceItems.name,
          sku: schema.merchantInvoiceItems.sku,
          quantity: schema.merchantInvoiceItems.quantity,
          unitPriceMinor: schema.merchantInvoiceItems.unitPriceMinor,
          lineTotalMinor: schema.merchantInvoiceItems.lineTotalMinor,
        })
        .from(schema.merchantInvoiceItems)
        .innerJoin(
          schema.merchantTransactions,
          eq(
            schema.merchantTransactions.paymentRequestId,
            schema.merchantInvoiceItems.paymentRequestId,
          ),
        )
        .where(
          and(
            eq(schema.merchantTransactions.merchantId, merchant.merchantId),
            eq(schema.merchantTransactions.status, 'finalized'),
            gte(schema.merchantTransactions.occurredAt, from),
            lte(schema.merchantTransactions.occurredAt, to),
          ),
        ),
      this.db
        .select({
          receiptNumber: schema.merchantCashSales.receiptNumber,
          occurredAt: schema.merchantCashSales.occurredAt,
          name: schema.merchantCashSaleItems.name,
          sku: schema.merchantCashSaleItems.sku,
          quantity: schema.merchantCashSaleItems.quantity,
          unitPriceMinor: schema.merchantCashSaleItems.unitPriceMinor,
          lineTotalMinor: schema.merchantCashSaleItems.lineTotalMinor,
        })
        .from(schema.merchantCashSaleItems)
        .innerJoin(
          schema.merchantCashSales,
          eq(
            schema.merchantCashSaleItems.cashSaleId,
            schema.merchantCashSales.id,
          ),
        )
        .where(
          and(
            eq(schema.merchantCashSales.merchantId, merchant.merchantId),
            eq(schema.merchantCashSales.status, 'recorded'),
            gte(schema.merchantCashSales.occurredAt, from),
            lte(schema.merchantCashSales.occurredAt, to),
          ),
        ),
    ]);
    const productMetrics = await Promise.all(
      products.map(async (product) => ({
        name: product.name,
        ...(await this.activity.productAnalytics(
          userId,
          product.id,
          periodDays === 7 ? 7 : 30,
        )),
      })),
    );
    const evidenceIncomplete = readiness.stage !== 'evidence_ready';
    const sales = activityPage.items.filter((item) => {
      const occurredAt = new Date(item.occurredAt);
      return (
        occurredAt >= from && occurredAt <= to && item.status === 'recorded'
      );
    });
    const saleItems = [
      ...digitalItems.map((item) => ({ ...item, source: 'mcbuse_payment' })),
      ...cashItems.map((item) => ({ ...item, source: 'merchant_cash' })),
    ];
    const snapshot = {
      businessName: merchant.businessName,
      generatedAt: to.toISOString(),
      demonstrationData,
      evidenceIncomplete,
      analytics,
      readiness,
      reconciliation,
      productMetrics,
      sales,
      saleItems: saleItems.map((item) => ({
        receiptNumber: item.receiptNumber,
        occurredAt: item.occurredAt.toISOString(),
        source: item.source,
        name: item.name,
        sku: item.sku,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor.toString(),
        lineTotalMinor: item.lineTotalMinor.toString(),
      })),
      limitations: [
        'Evidence readiness is not a credit score, lending decision, approval or denial.',
        'Merchant-recorded cash and imported settlement records retain their source labels.',
        'Payout reconciliation is limited to imported settlement records with explicit references.',
      ],
    };
    const row = (
      await this.db
        .insert(schema.merchantFinancePackages)
        .values({
          merchantId: merchant.merchantId,
          modelVersion: 'readiness-rules-v1',
          periodFrom: from,
          periodTo: to,
          snapshot,
          actorUserId: userId,
          idempotencyKey,
          inputFingerprint,
        })
        .returning()
    )[0];
    const pdf = await this.renderPdf(snapshot, row.id);
    const zip = await this.buildZip(snapshot, row.id, pdf);
    if (pdf.byteLength > 10 * 1024 * 1024 || zip.byteLength > 10 * 1024 * 1024)
      throw new BadRequestException(
        'Package artifact exceeds 10 MB; choose a shorter reporting period',
      );
    await this.db.insert(schema.merchantFinancePackageArtifacts).values([
      {
        packageId: row.id,
        kind: 'pdf',
        content: pdf,
        byteSize: pdf.byteLength,
      },
      {
        packageId: row.id,
        kind: 'zip',
        content: zip,
        byteSize: zip.byteLength,
      },
    ]);
    return this.packageResponse(row);
  }
  async getPackage(userId: string, id: string) {
    const row = await this.packageRow(userId, id);
    return this.packageResponse(row);
  }
  async pdf(userId: string, id: string) {
    return this.artifact(await this.packageRow(userId, id), 'pdf');
  }
  async zip(userId: string, id: string) {
    return this.artifact(await this.packageRow(userId, id), 'zip');
  }
  async email(
    userId: string,
    packageId: string,
    recipientEmail: string,
    institutionName: string | undefined,
    confirmed: boolean,
    idempotencyKey: string,
  ) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail))
      throw new BadRequestException('Enter a valid recipient email address');
    if (!confirmed)
      throw new BadRequestException(
        'Confirm that this package may be shared with the recipient',
      );
    if (!idempotencyKey)
      throw new BadRequestException('Idempotency-Key is required');
    const merchant = await this.merchants.requireMerchant(userId);
    const consent = await this.merchants.getConsent(userId);
    if (!consent.active)
      throw new ConflictException(
        'Active evidence consent is required before sending a package',
      );
    const pkg = await this.packageRow(userId, packageId);
    const inputFingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          packageId,
          recipientEmail: recipientEmail.trim().toLowerCase(),
          institutionName: institutionName?.trim() || null,
          confirmed,
        }),
      )
      .digest('hex');
    const existing = await this.db
      .select()
      .from(schema.merchantFinanceEmailAttempts)
      .where(
        and(
          eq(
            schema.merchantFinanceEmailAttempts.merchantId,
            merchant.merchantId,
          ),
          eq(
            schema.merchantFinanceEmailAttempts.idempotencyKey,
            idempotencyKey,
          ),
        ),
      )
      .limit(1);
    if (existing[0]) {
      if (existing[0].inputFingerprint === inputFingerprint)
        return { id: existing[0].id, status: existing[0].status };
      throw new ConflictException(
        'This Idempotency-Key was already used with different email input',
      );
    }
    const recent = await this.db
      .select({ id: schema.merchantFinanceEmailAttempts.id })
      .from(schema.merchantFinanceEmailAttempts)
      .where(
        and(
          eq(
            schema.merchantFinanceEmailAttempts.merchantId,
            merchant.merchantId,
          ),
          gte(
            schema.merchantFinanceEmailAttempts.createdAt,
            new Date(Date.now() - 3_600_000),
          ),
        ),
      );
    if (recent.length >= 5)
      throw new ConflictException(
        'Email sending is limited to five attempts per merchant per hour',
      );
    const attempt = (
      await this.db
        .insert(schema.merchantFinanceEmailAttempts)
        .values({
          merchantId: merchant.merchantId,
          packageId,
          recipientEmail,
          institutionName: institutionName?.trim() || null,
          idempotencyKey,
          inputFingerprint,
          status: 'sending',
        })
        .returning()
    )[0];
    const host = this.config.get<string>('SMTP_HOST');
    const from = this.config.get<string>('SMTP_FROM');
    const user = this.config.get<string>('SMTP_USER');
    const password = this.config.get<string>('SMTP_PASSWORD');
    if (!host || !from || !user || !password) {
      await this.updateAttempt(attempt.id, 'failed', 'smtp_not_configured');
      throw new ServiceUnavailableException(
        'Financial package email is not configured',
      );
    }
    try {
      const [pdf, zip] = await Promise.all([
        this.artifact(pkg, 'pdf'),
        this.artifact(pkg, 'zip'),
      ]);
      if (pdf.byteLength + zip.byteLength > 10 * 1024 * 1024)
        throw new BadRequestException(
          'Package attachments exceed 10 MB; choose a shorter reporting period',
        );
      const transporter = nodemailer.createTransport({
        host,
        port: Number(this.config.get<string>('SMTP_PORT') ?? 587),
        secure: this.config.get<string>('SMTP_SECURE') === 'true',
        requireTLS: true,
        auth: {
          user,
          pass: password,
        },
      });
      await transporter.sendMail({
        from,
        to: recipientEmail,
        subject: `MCBuse financial evidence package — ${(pkg.snapshot as any).businessName}`,
        text: `Attached are the fixed MCBuse financial evidence PDF and data ZIP for ${(pkg.snapshot as any).businessName}. SMTP acceptance does not confirm inbox delivery.`,
        attachments: [
          { filename: `mcbuse-evidence-${pkg.id}.pdf`, content: pdf },
          { filename: `mcbuse-evidence-${pkg.id}.zip`, content: zip },
        ],
      });
      await this.updateAttempt(attempt.id, 'accepted_by_smtp');
      return { id: attempt.id, status: 'accepted_by_smtp' };
    } catch (error) {
      const code =
        typeof error === 'object' && error && 'code' in error
          ? String((error as { code?: unknown }).code ?? '')
          : '';
      const ambiguous = ['ETIMEDOUT', 'ESOCKET', 'ECONNRESET'].includes(code);
      await this.updateAttempt(
        attempt.id,
        ambiguous ? 'unknown' : 'failed',
        ambiguous ? 'smtp_timeout_or_connection_lost' : 'smtp_send_failed',
      );
      throw error;
    }
  }
  private async packageRow(userId: string, id: string) {
    const merchant = await this.merchants.requireMerchant(userId);
    const row = (
      await this.db
        .select()
        .from(schema.merchantFinancePackages)
        .where(
          and(
            eq(schema.merchantFinancePackages.id, id),
            eq(schema.merchantFinancePackages.merchantId, merchant.merchantId),
          ),
        )
        .limit(1)
    )[0];
    if (!row) throw new BadRequestException('Financial package not found');
    return row;
  }
  private async artifact(
    row: typeof schema.merchantFinancePackages.$inferSelect,
    kind: 'pdf' | 'zip',
  ) {
    const existing = (
      await this.db
        .select()
        .from(schema.merchantFinancePackageArtifacts)
        .where(
          and(
            eq(schema.merchantFinancePackageArtifacts.packageId, row.id),
            eq(schema.merchantFinancePackageArtifacts.kind, kind),
          ),
        )
        .limit(1)
    )[0];
    if (existing) return Buffer.from(existing.content);
    const pdf = await this.renderPdf(row.snapshot as any, row.id);
    const content =
      kind === 'pdf'
        ? pdf
        : await this.buildZip(row.snapshot as any, row.id, pdf);
    if (content.byteLength > 10 * 1024 * 1024)
      throw new BadRequestException(
        'Package artifact exceeds 10 MB; choose a shorter reporting period',
      );
    await this.db
      .insert(schema.merchantFinancePackageArtifacts)
      .values({
        packageId: row.id,
        kind,
        content,
        byteSize: content.byteLength,
      })
      .onConflictDoNothing();
    return content;
  }
  private async buildZip(snapshot: any, id: string, pdf: Buffer) {
    return new Promise<Buffer>((resolve, reject) => {
      const ZipArchive = (archiver as unknown as {
        ZipArchive?: new (options: unknown) => any;
      }).ZipArchive;
      if (typeof ZipArchive !== 'function') {
        reject(new Error('ZIP archive support is unavailable'));
        return;
      }
      const archive = new ZipArchive({ zlib: { level: 9 } });
      const stream = new PassThrough();
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);
      archive.pipe(stream);
      archive.append(pdf, { name: `mcbuse-evidence-${id}.pdf` });
      archive.append(
        this.csv(
          [
            'receipt_number',
            'occurred_at',
            'source',
            'verification',
            'environment',
            'amount_minor',
            'currency',
            'description',
          ],
          snapshot.sales.map((item: any) => [
            item.receiptNumber,
            item.occurredAt,
            item.source,
            item.verification,
            item.environment,
            item.amount.minor,
            item.amount.currency,
            item.description,
          ]),
        ),
        { name: 'sales.csv' },
      );
      archive.append(
        this.csv(
          [
            'receipt_number',
            'occurred_at',
            'source',
            'item_name',
            'sku',
            'quantity',
            'unit_price_minor',
            'line_total_minor',
          ],
          snapshot.saleItems.map((item: any) => [
            item.receiptNumber,
            item.occurredAt,
            item.source,
            item.name,
            item.sku,
            item.quantity,
            item.unitPriceMinor,
            item.lineTotalMinor,
          ]),
        ),
        { name: 'sale-items.csv' },
      );
      archive.append(
        this.csv(
          ['date', 'amount_minor', 'count'],
          snapshot.analytics.dailyTrend.map((item: any) => [
            item.start,
            item.amountMinor,
            item.paymentCount,
          ]),
        ),
        { name: 'sales-summary.csv' },
      );
      archive.append(
        this.csv(
          ['source', 'record_count'],
          Object.entries(snapshot.analytics.sourceCoverage).map(
            ([key, value]) => [key, value],
          ),
        ),
        { name: 'evidence-sources.csv' },
      );
      archive.append(
        this.csv(
          [
            'product',
            'quantity_sold',
            'revenue_minor',
            'digital_quantity',
            'cash_quantity',
            'available_quantity',
          ],
          snapshot.productMetrics.map((item: any) => [
            item.name,
            item.quantitySold,
            item.revenue.minor,
            item.digitalQuantity,
            item.cashQuantity,
            item.availableQuantity,
          ]),
        ),
        { name: 'product-metrics.csv' },
      );
      archive.append(
        this.csv(
          [
            'source',
            'payout_reference',
            'currency',
            'expected_amount_minor',
            'actual_amount_minor',
            'status',
          ],
          snapshot.reconciliation.items.map((item: any) => [
            item.sourceName,
            item.externalReference,
            item.currency,
            item.expectedAmountMinor,
            item.actualAmountMinor,
            item.reconciliationStatus,
          ]),
        ),
        { name: 'payouts.csv' },
      );
      archive.append(
        this.csv(
          [
            'payout_reference',
            'payment_reference',
            'amount_minor',
            'linked_transaction_id',
          ],
          snapshot.reconciliation.items.flatMap((item: any) =>
            item.allocations.map((allocation: any) => [
              item.externalReference,
              allocation.paymentReference,
              allocation.amountMinor,
              allocation.merchantTransactionId,
            ]),
          ),
        ),
        { name: 'payout-allocations.csv' },
      );
      archive.append(
        this.csv(
          ['payout_reference', 'status'],
          snapshot.reconciliation.items
            .filter(
              (item: any) =>
                !['matched', 'settled', 'expected', 'processing'].includes(
                  item.reconciliationStatus,
                ),
            )
            .map((item: any) => [
              item.externalReference,
              item.reconciliationStatus,
            ]),
        ),
        { name: 'reconciliation-exceptions.csv' },
      );
      void archive.finalize();
    });
  }
  private packageResponse(
    row: typeof schema.merchantFinancePackages.$inferSelect,
  ) {
    return {
      id: row.id,
      modelVersion: row.modelVersion,
      periodFrom: row.periodFrom.toISOString(),
      periodTo: row.periodTo.toISOString(),
      snapshot: row.snapshot,
      createdAt: row.createdAt.toISOString(),
    };
  }
  private async updateAttempt(id: string, status: string, errorCode?: string) {
    await this.db
      .update(schema.merchantFinanceEmailAttempts)
      .set({ status, errorCode: errorCode ?? null, updatedAt: new Date() })
      .where(eq(schema.merchantFinanceEmailAttempts.id, id));
  }
  private async renderPdf(snapshot: any, id: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({
        size: 'A4',
        margin: 48,
        bufferPages: true,
      });
      const chunks: Buffer[] = [];
      document.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
      document.fontSize(20).text('MCBuse Financial Evidence Package');
      document.moveDown().fontSize(11).text(snapshot.businessName);
      document.text(`Package reference: ${id}`);
      document.text(`Generated: ${snapshot.generatedAt}`);
      if (snapshot.evidenceIncomplete) {
        document
          .moveDown()
          .fontSize(11)
          .fillColor('#a16207')
          .text('Evidence incomplete');
        document.fillColor('black');
      }
      if (snapshot.demonstrationData) {
        document
          .moveDown()
          .fontSize(11)
          .fillColor('#9f1239')
          .text('Demonstration data');
        document.fillColor('black');
      }
      document.moveDown().fontSize(14).text('Recorded activity');
      document
        .fontSize(10)
        .text(
          `Recorded sales: EUR ${(Number(snapshot.analytics.totalRecordedSales.minor) / 100).toFixed(2)}`,
        );
      document.text(`Sales recorded: ${snapshot.analytics.saleCount}`);
      document.text(
        `Verified MCBuse payments: EUR ${(Number(snapshot.analytics.digitalSales.minor) / 100).toFixed(2)}`,
      );
      document.text(
        `Merchant-recorded cash: EUR ${(Number(snapshot.analytics.cashSales.minor) / 100).toFixed(2)}`,
      );
      document.moveDown().fontSize(14).text('Product performance');
      document.fontSize(10);
      (snapshot.productMetrics ?? [])
        .slice(0, 10)
        .forEach((item: any) =>
          document.text(
            `${item.name}: ${item.quantitySold} units · EUR ${(Number(item.revenue.minor) / 100).toFixed(2)}`,
          ),
        );
      if (!(snapshot.productMetrics ?? []).length)
        document.text(
          'No product-linked recorded sales in the package period.',
        );
      document.moveDown().fontSize(14).text('Payout reconciliation');
      document
        .fontSize(10)
        .text(
          snapshot.reconciliation?.coverage
            ? `${snapshot.reconciliation.items.length} imported payout record(s); source records are not sales revenue.`
            : 'No payout evidence available.',
        );
      (snapshot.reconciliation?.items ?? [])
        .slice(0, 10)
        .forEach((item: any) =>
          document.text(
            `${item.externalReference}: ${item.reconciliationStatus}`,
          ),
        );
      document.moveDown().fontSize(14).text('Evidence readiness');
      document
        .fontSize(10)
        .text(String(snapshot.readiness.stage).replaceAll('_', ' '));
      document.text(snapshot.readiness.disclaimer);
      document.moveDown().fontSize(14).text('Limitations');
      snapshot.limitations.forEach((item: string) =>
        document.fontSize(10).text(`• ${item}`),
      );
      document
        .moveDown()
        .fontSize(8)
        .fillColor('grey')
        .text(
          'This package is generated from merchant records and is not a credit score, loan approval or lending decision.',
        );
      const pages = document.bufferedPageRange();
      for (let page = 0; page < pages.count; page += 1) {
        document.switchToPage(page);
        document
          .fontSize(8)
          .fillColor('#64748b')
          .text('MCBuse Financial Evidence Package', 48, 22, {
            lineBreak: false,
          })
          .text(`Page ${page + 1} of ${pages.count}`, 48, 780, {
            width: 499,
            align: 'right',
            lineBreak: false,
          })
          .fillColor('black');
      }
      document.end();
    });
  }
  private csv(headers: string[], rows: unknown[][]) {
    const escape = (value: unknown) => {
      const raw = String(value ?? '');
      const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
      return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
    };
    return `${headers.map(escape).join(',')}\n${rows.map((row) => row.map(escape).join(',')).join('\n')}\n`;
  }
}
