import { randomUUID } from 'crypto';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '../schema';
import type { TestDatabase } from './test-database';

export interface MerchantFixture {
  label: string;
  userId: string;
  merchantId: string;
  holdingWalletId: string;
  routineWalletId: string;
}

/**
 * A complete, isolated merchant: a user, both wallets with balances, the
 * merchant record and an owner membership.
 *
 * Built for suites that need two merchants side by side, where the whole point
 * is that one cannot reach the other's rows.
 */
export async function createMerchantFixture(
  db: TestDatabase,
  label: string,
  options: { routineBalance?: bigint; holdingBalance?: bigint } = {},
): Promise<MerchantFixture> {
  const suffix = `${label}${randomUUID().slice(0, 8)}`.toLowerCase();

  const [user] = await db
    .insert(schema.users)
    .values({
      email: `${suffix}@mcbuse.test`,
      passwordHash: 'integration-test-not-a-real-hash',
      firstName: label,
      lastName: 'Merchant',
      username: suffix.replace(/[^a-z0-9]/g, '').slice(0, 20),
    })
    .returning({ id: schema.users.id });

  const wallets = await db
    .insert(schema.wallets)
    .values([
      {
        userId: user.id,
        type: 'savings',
        solanaPubkey: `${suffix}-holding`,
        encryptedKeypair: 'v1:00:00:00',
        encryptionKeyVersion: 'v1',
      },
      {
        userId: user.id,
        type: 'routine',
        solanaPubkey: `${suffix}-routine`,
        encryptedKeypair: 'v1:00:00:00',
        encryptionKeyVersion: 'v1',
      },
    ])
    .returning({ id: schema.wallets.id, type: schema.wallets.type });

  const holdingWalletId = wallets.find((w) => w.type === 'savings')!.id;
  const routineWalletId = wallets.find((w) => w.type === 'routine')!.id;

  await db.insert(schema.balances).values([
    {
      walletId: holdingWalletId,
      currency: 'USDC',
      available: options.holdingBalance ?? 0n,
    },
    { walletId: holdingWalletId, currency: 'EURC' },
    {
      walletId: routineWalletId,
      currency: 'USDC',
      available: options.routineBalance ?? 0n,
    },
    { walletId: routineWalletId, currency: 'EURC' },
  ]);

  const [merchant] = await db
    .insert(schema.merchants)
    .values({
      publicId: `mrc_${suffix}`.slice(0, 24),
      businessName: `${label} Shop`,
      receivingWalletId: routineWalletId,
      timezone: 'Europe/Berlin',
      displayCurrency: 'EUR',
    })
    .returning({ id: schema.merchants.id });

  await db.insert(schema.merchantMemberships).values({
    merchantId: merchant.id,
    userId: user.id,
    role: 'owner',
  });

  return {
    label,
    userId: user.id,
    merchantId: merchant.id,
    holdingWalletId,
    routineWalletId,
  };
}

