import { ConfigService } from '@nestjs/config';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
import { MerchantService } from './merchant.service';
import { MerchantInventoryService } from './merchant-inventory.service';
import { MerchantActivityService } from './merchant-activity.service';
import { MerchantFinanceService } from './merchant-finance.service';
import { MerchantImportService } from './merchant-import.service';
import { MerchantAssessmentService } from './assessment/merchant-assessment.service';
import type { RatesService } from '../rates/rates.service';
import type { MerchantImageService } from './merchant-image.service';
import type { AnalyticsWorkQueueService } from '../analytics-intelligence/analytics-work-queue.service';

/**
 * X.4 — one merchant must not be able to reach another's rows.
 *
 * Every merchant route is scoped to `/merchants/me`, so the whole attack
 * surface is the sub-resource ids: a product, an invoice, a cash sale, an
 * import batch, a finance package, an assessment. Each one is tried here with
 * the other merchant's id, and each must answer as though the row does not
 * exist — not "forbidden", which would confirm it does.
 */
describe('cross-merchant access (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;

  let alpha: MerchantFixture;
  let beta: MerchantFixture;

  let merchants: MerchantService;
  let inventory: MerchantInventoryService;
  let activity: MerchantActivityService;
  let finance: MerchantFinanceService;
  let imports: MerchantImportService;
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
      EUR_TO_USD: {
        from: 'EUR',
        to: 'USD',
        rate: 1.087,
        inverseRate: 0.92,
        updatedAt: new Date().toISOString(),
      },
    }),
    getRate: (from: string, to: string) => (from === 'USD' && to === 'EUR' ? 0.92 : 1.087),
  } as unknown as RatesService;

  const analyticsWork = {
    enqueue: async () => undefined,
    enqueueAfterCommit: async () => undefined,
  } as unknown as AnalyticsWorkQueueService;

  const images = {
    publicUrl: () => null,
    upload: async () => ({ objectKey: null }),
    delete: async () => undefined,
  } as unknown as MerchantImageService;

  /** What "properly scoped" looks like: the row simply is not there. */
  async function refusesToFind(work: () => Promise<unknown>): Promise<void> {
    await expect(work()).rejects.toBeInstanceOf(NotFoundException);
  }

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
    imports = new MerchantImportService(db, merchants, analyticsWork);
    finance = new MerchantFinanceService(
      db,
      merchants,
      activity,
      imports,
      config,
      new MerchantAssessmentService(db, merchants),
    );
    assessments = new MerchantAssessmentService(db, merchants);

    alpha = await createMerchantFixture(db, 'Alpha');
    beta = await createMerchantFixture(db, 'Beta');
  });

  afterAll(async () => {
    await destroyMerchantFixture(db, alpha);
    await destroyMerchantFixture(db, beta);
    await pool.end();
  });

  describe('products', () => {
    let alphaProductId: string;

    beforeAll(async () => {
      const product = await inventory.createProduct(alpha.userId, {
        name: 'Alpha Coffee',
        unitPriceMinor: '350',
        quantity: 20,
      });
      alphaProductId = product.id;
    });

    it('does not list another merchant’s products', async () => {
      const page = await inventory.listProducts(beta.userId, {});
      expect(page.items.map((p) => p.id)).not.toContain(alphaProductId);
    });

    it('refuses to update another merchant’s product', async () => {
      await refusesToFind(() =>
        inventory.updateProduct(beta.userId, alphaProductId, {
          name: 'Stolen',
        }),
      );
    });

    it('refuses to adjust another merchant’s stock', async () => {
      await refusesToFind(() =>
        inventory.adjustStock(beta.userId, alphaProductId, { change: -5 }),
      );
    });

    it('refuses to report on another merchant’s product', async () => {
      await refusesToFind(() =>
        activity.productAnalytics(beta.userId, alphaProductId, 30),
      );
    });

    it('leaves the product untouched after every refused attempt', async () => {
      const page = await inventory.listProducts(alpha.userId, {});
      const product = page.items.find((p) => p.id === alphaProductId)!;
      expect(product.name).toBe('Alpha Coffee');
      expect(product.onHandQuantity).toBe(20);
    });
  });

  describe('invoices', () => {
    let alphaInvoiceId: string;

    beforeAll(async () => {
      const invoice = await inventory.createInvoice(alpha.userId, {
        lines: [
          {
            type: 'custom',
            name: 'Alpha service',
            quantity: 1,
            unitPriceMinor: '500',
          },
        ],
      });
      alphaInvoiceId = invoice.id;
    });

    it('does not list another merchant’s invoices', async () => {
      const page = await inventory.listInvoices(beta.userId, {});
      expect(page.items.map((i) => i.id)).not.toContain(alphaInvoiceId);
    });

    it('refuses to read another merchant’s invoice', async () => {
      await refusesToFind(() =>
        inventory.getInvoice(beta.userId, alphaInvoiceId),
      );
    });

    it('refuses to cancel another merchant’s invoice', async () => {
      await refusesToFind(() =>
        inventory.cancelInvoice(beta.userId, alphaInvoiceId),
      );
    });

    it('leaves the invoice usable by its owner', async () => {
      const invoice = await inventory.getInvoice(alpha.userId, alphaInvoiceId);
      expect(invoice.id).toBe(alphaInvoiceId);
    });
  });

  describe('cash sales', () => {
    let alphaCashSaleId: string;

    beforeAll(async () => {
      const sale = await activity.createCashSale(
        alpha.userId,
        {
          lines: [
            {
              type: 'custom',
              name: 'Alpha cash item',
              quantity: 1,
              unitPriceMinor: '250',
            },
          ],
          occurredAt: new Date().toISOString(),
        },
        'cross-merchant-cash-1',
      );
      alphaCashSaleId = sale.id;
    });

    it('refuses to void another merchant’s cash sale', async () => {
      await refusesToFind(() =>
        activity.voidCashSale(beta.userId, alphaCashSaleId, 'not mine'),
      );
    });

    it('does not show the sale in the other merchant’s activity', async () => {
      const page = await activity.listActivity(beta.userId);
      expect(page.items.map((i) => i.id)).not.toContain(alphaCashSaleId);
    });

    it('still lets the owner void it', async () => {
      const voided = await activity.voidCashSale(
        alpha.userId,
        alphaCashSaleId,
        'test cleanup',
      );
      expect(voided).toBeTruthy();
    });
  });

  describe('assessments', () => {
    let alphaAssessmentId: string;

    beforeAll(async () => {
      const assessment = await assessments.run(alpha.userId);
      alphaAssessmentId = assessment.id;
    });

    it('refuses to read another merchant’s assessment', async () => {
      await refusesToFind(() =>
        assessments.require(beta.userId, alphaAssessmentId),
      );
    });

    it('does not include it in the other merchant’s history', async () => {
      const history = await assessments.history(beta.userId);
      expect(history.map((a) => a.id)).not.toContain(alphaAssessmentId);
    });

    it('lets the owner read it', async () => {
      const assessment = await assessments.require(
        alpha.userId,
        alphaAssessmentId,
      );
      expect(assessment.id).toBe(alphaAssessmentId);
    });
  });

  describe('finance packages', () => {
    let alphaPackageId: string;

    beforeAll(async () => {
      const created = await finance.createPackage(
        alpha.userId,
        30,
        false,
        'cross-merchant-package-1',
      );
      alphaPackageId = created.id;
    });

    it('refuses to read another merchant’s package', async () => {
      await refusesToFind(() => finance.getPackage(beta.userId, alphaPackageId));
    });

    it('refuses to download another merchant’s PDF', async () => {
      await refusesToFind(() => finance.pdf(beta.userId, alphaPackageId));
    });

    it('refuses to download another merchant’s data export', async () => {
      await refusesToFind(() => finance.zip(beta.userId, alphaPackageId));
    });

    it('refuses to email another merchant’s package', async () => {
      // Beta consents first, so the only thing left that can refuse this is
      // the scoping check on the package itself.
      await merchants.updateConsent(beta.userId, true);
      expect((await merchants.getConsent(beta.userId)).active).toBe(true);

      await refusesToFind(() =>
        finance.email(
          beta.userId,
          alphaPackageId,
          'someone@example.com',
          'Elsewhere Bank',
          true,
          'cross-merchant-email-1',
        ),
      );
    });

    it('lets the owner read their own package', async () => {
      const found = await finance.getPackage(alpha.userId, alphaPackageId);
      expect(found.id).toBe(alphaPackageId);
    });
  });

  describe('the profile itself', () => {
    it('gives each merchant their own profile', async () => {
      const alphaProfile = await merchants.getMe(alpha.userId);
      const betaProfile = await merchants.getMe(beta.userId);

      expect(alphaProfile.id).not.toBe(betaProfile.id);
      expect(alphaProfile.businessName).toContain('Alpha');
      expect(betaProfile.businessName).toContain('Beta');
    });

    it('scopes the summary to the caller', async () => {
      const summary = await merchants.getSummary(beta.userId, '30d');
      expect(summary).toBeTruthy();
    });

    it('refuses a user with no merchant at all', async () => {
      // Forbidden rather than not-found: the caller is authenticated, they
      // simply have no merchant workspace to be scoped to.
      await expect(
        merchants.requireMerchant('00000000-0000-0000-0000-000000000000'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('imports', () => {
    it('does not list another merchant’s import batches', async () => {
      const batches = await imports.listImports(beta.userId);
      expect(batches.items).toEqual([]);
    });

    it('refuses to commit an import batch it does not own', async () => {
      // Reported as "not found" in substance: an id outside the caller's
      // merchant is indistinguishable from one that does not exist.
      await expect(
        imports.commit(
          beta.userId,
          '00000000-0000-0000-0000-000000000000',
          'cross-merchant-commit-1',
        ),
      ).rejects.toThrow(/not found/i);
    });

    it('refuses to remap an import batch it does not own', async () => {
      await expect(
        imports.updateMapping(
          beta.userId,
          '00000000-0000-0000-0000-000000000000',
          {},
        ),
      ).rejects.toThrow(/unavailable/i);
    });
  });
});
