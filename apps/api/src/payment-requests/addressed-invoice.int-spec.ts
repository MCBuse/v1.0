import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
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
import { MerchantService } from '../data-capture/merchant.service';
import { MerchantInventoryService } from '../data-capture/merchant-inventory.service';
import type { RatesService } from '../rates/rates.service';
import type { MerchantImageService } from '../data-capture/merchant-image.service';
import type { AnalyticsWorkQueueService } from '../analytics-intelligence/analytics-work-queue.service';
import type { WalletsService } from '../wallets/wallets.service';
import { UsersService } from '../users/users.service';
import { PaymentRequestsService } from './payment-requests.service';

/**
 * Invoices sent to a @username: only the named payer can see or pay them,
 * they show up in that payer's incoming list, and only they may stay open
 * longer than a day.
 */
describe('invoices addressed to a username (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let merchant: MerchantFixture;
  let payer: MerchantFixture;
  let stranger: MerchantFixture;
  let payerUsername: string;

  let users: UsersService;
  let inventory: MerchantInventoryService;
  let paymentRequests: PaymentRequestsService;

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
    getRate: () => 1,
  } as unknown as RatesService;

  const customLine = [
    {
      type: 'custom' as const,
      name: 'Consulting',
      quantity: 1,
      unitPriceMinor: '1500',
    },
  ];

  beforeAll(async () => {
    ({ db, pool } = await connectTestDatabase());
    const merchants = new MerchantService(db, rates, new ConfigService());
    inventory = new MerchantInventoryService(
      db,
      merchants,
      rates,
      { publicUrl: () => null } as unknown as MerchantImageService,
      {
        enqueue: () => Promise.resolve(undefined),
        enqueueAfterCommit: () => Promise.resolve(undefined),
      } as unknown as AnalyticsWorkQueueService,
    );
    users = new UsersService(db);

    merchant = await createMerchantFixture(db, 'Seller');
    payer = await createMerchantFixture(db, 'Payer');
    stranger = await createMerchantFixture(db, 'Stranger');
    const [row] = await db
      .select({ username: schema.users.username })
      .from(schema.users)
      .where(eq(schema.users.id, payer.userId));
    payerUsername = row.username;

    const routineFor: Record<string, string> = {
      [merchant.userId]: merchant.routineWalletId,
    };
    paymentRequests = new PaymentRequestsService(
      db,
      {
        findByUserId: (userId: string) =>
          Promise.resolve({ routine: { id: routineFor[userId] } }),
      } as unknown as WalletsService,
      inventory,
      users,
    );
  });

  afterAll(async () => {
    // Personal requests are not merchant rows, so the fixture cleanup misses them.
    await db
      .delete(schema.paymentRequests)
      .where(
        and(
          eq(schema.paymentRequests.creatorWalletId, merchant.routineWalletId),
          isNull(schema.paymentRequests.merchantId),
        ),
      );
    for (const fixture of [merchant, payer, stranger]) {
      await destroyMerchantFixture(db, fixture);
    }
    await pool.end();
  });

  describe('finding the payer', () => {
    it('accepts the username with an @ and in any case', async () => {
      await expect(
        users.findPayer(`@${payerUsername.toUpperCase()}`, merchant.userId),
      ).resolves.toEqual({ id: payer.userId, username: payerUsername });
    });

    it('rejects an unknown username', async () => {
      await expect(
        users.findPayer('nobody_here_123', merchant.userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects addressing an invoice to yourself', async () => {
      await expect(
        users.findPayer(payerUsername, payer.userId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('merchant invoices', () => {
    it('stores the payer, reports the username and allows seven days', async () => {
      const invoice = await inventory.createInvoice(
        merchant.userId,
        { lines: customLine, expiresInSeconds: 604800 },
        { id: payer.userId, username: payerUsername },
      );

      expect(invoice.payerUsername).toBe(payerUsername);
      const listed = await inventory.listInvoices(merchant.userId, {
        status: 'open',
      });
      expect(listed.items.find((i) => i.id === invoice.id)?.payerUsername).toBe(
        payerUsername,
      );
      expect(
        (await inventory.getInvoice(merchant.userId, invoice.id)).payerUsername,
      ).toBe(payerUsername);

      const incoming = await paymentRequests.listIncoming(payer.userId);
      expect(incoming.find((r) => r.id === invoice.id)).toMatchObject({
        invoiceNumber: invoice.invoiceNumber,
        from: { displayName: 'Seller Shop' },
      });
    });

    it('keeps unaddressed invoices to at most 24 hours', async () => {
      await expect(
        inventory.createInvoice(merchant.userId, {
          lines: customLine,
          expiresInSeconds: 604800,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('personal invoices', () => {
    let nonce: string;
    let id: string;

    beforeAll(async () => {
      const created = await paymentRequests.create(merchant.userId, {
        type: 'dynamic',
        amount: '2500000',
        currency: 'USDC',
        payerUsername: `@${payerUsername}`,
        expiresInSeconds: 86400,
      });
      ({ nonce, id } = created);
      expect(created.payerUsername).toBe(payerUsername);
    });

    it('resolves for the payer', async () => {
      await expect(
        paymentRequests.resolve(nonce, payer.userId),
      ).resolves.toMatchObject({
        id,
      });
    });

    it('refuses anyone else, and unauthenticated (NFC) lookups', async () => {
      await expect(
        paymentRequests.resolve(nonce, stranger.userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        paymentRequests.resolveForExecution(nonce, stranger.userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(paymentRequests.resolve(nonce, null)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('appears only in the payer’s incoming list', async () => {
      expect(
        (await paymentRequests.listIncoming(payer.userId)).map((r) => r.id),
      ).toContain(id);
      expect(
        (await paymentRequests.listIncoming(stranger.userId)).map((r) => r.id),
      ).not.toContain(id);
    });

    it('drops out of the incoming list once cancelled', async () => {
      await paymentRequests.cancel(merchant.userId, id);
      expect(
        (await paymentRequests.listIncoming(payer.userId)).map((r) => r.id),
      ).not.toContain(id);
    });
  });
});
