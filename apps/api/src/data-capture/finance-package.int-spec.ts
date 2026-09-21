import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import {
  connectTestDatabase,
  type TestDatabase,
} from '../database/testing/test-database';
import {
  createMerchantFixture,
  destroyMerchantFixture,
  type MerchantFixture,
} from '../database/testing/merchant-fixture';
import * as schema from '../database/schema';
import { MerchantService } from './merchant.service';
import { MerchantInventoryService } from './merchant-inventory.service';
import { MerchantActivityService } from './merchant-activity.service';
import { MerchantImportService } from './merchant-import.service';
import { MerchantFinanceService } from './merchant-finance.service';
import { MerchantAssessmentService } from './assessment/merchant-assessment.service';
import type { RatesService } from '../rates/rates.service';
import type { MerchantImageService } from './merchant-image.service';
import type { AnalyticsWorkQueueService } from '../analytics-intelligence/analytics-work-queue.service';

/**
 * R.11, R.12, R.14, R.17 and X.18 — what a finance package promises.
 *
 * The package is evidence a merchant hands to a lender, so the properties that
 * matter are all about it not changing and not lying: the same bytes on
 * preview and download, a detail list that adds up to its own headline, and a
 * send history that distinguishes acceptance from delivery.
 */
describe('finance packages (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let merchant: MerchantFixture;
  let merchants: MerchantService;
  let inventory: MerchantInventoryService;
  let activity: MerchantActivityService;
  let finance: MerchantFinanceService;
  let assessments: MerchantAssessmentService;

  const rates = {
    getAll: () => ({
      USD_TO_EUR: {
        from: 'USD',
        to: 'EUR',
        rate: 0.92,
        inverseRate: 1.087,
        updatedAt: new Date().toISOString(),
      },
    }),
  } as unknown as RatesService;

  const analyticsWork = {
    enqueue: async () => undefined,
  } as unknown as AnalyticsWorkQueueService;

  const images = { publicUrl: () => null } as unknown as MerchantImageService;

  beforeAll(async () => {
    const connection = await connectTestDatabase();
    db = connection.db;
    pool = connection.pool;

    const config = new ConfigService();
    merchants = new MerchantService(db, rates, config);
    inventory = new MerchantInventoryService(
      db,
      merchants,
      rates,
      images,
      analyticsWork,
    );
    activity = new MerchantActivityService(db, merchants, analyticsWork);
    const imports = new MerchantImportService(db, merchants, analyticsWork);
    finance = new MerchantFinanceService(
      db,
      merchants,
      activity,
      imports,
      config,
    );
    assessments = new MerchantAssessmentService(db, merchants);

    merchant = await createMerchantFixture(db, 'Package');

    // A handful of real recorded sales, so the package has something to add up.
    const product = await inventory.createProduct(merchant.userId, {
      name: 'Package Product',
      category: 'Goods',
      unitPriceMinor: '250',
      quantity: 100,
    });
    for (let i = 0; i < 5; i += 1) {
      await activity.createCashSale(
        merchant.userId,
        {
          lines: [{ type: 'product', productId: product.id, quantity: 2 }],
          occurredAt: new Date(Date.now() - (i + 1) * 3_600_000).toISOString(),
        },
        `package-sale-${i}`,
      );
    }
  });

  afterAll(async () => {
    await destroyMerchantFixture(db, merchant);
    await pool.end();
  });

  let packageId: string;

  it('creates a package over the chosen reporting window', async () => {
    const created = await finance.createPackage(
      merchant.userId,
      30,
      false,
      'package-create-1',
    );
    packageId = created.id;

    expect(created.reportingWindow.days).toBe(30);
    expect(created.reportingWindow.label).toBe('30-day reporting window');
  });

  describe('R.12 — the reporting window is its own labelled thing', () => {
    it('keeps 7, 30 and 90 day windows distinct', async () => {
      const seven = await finance.createPackage(
        merchant.userId,
        7,
        false,
        'package-create-7',
      );
      const ninety = await finance.createPackage(
        merchant.userId,
        90,
        false,
        'package-create-90',
      );

      expect(seven.reportingWindow.days).toBe(7);
      expect(ninety.reportingWindow.days).toBe(90);
      expect(seven.reportingWindow.label).toBe('7-day reporting window');
    });

    it('labels the assessment window separately from the reporting window', async () => {
      const assessment = await assessments.run(merchant.userId);
      await assessments.linkToPackage(packageId, assessment.id);

      const linked = await assessments.forPackage(packageId);
      const pkg = await finance.getPackage(merchant.userId, packageId);

      expect(linked!.evidenceWindow).toBeDefined();
      // Two windows, named apart, so neither can be read as the other.
      expect(Object.keys(pkg.reportingWindow)).toContain('label');
      expect(linked!.evidenceWindow).not.toEqual(pkg.reportingWindow);
    });
  });

  describe('R.17 — the detail reconciles to the totals', () => {
    it('reports the export as reconciling', async () => {
      const pkg = await finance.getPackage(merchant.userId, packageId);
      const integrity = (pkg.snapshot as Record<string, unknown>)
        .exportIntegrity as {
        reconciles: boolean;
        detailRowCount: number;
        discrepancy: string | null;
      };

      expect(integrity.reconciles).toBe(true);
      expect(integrity.discrepancy).toBeNull();
      expect(integrity.detailRowCount).toBeGreaterThanOrEqual(5);
    });

    it('the exported sale lines sum to the reported total', async () => {
      const pkg = await finance.getPackage(merchant.userId, packageId);
      const snapshot = pkg.snapshot as {
        sales: Array<{ amount: { minor: string } }>;
        exportIntegrity: { reportedAmountMinor: string };
      };

      const summed = snapshot.sales.reduce(
        (total, sale) => total + BigInt(sale.amount.minor),
        0n,
      );
      expect(summed.toString()).toBe(snapshot.exportIntegrity.reportedAmountMinor);
    });

    it('lists every sale in the period rather than a page of them', async () => {
      const pkg = await finance.getPackage(merchant.userId, packageId);
      const snapshot = pkg.snapshot as { sales: unknown[] };
      const recorded = await db
        .select({ id: schema.merchantCashSales.id })
        .from(schema.merchantCashSales)
        .where(eq(schema.merchantCashSales.merchantId, merchant.merchantId));

      expect(snapshot.sales).toHaveLength(recorded.length);
    });
  });

  describe('R.11 — preview and download are the same artifact', () => {
    it('gives a checksum for each stored artifact', async () => {
      const preview = await finance.preview(merchant.userId, packageId);
      expect(preview.artifacts.map((a) => a.kind).sort()).toEqual([
        'pdf',
        'zip',
      ]);
      for (const artifact of preview.artifacts) {
        expect(artifact.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(artifact.byteSize).toBeGreaterThan(0);
      }
    });

    it('the previewed checksum is of the bytes a download returns', async () => {
      const preview = await finance.preview(merchant.userId, packageId);
      const pdf = await finance.pdf(merchant.userId, packageId);
      const zip = await finance.zip(merchant.userId, packageId);

      const pdfChecksum = createHash('sha256').update(pdf).digest('hex');
      const zipChecksum = createHash('sha256').update(zip).digest('hex');

      expect(preview.artifacts.find((a) => a.kind === 'pdf')!.sha256).toBe(
        pdfChecksum,
      );
      expect(preview.artifacts.find((a) => a.kind === 'zip')!.sha256).toBe(
        zipChecksum,
      );
    });

    it('does not change between previews', async () => {
      const first = await finance.preview(merchant.userId, packageId);
      const second = await finance.preview(merchant.userId, packageId);
      expect(second.artifacts).toEqual(first.artifacts);
    });

    it('carries the snapshot the preview is describing', async () => {
      const preview = await finance.preview(merchant.userId, packageId);
      expect(preview.snapshot).toBeTruthy();
      expect(preview.id).toBe(packageId);
    });
  });

  describe('X.18 — immutability and retries', () => {
    it('returns the original package when the same key is replayed', async () => {
      const first = await finance.createPackage(
        merchant.userId,
        30,
        false,
        'package-replay',
      );
      const second = await finance.createPackage(
        merchant.userId,
        30,
        false,
        'package-replay',
      );
      expect(second.id).toBe(first.id);
      expect(second.createdAt).toBe(first.createdAt);
    });

    it('refuses the same key with a different period', async () => {
      await expect(
        finance.createPackage(merchant.userId, 90, false, 'package-replay'),
      ).rejects.toThrow(/different package input/i);
    });

    it('the stored artifact does not change when downloaded again', async () => {
      const first = await finance.pdf(merchant.userId, packageId);
      const second = await finance.pdf(merchant.userId, packageId);
      expect(second.equals(first)).toBe(true);
    });
  });

  describe('R.14 — history', () => {
    it('lists the packages produced, newest first', async () => {
      const history = await finance.listPackages(merchant.userId);
      expect(history.items.length).toBeGreaterThanOrEqual(3);
      const times = history.items.map((item) =>
        new Date(item.createdAt).getTime(),
      );
      expect([...times].sort((a, b) => b - a)).toEqual(times);
    });

    it('leaves the full snapshot out of the list', async () => {
      const history = await finance.listPackages(merchant.userId);
      expect(history.items[0]).not.toHaveProperty('snapshot');
      expect(history.items[0]).toHaveProperty('reportingWindow');
    });

    it('records a failed send attempt in the history', async () => {
      await merchants.updateConsent(merchant.userId, true);

      // SMTP is not configured in this environment, which is itself a real
      // outcome: the attempt is recorded as failed rather than lost.
      await expect(
        finance.email(
          merchant.userId,
          packageId,
          'lender@example.com',
          'Example Bank',
          true,
          'package-email-1',
        ),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      const history = await finance.emailHistory(merchant.userId);
      const attempt = history.items.find(
        (item) => item.packageId === packageId,
      )!;
      expect(attempt.status).toBe('failed');
      expect(attempt.errorCode).toBe('smtp_not_configured');
      expect(attempt.recipientEmail).toBe('lender@example.com');
    });

    it('never claims an accepted message was delivered', async () => {
      const history = await finance.emailHistory(merchant.userId);
      for (const attempt of history.items) {
        expect(attempt.deliveryConfirmed).toBe(false);
      }
    });
  });
});