/** Removes a fixture and everything that references it, in dependency order. */
export async function destroyMerchantFixture(
  db: TestDatabase,
  fixture: MerchantFixture,
): Promise<void> {
  const walletIds = [fixture.holdingWalletId, fixture.routineWalletId];
  const merchantId = fixture.merchantId;

  const operationIds = (
    await db
      .select({ id: schema.financialOperations.id })
      .from(schema.financialOperations)
      .where(eq(schema.financialOperations.userId, fixture.userId))
  ).map((row) => row.id);

  if (operationIds.length) {
    await db
      .delete(schema.financialOperationEvents)
      .where(inArray(schema.financialOperationEvents.operationId, operationIds));
    await db
      .delete(schema.financialOperations)
      .where(inArray(schema.financialOperations.id, operationIds));
  }

  const packageIds = (
    await db
      .select({ id: schema.merchantFinancePackages.id })
      .from(schema.merchantFinancePackages)
      .where(eq(schema.merchantFinancePackages.merchantId, merchantId))
  ).map((row) => row.id);
  if (packageIds.length) {
    await db
      .delete(schema.merchantFinancePackageArtifacts)
      .where(
        inArray(schema.merchantFinancePackageArtifacts.packageId, packageIds),
      );
    await db
      .delete(schema.merchantFinancePackageAssessments)
      .where(
        inArray(schema.merchantFinancePackageAssessments.packageId, packageIds),
      );
  }
  await db
    .delete(schema.merchantFinanceEmailAttempts)
    .where(eq(schema.merchantFinanceEmailAttempts.merchantId, merchantId));
  await db
    .delete(schema.merchantFinancePackages)
    .where(eq(schema.merchantFinancePackages.merchantId, merchantId));
  await db
    .delete(schema.merchantAssessments)
    .where(eq(schema.merchantAssessments.merchantId, merchantId));
  await db
    .delete(schema.merchantAnalyticsWork)
    .where(eq(schema.merchantAnalyticsWork.merchantId, merchantId));
  await db
    .delete(schema.merchantNarrationCache)
    .where(eq(schema.merchantNarrationCache.merchantId, merchantId));
  await db
    .delete(schema.merchantInsights)
    .where(eq(schema.merchantInsights.merchantId, merchantId));
  // merchant_analytics_runs is platform-wide, not per merchant: nothing to do.
  await db
    .delete(schema.merchantAnalyticsSnapshots)
    .where(eq(schema.merchantAnalyticsSnapshots.merchantId, merchantId));
  await db
    .delete(schema.merchantEvents)
    .where(eq(schema.merchantEvents.merchantId, merchantId));
  await db
    .delete(schema.merchantPresentedRequests)
    .where(eq(schema.merchantPresentedRequests.merchantId, merchantId));
  const cashSaleIds = (
    await db
      .select({ id: schema.merchantCashSales.id })
      .from(schema.merchantCashSales)
      .where(eq(schema.merchantCashSales.merchantId, merchantId))
  ).map((row) => row.id);
  if (cashSaleIds.length) {
    await db
      .delete(schema.merchantCashSaleAttachments)
      .where(inArray(schema.merchantCashSaleAttachments.cashSaleId, cashSaleIds));
    await db
      .delete(schema.merchantCashSaleItems)
      .where(inArray(schema.merchantCashSaleItems.cashSaleId, cashSaleIds));
  }
  await db
    .delete(schema.merchantCashSales)
    .where(eq(schema.merchantCashSales.merchantId, merchantId));
  await db
    .delete(schema.merchantTransactions)
    .where(eq(schema.merchantTransactions.merchantId, merchantId));
  await db
    .delete(schema.merchantStockMovements)
    .where(eq(schema.merchantStockMovements.merchantId, merchantId));
  await db
    .delete(schema.merchantProductSourceMappings)
    .where(eq(schema.merchantProductSourceMappings.merchantId, merchantId));
  await db
    .delete(schema.merchantImportBatches)
    .where(eq(schema.merchantImportBatches.merchantId, merchantId));
  // Invoices live in payment_requests; their line items and the merchant
  // transactions and capture exceptions that point at them go first.
  const requestIds = (
    await db
      .select({ id: schema.paymentRequests.id })
      .from(schema.paymentRequests)
      .where(eq(schema.paymentRequests.merchantId, merchantId))
  ).map((row) => row.id);
  if (requestIds.length) {
    await db
      .delete(schema.merchantInvoiceItems)
      .where(inArray(schema.merchantInvoiceItems.paymentRequestId, requestIds));
  }
  await db
    .delete(schema.merchantCaptureExceptions)
    .where(eq(schema.merchantCaptureExceptions.merchantId, merchantId));
  if (requestIds.length) {
    await db
      .delete(schema.merchantPaymentAttempts)
      .where(
        inArray(schema.merchantPaymentAttempts.paymentRequestId, requestIds),
      );
  }
  await db
    .delete(schema.paymentRequests)
    .where(eq(schema.paymentRequests.merchantId, merchantId));
  await db
    .delete(schema.merchantProducts)
    .where(eq(schema.merchantProducts.merchantId, merchantId));
  await db
    .delete(schema.ledgerEntries)
    .where(inArray(schema.ledgerEntries.debitWalletId, walletIds));
  await db
    .delete(schema.ledgerEntries)
    .where(inArray(schema.ledgerEntries.creditWalletId, walletIds));
  await db
    .delete(schema.merchantConsentRecords)
    .where(eq(schema.merchantConsentRecords.merchantId, merchantId));
  await db
    .delete(schema.merchantMemberships)
    .where(eq(schema.merchantMemberships.merchantId, merchantId));
  await db.delete(schema.merchants).where(eq(schema.merchants.id, merchantId));
  await db
    .delete(schema.balances)
    .where(inArray(schema.balances.walletId, walletIds));
  await db.delete(schema.wallets).where(inArray(schema.wallets.id, walletIds));
  await db
    .delete(schema.auditLogs)
    .where(eq(schema.auditLogs.userId, fixture.userId));
  await db.delete(schema.users).where(eq(schema.users.id, fixture.userId));
}
