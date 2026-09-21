import { ConfigService } from '@nestjs/config';
import { eq, inArray } from 'drizzle-orm';
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
import type { RatesService } from '../rates/rates.service';
import type { MerchantImageService } from './merchant-image.service';
import type { AnalyticsWorkQueueService } from '../analytics-intelligence/analytics-work-queue.service';

/**
 * V.12 — the product's category is captured on the sale line at the time of
 * the sale.
 *
 * The behaviour that matters is what happens afterwards: re-categorising a
 * product must not rewrite what last month's sales were recorded as.
 */
describe('sale line category snapshot (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let merchant: MerchantFixture;
  let merchants: MerchantService;
  let inventory: MerchantInventoryService;
  let activity: MerchantActivityService;

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

  const images = {
    publicUrl: () => null,
  } as unknown as MerchantImageService;

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

    merchant = await createMerchantFixture(db, 'Category');
  });

  afterAll(async () => {
    await destroyMerchantFixture(db, merchant);
    await pool.end();
  });

  async function createProduct(name: string, category: string) {
    return inventory.createProduct(merchant.userId, {
      name,
      category,
      unitPriceMinor: '400',
      quantity: 50,
    });
  }

  it('records the category on a cash sale line', async () => {
    const product = await createProduct('Espresso', 'Hot Drinks');

    const sale = await activity.createCashSale(
      merchant.userId,
      {
        lines: [{ type: 'product', productId: product.id, quantity: 2 }],
        occurredAt: new Date(Date.now() - 60_000).toISOString(),
      },
      `cat-cash-${product.id}`,
    );

    const [line] = await db
      .select({ category: schema.merchantCashSaleItems.category })
      .from(schema.merchantCashSaleItems)
      .where(eq(schema.merchantCashSaleItems.cashSaleId, sale.id));

    expect(line.category).toBe('Hot Drinks');
  });

  it('records the category on an invoice line', async () => {
    const product = await createProduct('Latte', 'Hot Drinks');

    const invoice = await inventory.createInvoice(merchant.userId, {
      lines: [{ type: 'product', productId: product.id, quantity: 1 }],
    });

    const [line] = await db
      .select({ category: schema.merchantInvoiceItems.category })
      .from(schema.merchantInvoiceItems)
      .where(eq(schema.merchantInvoiceItems.paymentRequestId, invoice.id));

    expect(line.category).toBe('Hot Drinks');
  });

  it('keeps the recorded category when the product is re-categorised later', async () => {
    const product = await createProduct('Cold Brew', 'Hot Drinks');
    const sale = await activity.createCashSale(
      merchant.userId,
      {
        lines: [{ type: 'product', productId: product.id, quantity: 1 }],
        occurredAt: new Date(Date.now() - 60_000).toISOString(),
      },
      `cat-recat-${product.id}`,
    );

    await inventory.updateProduct(merchant.userId, product.id, {
      category: 'Cold Drinks',
    });

    const [line] = await db
      .select({ category: schema.merchantCashSaleItems.category })
      .from(schema.merchantCashSaleItems)
      .where(eq(schema.merchantCashSaleItems.cashSaleId, sale.id));

    // The sale happened while it was a hot drink, and still says so.
    expect(line.category).toBe('Hot Drinks');
    const current = await inventory.listProducts(merchant.userId, {});
    expect(
      current.items.find((p) => p.id === product.id)!.category,
    ).toBe('Cold Drinks');
  });

  it('leaves a custom line without a category rather than inventing one', async () => {
    const sale = await activity.createCashSale(
      merchant.userId,
      {
        lines: [
          {
            type: 'custom',
            name: 'One-off item',
            quantity: 1,
            unitPriceMinor: '300',
          },
        ],
        occurredAt: new Date(Date.now() - 60_000).toISOString(),
      },
      'cat-custom-line',
    );

    const [line] = await db
      .select({ category: schema.merchantCashSaleItems.category })
      .from(schema.merchantCashSaleItems)
      .where(eq(schema.merchantCashSaleItems.cashSaleId, sale.id));

    expect(line.category).toBeNull();
  });

  it('records a null category for a product that has none', async () => {
    const product = await inventory.createProduct(merchant.userId, {
      name: 'Uncategorised thing',
      unitPriceMinor: '200',
      quantity: 5,
    });

    const sale = await activity.createCashSale(
      merchant.userId,
      {
        lines: [{ type: 'product', productId: product.id, quantity: 1 }],
        occurredAt: new Date(Date.now() - 60_000).toISOString(),
      },
      `cat-none-${product.id}`,
    );

    const [line] = await db
      .select({ category: schema.merchantCashSaleItems.category })
      .from(schema.merchantCashSaleItems)
      .where(eq(schema.merchantCashSaleItems.cashSaleId, sale.id));

    expect(line.category).toBeNull();
  });
});
