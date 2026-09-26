import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import * as schema from '../database/schema';
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
import type { RatesService } from '../rates/rates.service';
import type { MerchantImageService } from './merchant-image.service';
import type { AnalyticsWorkQueueService } from '../analytics-intelligence/analytics-work-queue.service';

/** Inventory table pagination: source split, stable order, page arithmetic. */
describe('product list pagination (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let owner: MerchantFixture;
  let inventory: MerchantInventoryService;

  const rates = { getAll: () => ({}), getRate: () => 1 } as unknown as RatesService;
  const images = { publicUrl: () => null } as unknown as MerchantImageService;
  const analyticsWork = {
    enqueue: async () => undefined,
    enqueueAfterCommit: async () => undefined,
  } as unknown as AnalyticsWorkQueueService;

  const manualNames = ['delta', 'Alpha', 'charlie', 'Bravo', 'echo'];

  beforeAll(async () => {
    const connection = await connectTestDatabase();
    db = connection.db;
    pool = connection.pool;
    const merchants = new MerchantService(db, rates, new ConfigService());
    inventory = new MerchantInventoryService(db, merchants, rates, images, analyticsWork);
    owner = await createMerchantFixture(db, 'Pager');
    for (const name of manualNames)
      await inventory.createProduct(owner.userId, { name, unitPriceMinor: '100', quantity: 5 });
    const imported = await inventory.createProduct(owner.userId, { name: 'Imported beans', unitPriceMinor: '900', quantity: 5 });
    await db.insert(schema.merchantProductSourceMappings).values({
      merchantId: owner.merchantId,
      productId: imported.id,
      sourceName: 'Supplier CSV',
      externalId: 'beans-1',
    });
  });

  afterAll(async () => {
    await destroyMerchantFixture(db, owner);
    await pool.end();
  });

  it('splits manual and imported products on the server', async () => {
    const manual = await inventory.listProducts(owner.userId, { source: 'manual', pageSize: 100 });
    const imported = await inventory.listProducts(owner.userId, { source: 'imported', pageSize: 100 });
    expect(manual.totalItems).toBe(5);
    expect(imported.items.map((p) => p.name)).toEqual(['Imported beans']);
    expect(imported.items[0].sourceNames).toEqual(['Supplier CSV']);
  });

  it('pages in case-insensitive name order', async () => {
    const first = await inventory.listProducts(owner.userId, { source: 'manual', page: 1, pageSize: 2 });
    const third = await inventory.listProducts(owner.userId, { source: 'manual', page: 3, pageSize: 2 });
    expect(first.items.map((p) => p.name)).toEqual(['Alpha', 'Bravo']);
    expect(third.items.map((p) => p.name)).toEqual(['echo']);
    expect(first.totalPages).toBe(3);
  });

  it('keeps a row in place after its stock changes', async () => {
    const before = await inventory.listProducts(owner.userId, { source: 'manual', page: 1, pageSize: 2 });
    const charlie = (await inventory.listProducts(owner.userId, { source: 'manual', query: 'charlie' })).items[0];
    await inventory.adjustStock(owner.userId, charlie.id, { change: 1 });
    const after = await inventory.listProducts(owner.userId, { source: 'manual', page: 1, pageSize: 2 });
    expect(after.items.map((p) => p.id)).toEqual(before.items.map((p) => p.id));
  });
});
