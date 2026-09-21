import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
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
import type { RatesService } from '../rates/rates.service';

/**
 * Q.13 — the transaction history a merchant can actually work from.
 *
 * Searchable, paginated, and carrying the financial attributes that were
 * previously spread across other screens or simply absent: what settled, what
 * it cost, what stock it moved, and whether an imported settlement record
 * accounts for it.
 */
describe('merchant transaction history (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let merchant: MerchantFixture;
  let merchants: MerchantService;
  const requestIds: string[] = [];
  const transactionIds: string[] = [];
  let productId: string;

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

  beforeAll(async () => {
    const connection = await connectTestDatabase();
    db = connection.db;
    pool = connection.pool;
    merchants = new MerchantService(db, rates, new ConfigService());
    merchant = await createMerchantFixture(db, 'History');

    const [product] = await db
      .insert(schema.merchantProducts)
      .values({
        merchantId: merchant.merchantId,
        name: 'Espresso',
        category: 'Hot Drinks',
        unitPriceMinor: 250n,
        onHandQuantity: 100,
        reservedQuantity: 0,
        lowStockThreshold: 5,
      })
      .returning({ id: schema.merchantProducts.id });
    productId = product.id;

    // Three finalized sales: two with product lines, one without.
    for (let index = 0; index < 3; index += 1) {
      const [request] = await db
        .insert(schema.paymentRequests)
        .values({
          merchantId: merchant.merchantId,
          creatorWalletId: merchant.routineWalletId,
          nonce: randomUUID(),
          type: 'dynamic',
          amount: 500n,
          currency: 'USDC',
          status: 'completed',
          displayAmountMinor: 500n,
          displayCurrency: 'EUR',
          quoteRateScaled: 920_000_000n,
          // Globally unique, so a run that failed teardown does not block the next.
          invoiceNumber:
            index < 2 ? `INV-H-${index}-${randomUUID().slice(0, 8)}` : null,
          expiresAt: new Date(Date.now() + 3_600_000),
        })
        .returning({ id: schema.paymentRequests.id });
      requestIds.push(request.id);

      if (index < 2) {
        await db.insert(schema.merchantInvoiceItems).values([
          {
            paymentRequestId: request.id,
            productId,
            type: 'product',
            name: 'Espresso',
            sku: null,
            category: 'Hot Drinks',
            quantity: 2,
            unitPriceMinor: 250n,
            lineTotalMinor: 500n,
          },
        ]);
      }

      const [entry] = await db
        .insert(schema.ledgerEntries)
        .values({
          debitWalletId: merchant.holdingWalletId,
          creditWalletId: merchant.routineWalletId,
          amount: 500n,
          currency: 'USDC',
          type: 'p2p',
          status: 'completed',
          idempotencyKey: `history-${randomUUID()}`,
        })
        .returning({ id: schema.ledgerEntries.id });

      const [transaction] = await db
        .insert(schema.merchantTransactions)
        .values({
          receiptNumber: `MCB-H${index}-${merchant.merchantId.slice(0, 6)}`,
          merchantId: merchant.merchantId,
          paymentRequestId: request.id,
          ledgerEntryId: entry.id,
          displayAmountMinor: 500n,
          displayCurrency: 'EUR',
          settlementAmount: 5_000_000n,
          settlementCurrency: 'USDC',
          quoteRateScaled: 920_000_000n,
          description: index === 0 ? 'Morning rush' : `Sale ${index}`,
          status: 'finalized',
          evidenceEnvironment: 'test',
          occurredAt: new Date(Date.now() - (index + 1) * 3_600_000),
          finalizedAt: new Date(Date.now() - (index + 1) * 3_600_000),
        })
        .returning({ id: schema.merchantTransactions.id });
      transactionIds.push(transaction.id);
    }
  });

  afterAll(async () => {
    await destroyMerchantFixture(db, merchant);
    await pool.end();
  });

  it('paginates rather than returning everything at once', async () => {
    const page = await merchants.listTransactions(merchant.userId, {
      page: 1,
      pageSize: 2,
    });
    expect(page.items).toHaveLength(2);
    expect(page.totalItems).toBe(3);
    expect(page.totalPages).toBe(2);
  });

  it('searches by description', async () => {
    const page = await merchants.listTransactions(merchant.userId, {
      page: 1,
      pageSize: 20,
      query: 'Morning',
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].description).toBe('Morning rush');
  });

  it('searches by receipt number', async () => {
    const all = await merchants.listTransactions(merchant.userId, {
      page: 1,
      pageSize: 20,
    });
    const receipt = all.items[0].receiptNumber;
    const page = await merchants.listTransactions(merchant.userId, {
      page: 1,
      pageSize: 20,
      query: receipt,
    });
    expect(page.items.map((item) => item.receiptNumber)).toEqual([receipt]);
  });

  it('reports what settled, not only what was displayed', async () => {
    const page = await merchants.listTransactions(merchant.userId, {
      page: 1,
      pageSize: 20,
    });
    expect(page.items[0].settlement).toEqual({
      amount: '5000000',
      currency: 'USDC',
      quoteRateScaled: '920000000',
    });
  });

  it('states the fees explicitly rather than leaving them out', async () => {
    const page = await merchants.listTransactions(merchant.userId, {
      page: 1,
      pageSize: 20,
    });
    expect(page.items[0].fees.merchantFeeMinor).toBe('0');
    expect(page.items[0].fees.networkFeePaidBy).toBe('treasury');
    expect(page.items[0].fees.note).toContain('not deducted from this sale');
  });

  it('reports a net amount that follows from the gross and the fees', async () => {
    const page = await merchants.listTransactions(merchant.userId, {
      page: 1,
      pageSize: 20,
    });
    const item = page.items[0];
    expect(BigInt(item.netAmount.minor)).toBe(
      BigInt(item.amount.minor) - BigInt(item.fees.merchantFeeMinor),
    );
  });

  it('reports the stock a sale moved', async () => {
    const page = await merchants.listTransactions(merchant.userId, {
      page: 1,
      pageSize: 20,
    });
    const withProduct = page.items.find(
      (item) => item.stockImpact.unitsSold !== null,
    )!;
    expect(withProduct.stockImpact.unitsSold).toBe(2);
    expect(withProduct.stockImpact.lines).toBe(1);
    expect(withProduct.stockImpact.note).toBeNull();
  });

  it('says a sale moved no stock rather than reporting zero units', async () => {
    const page = await merchants.listTransactions(merchant.userId, {
      page: 1,
      pageSize: 20,
    });
    const withoutProduct = page.items.find(
      (item) => item.stockImpact.unitsSold === null,
    )!;
    expect(withoutProduct.stockImpact.note).toContain('moved no stock');
  });

  it('does not call a sale unmatched when nothing has been imported', async () => {
    const page = await merchants.listTransactions(merchant.userId, {
      page: 1,
      pageSize: 20,
    });
    for (const item of page.items) {
      expect(item.reconciliation.state).toBe('no_source_records');
      expect(item.reconciliation.note).toContain('nothing to reconcile');
    }
  });

  describe('once settlement records exist', () => {
    let payoutId: string;

    beforeAll(async () => {
      const [batch] = await db
        .insert(schema.merchantImportBatches)
        .values({
          merchantId: merchant.merchantId,
          kind: 'settlement',
          sourceName: 'Test PSP',
          contentHash: randomUUID().replaceAll('-', ''),
          mapping: {},
          rowsJson: [],
          status: 'committed',
          actorUserId: merchant.userId,
        })
        .returning({ id: schema.merchantImportBatches.id });

      const [payout] = await db
        .insert(schema.merchantPayouts)
        .values({
          merchantId: merchant.merchantId,
          sourceName: 'Test PSP',
          externalReference: 'PSP-REF-1',
          currency: 'EUR',
          expectedAmountMinor: 500n,
          actualAmountMinor: 500n,
          providerStatus: 'paid',
          importBatchId: batch.id,
        })
        .returning({ id: schema.merchantPayouts.id });
      payoutId = payout.id;

      await db.insert(schema.merchantPayoutAllocations).values({
        payoutId,
        merchantTransactionId: transactionIds[0],
        paymentReference: 'PSP-REF-1',
        amountMinor: 500n,
      });
    });

    it('matches the sale the settlement record references', async () => {
      const page = await merchants.listTransactions(merchant.userId, {
        page: 1,
        pageSize: 20,
      });
      const matched = page.items.find((item) => item.id === transactionIds[0])!;
      expect(matched.reconciliation.state).toBe('matched');
      expect(matched.reconciliation.reference).toBe('PSP-REF-1');
    });

    it('marks the others unmatched, now that there is something to match against', async () => {
      const page = await merchants.listTransactions(merchant.userId, {
        page: 1,
        pageSize: 20,
      });
      const others = page.items.filter(
        (item) => item.id !== transactionIds[0],
      );
      expect(others).toHaveLength(2);
      for (const item of others) {
        expect(item.reconciliation.state).toBe('unmatched');
      }
    });
  });

  it('carries the evidence environment on every row', async () => {
    const page = await merchants.listTransactions(merchant.userId, {
      page: 1,
      pageSize: 20,
    });
    for (const item of page.items) expect(item.environment).toBe('test');
  });
});
