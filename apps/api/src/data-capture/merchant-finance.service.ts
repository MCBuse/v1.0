import { MerchantAssessmentService, type SavedAssessment } from './assessment/merchant-assessment.service';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import PDFDocument from 'pdfkit';
import archiver = require('archiver');
import nodemailer = require('nodemailer');
import { PassThrough } from 'stream';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { MerchantActivityService } from './merchant-activity.service';
import { exportIntegrityOf, truncationNote } from './export-integrity';
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
    @Optional() private readonly assessments?: MerchantAssessmentService,
  ) {}
  async createPackage(
    userId: string,
    periodDays = 30,
    demonstrationData = false,
    idempotencyKey = '',
    assessmentId?: string,
  ) {
    if (![7, 30, 90].includes(periodDays))
      throw new BadRequestException('Period must be 7, 30 or 90 days');
    if (!idempotencyKey)
      throw new BadRequestException('Idempotency-Key is required');
    const merchant = await this.merchants.requireMerchant(userId);
    const fingerprintFor = (id: string | null) => createHash('sha256').update(JSON.stringify({ periodDays, demonstrationData, assessmentId: id })).digest('hex');
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
      const saved = (existing.snapshot as { assessment?: SavedAssessment }).assessment;
      if (existing.inputFingerprint === fingerprintFor(assessmentId ?? saved?.id ?? null))
        return this.packageResponse(existing);
      throw new ConflictException(
        'This Idempotency-Key was already used with different package input',
      );
    }
    if (!this.assessments) throw new ServiceUnavailableException('Assessment service is unavailable');
    const assessment = assessmentId ? await this.assessments.require(userId, assessmentId) : ((await this.assessments.latest(userId)) ?? await this.assessments.run(userId, undefined, `package:${createHash('sha256').update(idempotencyKey).digest('hex')}`));
    const inputFingerprint = fingerprintFor(assessment.id);
    const to = new Date();
    const from = new Date(to.getTime() - periodDays * 86_400_000);
    const [
      analytics,
      currentReadiness,
      reconciliation,
      activityPage,
      digitalItems,
      cashItems,
    ] = await Promise.all([
      this.activity.analytics(userId, from, to),
      this.merchants.getReadiness(userId),
      this.imports.listReconciliation(userId),
      // Every recorded sale in the period, not a page of them. The package is
      // evidence: a list that stopped at an arbitrary row would disagree with
      // the totals printed beside it and nothing would say so.
      this.salesForPeriod(merchant.merchantId, from, to),
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
    const productMetrics = analytics.productPerformance.map((product) => ({
      ...product,
      revenue: product.totalSales,
      availableQuantity: null,
    }));
    const readiness = { stage: assessment.stage, disclaimer: assessment.disclaimer, missingRequirements: assessment.missingRequirements };
    const evidenceIncomplete = assessment.stage !== 'evidence_ready';
    const sales = activityPage;
    const saleItems = [
      ...digitalItems.map((item) => ({ ...item, source: 'mcbuse_payment' })),
      ...cashItems.map((item) => ({ ...item, source: 'merchant_cash' })),
    ];
    const snapshot = {
      businessName: merchant.businessName,
      assessment,
      assessmentBinding: 'verified',
      generatedAt: to.toISOString(),
      demonstrationData,
      evidenceIncomplete,
      analytics,
      readiness,
      reconciliation,
      productMetrics,
      sales,
      // R.17 — the detail and the headline totals are checked against each
      // other here, and the answer travels with the package.
      exportIntegrity: exportIntegrityOf(sales, analytics),
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
    if (!snapshot.exportIntegrity.reconciles) throw new ConflictException('Source records changed during generation; retry this package');
    const id = randomUUID();
    const pdf = await this.renderPdf(snapshot, id);
    const zip = await this.buildZip(snapshot, id, pdf);
    if (pdf.byteLength + zip.byteLength > 10 * 1024 * 1024) throw new BadRequestException('Package exceeds 10 MB; choose a shorter period');
    return this.db.transaction(async tx => {
      const [row] = await tx.insert(schema.merchantFinancePackages).values({ id, merchantId: merchant.merchantId, modelVersion: assessment.modelVersion,
        periodFrom: from, periodTo: to, snapshot, actorUserId: userId, idempotencyKey, inputFingerprint,
      }).onConflictDoNothing().returning();
      if (!row) {
        const [winner] = await tx.select().from(schema.merchantFinancePackages).where(and(eq(schema.merchantFinancePackages.merchantId, merchant.merchantId), eq(schema.merchantFinancePackages.idempotencyKey, idempotencyKey)));
        if (!winner || winner.inputFingerprint !== inputFingerprint) throw new ConflictException('Package key already used with different input');
        return this.packageResponse(winner);
      }
      await tx.insert(schema.merchantFinancePackageAssessments).values({ packageId: id, assessmentId: assessment.id });
      await tx.insert(schema.merchantFinancePackageArtifacts).values([
        { packageId: id, kind: 'pdf', content: pdf, byteSize: pdf.byteLength },
        { packageId: id, kind: 'zip', content: zip, byteSize: zip.byteLength },
      ]);
      return this.packageResponse(row);
    });
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
        .onConflictDoNothing()
        .returning()
    )[0];
    if (!attempt) {
      const [winner] = await this.db.select().from(schema.merchantFinanceEmailAttempts).where(and(eq(schema.merchantFinanceEmailAttempts.merchantId, merchant.merchantId), eq(schema.merchantFinanceEmailAttempts.idempotencyKey, idempotencyKey)));
      if (!winner || winner.inputFingerprint !== inputFingerprint) throw new ConflictException('Email key already used with different input');
      return { id: winner.id, status: winner.status };
    }
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
  /**
   * Every recorded sale in the period, digital and cash, newest first.
   *
   * Deliberately unpaginated: an export that quietly stopped at a page
   * boundary is the failure this replaces. A period large enough to produce an
   * oversized artifact is refused explicitly further down instead.
   */
  private async salesForPeriod(merchantId: string, from: Date, to: Date) {
    const [digital, cash] = await Promise.all([
      this.db
        .select({
          id: schema.merchantTransactions.id,
          receiptNumber: schema.merchantTransactions.receiptNumber,
          amount: schema.merchantTransactions.displayAmountMinor,
          description: schema.merchantTransactions.description,
          occurredAt: schema.merchantTransactions.occurredAt,
          environment: schema.merchantTransactions.evidenceEnvironment,
        })
        .from(schema.merchantTransactions)
        .where(
          and(
            eq(schema.merchantTransactions.merchantId, merchantId),
            eq(schema.merchantTransactions.status, 'finalized'),
            gte(schema.merchantTransactions.occurredAt, from),
            lte(schema.merchantTransactions.occurredAt, to),
          ),
        ),
      this.db
        .select({
          id: schema.merchantCashSales.id,
          receiptNumber: schema.merchantCashSales.receiptNumber,
          amount: schema.merchantCashSales.amountMinor,
          description: schema.merchantCashSales.description,
          occurredAt: schema.merchantCashSales.occurredAt,
        })
        .from(schema.merchantCashSales)
        .where(
          and(
            eq(schema.merchantCashSales.merchantId, merchantId),
            eq(schema.merchantCashSales.status, 'recorded'),
            gte(schema.merchantCashSales.occurredAt, from),
            lte(schema.merchantCashSales.occurredAt, to),
          ),
        ),
    ]);

    return [
      ...digital.map((item) => ({
        id: item.id,
        receiptNumber: item.receiptNumber,
        source: 'mcbuse_payment' as const,
        verification: 'internally_confirmed' as const,
        environment: (item.environment ?? 'unknown') as string,
        amount: {
          minor: item.amount.toString(),
          currency: 'EUR',
          estimated: false,
          rateTimestamp: null,
        },
        description: item.description,
        status: 'recorded' as const,
        occurredAt: item.occurredAt.toISOString(),
      })),
      ...cash.map((item) => ({
        id: item.id,
        receiptNumber: item.receiptNumber,
        source: 'merchant_cash' as const,
        verification: 'merchant_declared' as const,
        environment: 'unknown',
        amount: {
          minor: item.amount.toString(),
          currency: 'EUR',
          estimated: false,
          rateTimestamp: null,
        },
        description: item.description,
        status: 'recorded' as const,
        occurredAt: item.occurredAt.toISOString(),
      })),
    ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
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
    // Not found, rather than a bad request: the id may be well-formed and
    // simply belong to another merchant, and that is the same answer.
    if (!row) throw new NotFoundException('Financial package not found');
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
      archive.append(JSON.stringify(snapshot, null, 2), { name: 'snapshot.json' });
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
    const days = Math.round(
      (row.periodTo.getTime() - row.periodFrom.getTime()) / 86_400_000,
    );
    return {
      id: row.id,
      modelVersion: row.modelVersion,
      periodFrom: row.periodFrom.toISOString(),
      periodTo: row.periodTo.toISOString(),
      /**
       * R.12 — the reporting window, named as its own thing. The assessment
       * this package cites has its own evidence window, which may differ; the
       * two are labelled separately so neither is read as the other.
       */
      reportingWindow: {
        days,
        from: row.periodFrom.toISOString(),
        to: row.periodTo.toISOString(),
        label: `${days}-day reporting window`,
      },
      snapshot: row.snapshot,
      assessment: (row.snapshot as { assessment?: SavedAssessment }).assessment ?? null,
      assessmentBinding: (row.snapshot as { assessment?: SavedAssessment }).assessment ? 'verified' : 'legacy_unverified',
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * R.11 — everything a preview needs, tied to the bytes a download returns.
   *
   * The artifacts are built once at creation and stored; the checksums here
   * are of those exact stored bytes. A preview that re-rendered the document
   * could drift from the file the recipient receives, which is the whole
   * failure an immutable package exists to prevent.
   */
  async preview(userId: string, id: string) {
    const row = await this.packageRow(userId, id);
    const artifacts = await this.db
      .select({
        kind: schema.merchantFinancePackageArtifacts.kind,
        content: schema.merchantFinancePackageArtifacts.content,
        byteSize: schema.merchantFinancePackageArtifacts.byteSize,
        createdAt: schema.merchantFinancePackageArtifacts.createdAt,
      })
      .from(schema.merchantFinancePackageArtifacts)
      .where(eq(schema.merchantFinancePackageArtifacts.packageId, id));

    return {
      ...this.packageResponse(row),
      artifacts: artifacts
        .map((artifact) => ({
          kind: artifact.kind,
          byteSize: artifact.byteSize,
          sha256: createHash('sha256')
            .update(artifact.content as Buffer)
            .digest('hex'),
          createdAt: artifact.createdAt.toISOString(),
          downloadPath: `/merchants/me/finance-packages/${id}/${
            artifact.kind === 'pdf' ? 'pdf' : 'data'
          }`,
        }))
        .sort((a, b) => a.kind.localeCompare(b.kind)),
    };
  }

  /** R.14 — the packages this merchant has produced, newest first. */
  async listPackages(userId: string, limit = 50) {
    const merchant = await this.merchants.requireMerchant(userId);
    const rows = await this.db
      .select()
      .from(schema.merchantFinancePackages)
      .where(eq(schema.merchantFinancePackages.merchantId, merchant.merchantId))
      .orderBy(desc(schema.merchantFinancePackages.createdAt))
      .limit(limit);

    return {
      items: rows.map((row) => {
        const { snapshot, ...rest } = this.packageResponse(row);
        void snapshot;
        return rest;
      }),
    };
  }

  /**
   * R.14 — every attempt to send a package, including the failed ones.
   *
   * SMTP acceptance is reported as acceptance, never as delivery: the two are
   * different facts and the history keeps them apart.
   */
  async emailHistory(userId: string, limit = 50) {
    const merchant = await this.merchants.requireMerchant(userId);
    const rows = await this.db
      .select()
      .from(schema.merchantFinanceEmailAttempts)
      .where(
        eq(schema.merchantFinanceEmailAttempts.merchantId, merchant.merchantId),
      )
      .orderBy(desc(schema.merchantFinanceEmailAttempts.createdAt))
      .limit(limit);

    return {
      items: rows.map((row) => ({
        id: row.id,
        packageId: row.packageId,
        recipientEmail: row.recipientEmail,
        institutionName: row.institutionName,
        status: row.status,
        errorCode: row.errorCode,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        deliveryConfirmed: false,
        note:
          row.status === 'accepted_by_smtp'
            ? 'The mail server accepted this message. That is not confirmation it reached the inbox.'
            : null,
      })),
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
      const products = snapshot.productMetrics ?? [];
      products
        .slice(0, 10)
        .forEach((item: any) =>
          document.text(
            `${item.name}: ${item.quantitySold} units · EUR ${(Number(item.revenue.minor) / 100).toFixed(2)}`,
          ),
        );
      const productNote = truncationNote(
        Math.min(10, products.length),
        products.length,
        'product-metrics.csv',
      );
      if (productNote) document.fillColor('#64748b').text(productNote).fillColor('black');
      if (!products.length)
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
      const reconciliationItems = snapshot.reconciliation?.items ?? [];
      reconciliationItems
        .slice(0, 10)
        .forEach((item: any) =>
          document.text(
            `${item.externalReference}: ${item.reconciliationStatus}`,
          ),
        );
      const reconciliationNote = truncationNote(
        Math.min(10, reconciliationItems.length),
        reconciliationItems.length,
        'payout-reconciliation.csv',
      );
      if (reconciliationNote)
        document.fillColor('#64748b').text(reconciliationNote).fillColor('black');
      if (snapshot.exportIntegrity) {
        document.moveDown().fontSize(14).text('Export completeness');
        document
          .fontSize(10)
          .text(
            `${snapshot.exportIntegrity.detailRowCount} sale(s) in the data export, totalling EUR ${(
              Number(snapshot.exportIntegrity.detailAmountMinor) / 100
            ).toFixed(2)}.`,
          );
        document.text(
          snapshot.exportIntegrity.reconciles
            ? 'The exported detail reconciles to the totals above.'
            : `The exported detail does not reconcile to the totals above: ${snapshot.exportIntegrity.discrepancy}.`,
        );
      }
      if (snapshot.assessment) {
        document.moveDown().fontSize(14).text('Saved assessment');
        document.fontSize(10).text(`ID: ${snapshot.assessment.id}`);
        document.text(`Model: ${snapshot.assessment.modelId} / ${snapshot.assessment.modelVersion}`);
        document.text(`Assessed: ${snapshot.assessment.createdAt}`);
        document.text(`Assessment evidence window: ${snapshot.assessment.evidenceWindow.from} to ${snapshot.assessment.evidenceWindow.to}`);
        document.text(`Passed requirements: ${snapshot.assessment.passedRequirements.join(', ') || 'None'}`);
        document.text(`Missing requirements: ${snapshot.assessment.missingRequirements.join(', ') || 'None'}`);
        document.moveDown(0.5).fontSize(11).text('Evidence and source coverage');
        document.fontSize(10);
        const evidenceLabel = (key: string) =>
          key.replace(/([A-Z])/g, ' $1').replaceAll('_', ' ')
            .replace(/\b\w/g, (letter) => letter.toUpperCase())
            .replace(/^Mcbuse/, 'MCBuse');
        for (const [key, value] of Object.entries(snapshot.assessment.reliability ?? {})) {
          document.text(`${evidenceLabel(key)}: ${String(value ?? 'Not available')}`);
        }
        for (const [key, value] of Object.entries(snapshot.assessment.sourceCoverage ?? {})) {
          document.text(`${evidenceLabel(key)}: ${typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value ?? 'Not available')}`);
        }
        const business = snapshot.assessment.businessProfile ?? {};
        const declared = business.creditProfile ?? {};
        document.moveDown(0.5).fontSize(11).text('Business and additional information');
        document.fontSize(10).text(`Business name: ${business.businessName ?? 'Not available'}`);
        document.text(`Reporting timezone: ${business.timezone ?? 'Not available'}`);
        document.text(`Evidence consent at assessment: ${business.consent?.active ? 'Active' : 'Not active'}`);
        const declaredLabels: Record<string, string> = {
          commencementDate: 'Business commencement date',
          merchantType: 'Merchant category',
          loanTermMonths: 'Requested loan term (months)',
          externalBureauScore: 'External bureau score (declared scale)',
          externalBureauReport: 'External bureau notes',
          existingDebtMinor: 'Existing debt (EUR)',
          loanAmountMinor: 'Requested loan amount (EUR)',
          inventoryValueMinor: 'Declared inventory value (EUR)',
          collateralValueMinor: 'Declared collateral value (EUR)',
          businessDebtsMinor: 'Business debts (EUR)',
          businessAssetsMinor: 'Business assets (EUR)',
          ownerPersonalAssetsMinor: 'Owner personal assets (EUR)',
          ownerPersonalDebtsMinor: 'Owner personal debts (EUR)',
        };
        const missingDeclared: string[] = [];
        for (const [key, label] of Object.entries(declaredLabels)) {
          const value = declared[key];
          if (value == null || value === '') {
            missingDeclared.push(label);
            continue;
          }
          const minor = key.endsWith('Minor') ? BigInt(String(value)) : null;
          const shown = minor === null
            ? String(value)
            : `${(minor / 100n).toLocaleString('en-IE')}.${(minor % 100n).toString().padStart(2, '0')}`;
          document.text(`${label}: ${shown}`);
        }
        if (missingDeclared.length) document.text(`Not provided: ${missingDeclared.join(', ')}.`);
        document.fillColor('#64748b').text('Additional information is merchant-declared unless another source is identified.').fillColor('black');
        snapshot.assessment.limitations.forEach((item: string) => document.text(item));
      }
      if (snapshot.assessment?.credit) {
        if (document.y > 650) document.addPage();
        const credit = snapshot.assessment.credit;
        document.moveDown().fontSize(14).text('Business financial profile');
        document.fontSize(10).text(`Model: ${credit.modelVersion} | Status: ${credit.status}`);
        document.text(`Financial profile: ${credit.financialProfile ? credit.financialProfile.score.toFixed(1) + ' / 100' : 'Not available'}`);
        if (credit.status === 'ready' && !credit.financialProfile) document.text('A score cannot be calculated while required inputs are missing. No missing values were filled in.');
        document.text(`Profile confidence: ${credit.profileConfidence?.label ?? 'Not available'}`);
        document.text('Confidence describes completeness and processing quality, not independent verification or credit risk.');
        for (const line of credit.integritySummary) document.text(line);
        for (const [field, reason] of Object.entries(credit.missingReasons)) document.text(`${field}: ${reason}`);
      }
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
