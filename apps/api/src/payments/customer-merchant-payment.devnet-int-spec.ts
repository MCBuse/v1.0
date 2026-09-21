/**
 * F.4 — a customer paying a merchant, on devnet.
 *
 * Every prior claim about this flow rested on the mock provider, which is the
 * finding that opened this plan. This runs it with `TRANSFER_PROVIDER=solana`
 * against the real chain: the customer's Routine wallet pays a merchant
 * invoice, the tokens genuinely move between two freshly created wallets, and
 * the merchant's receipt is checked against what the chain says happened.
 */
// Jest sets NODE_ENV=test, and AppModule tells ConfigModule to ignore the env
// file in that case. `.env` is loaded here instead, before the module graph is
// imported, so the real Stripe and Solana settings are present in process.env
// where ConfigService still reads them.
// eslint-disable-next-line @typescript-eslint/no-require-imports
(require('dotenv') as typeof import('dotenv')).config({
  path: require('node:path').resolve(__dirname, '../../.env'),
});

// Set after the file is loaded, so these win over whatever it contains.
process.env.TRANSFER_PROVIDER = 'solana';
process.env.OPERATION_RUNNER_ENABLED = 'false';
process.env.MERCHANT_ORCHESTRATION_ENABLED = 'false';

import { ConfigService } from '@nestjs/config';
import { and, eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import {
  connectTestDatabase,
  type TestDatabase,
} from '../database/testing/test-database';
import * as schema from '../database/schema';
import { SolanaService } from '../solana/solana.service';
import { TreasuryService } from '../treasury/treasury.service';
import { PaymentsService } from './payments.service';
import { SolanaTransferProvider } from './providers/solana-transfer.provider';
import { PaymentRequestsService } from '../payment-requests/payment-requests.service';
import { UsersService } from '../users/users.service';
import { WalletsService } from '../wallets/wallets.service';
import { MerchantInventoryService } from '../data-capture/merchant-inventory.service';
import { MerchantService } from '../data-capture/merchant.service';
import { MerchantEventsService } from '../merchant-events/merchant-events.service';
import { MerchantPresentationService } from '../merchant-events/merchant-presentation.service';
import { AnalyticsWorkQueueService } from '../analytics-intelligence/analytics-work-queue.service';
import { destroyMerchantFixture } from '../database/testing/merchant-fixture';
import { assertNoCompetingRunner } from '../accounts/testing/assert-exclusive-runner';
import type { RatesService } from '../rates/rates.service';
import type { LedgerService } from '../ledger/ledger.service';
import type { MerchantImageService } from '../data-capture/merchant-image.service';

/** The invoice's face value in EUR cents; what settles depends on the live rate. */
const INVOICE_MINOR = 23n;

describe('customer to merchant payment (devnet)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let payments: PaymentsService;
  let inventory: MerchantInventoryService;
  let merchants: MerchantService;
  let solana: SolanaService;
  let treasury: TreasuryService;

  let customerUserId: string;
  let merchantUserId: string;
  let merchantId: string;
  let productId: string;
  let customerRoutineAddress: string;
  let merchantRoutineAddress: string;
  let customerRoutineWalletId: string;
  let customerWallets: { holding: string; routine: string };
  let merchantWalletIds: { holding: string; routine: string };
  /** Read from the created invoice: the rate is live, so this is not assumed. */
  let settlementBaseUnits: bigint;
  let invoiceId: string;
  let invoiceNonce: string;
  const walletIds: string[] = [];
  const userIds: string[] = [];
  const requestIds: string[] = [];

  async function fund(address: string, baseUnits: bigint) {
    const result = await treasury.sendUsdcTo(address, baseUnits);
    if (result.status !== 'completed')
      throw new Error(`Could not fund ${address}: ${result.status}`);
    return result.signature;
  }

  async function onChain(address: string): Promise<bigint> {
    const mint = process.env.SOLANA_USDC_MINT!;
    const read = await solana.readTokenBalance(address, mint);
    if (read.baseUnits === null)
      throw new Error(`Could not read ${address}: ${read.reason}`);
    return read.baseUnits;
  }

  beforeAll(async () => {
    await assertNoCompetingRunner();

    const connection = await connectTestDatabase();
    db = connection.db;
    pool = connection.pool;

    // Wired by hand rather than booting the whole application: AppModule
    // starts the recovery runner, the chain watcher, the rates cron and the
    // payment reconciliation loop, none of which this suite wants, and whose
    // timers keep the process alive after the tests finish.
    const config = new ConfigService();
    solana = new SolanaService(config, db);
    solana.onModuleInit();
    treasury = new TreasuryService(config, solana);
    treasury.onModuleInit();

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

    merchants = new MerchantService(db, rates, config);
    const analyticsWork = new AnalyticsWorkQueueService(db);
    inventory = new MerchantInventoryService(
      db,
      merchants,
      rates,
      { publicUrl: () => null } as unknown as MerchantImageService,
      analyticsWork,
    );
    const wallets = new WalletsService(
      db,
      solana,
      null as unknown as LedgerService,
    );
    const paymentRequests = new PaymentRequestsService(
      db,
      wallets,
      inventory,
    );
    const events = new MerchantEventsService(db, config);
    payments = new PaymentsService(
      db,
      new SolanaTransferProvider(solana, treasury),
      paymentRequests,
      new UsersService(db),
      inventory,
      new MerchantPresentationService(db, events),
      analyticsWork,
      config,
    );

    if (!treasury.isConfigured)
      throw new Error('SOLANA_TREASURY_SECRET_KEY must be set for devnet tests');

    const suffix = randomUUID().slice(0, 8);

    // Two people, each with a real pair of wallets sealed the way the platform
    // seals them. Nothing here is a fixture address.
    for (const role of ['customer', 'merchant'] as const) {
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `${role}-f4-${suffix}@mcbuse.test`,
          passwordHash: 'integration-test-not-a-real-hash',
          firstName: role,
          lastName: 'Devnet',
          username: `${role}f4${suffix}`,
          isEmailVerified: true,
        })
        .returning({ id: schema.users.id });
      userIds.push(user.id);
      if (role === 'customer') customerUserId = user.id;
      else merchantUserId = user.id;

      const holding = solana.generateKeypair();
      const routine = solana.generateKeypair();
      const inserted = await db
        .insert(schema.wallets)
        .values([
          {
            userId: user.id,
            type: 'savings',
            solanaPubkey: holding.publicKey,
            encryptedKeypair: holding.encryptedKeypair,
            encryptionKeyVersion: holding.encryptionKeyVersion,
          },
          {
            userId: user.id,
            type: 'routine',
            solanaPubkey: routine.publicKey,
            encryptedKeypair: routine.encryptedKeypair,
            encryptionKeyVersion: routine.encryptionKeyVersion,
          },
        ])
        .returning({
          id: schema.wallets.id,
          type: schema.wallets.type,
          solanaPubkey: schema.wallets.solanaPubkey,
        });
      walletIds.push(...inserted.map((wallet) => wallet.id));

      const routineRow = inserted.find((wallet) => wallet.type === 'routine')!;
      const holdingRow = inserted.find((wallet) => wallet.type === 'savings')!;
      const pair = { holding: holdingRow.id, routine: routineRow.id };
      if (role === 'customer') customerWallets = pair;
      else merchantWalletIds = pair;
      await db.insert(schema.balances).values(
        inserted.flatMap((wallet) => [
          { walletId: wallet.id, currency: 'USDC', available: 0n },
          { walletId: wallet.id, currency: 'EURC' },
        ]),
      );

      if (role === 'customer') {
        customerRoutineAddress = routineRow.solanaPubkey;
        customerRoutineWalletId = routineRow.id;
      }
      if (role === 'merchant') {
        merchantRoutineAddress = routineRow.solanaPubkey;
        const [merchant] = await db
          .insert(schema.merchants)
          .values({
            publicId: `f4${suffix}`,
            businessName: 'Devnet Counter',
            receivingWalletId: routineRow.id,
            timezone: 'Europe/Berlin',
            displayCurrency: 'EUR',
          })
          .returning({ id: schema.merchants.id });
        merchantId = merchant.id;
        await db.insert(schema.merchantMemberships).values({
          merchantId,
          userId: user.id,
          role: 'owner',
        });
      }
    }

    const [product] = await db
      .insert(schema.merchantProducts)
      .values({
        merchantId,
        name: 'Devnet coffee',
        category: 'Hot Drinks',
        unitPriceMinor: INVOICE_MINOR,
        onHandQuantity: 10,
        reservedQuantity: 0,
        lowStockThreshold: 2,
      })
      .returning({ id: schema.merchantProducts.id });
    productId = product.id;

    // The invoice is created here so the settlement amount can be read from it:
    // the conversion uses the live rate, so hard-coding it would make this
    // suite fail whenever the euro moves.
    const invoice = await inventory.createInvoice(merchantUserId, {
      lines: [{ type: 'product', productId, quantity: 1 }],
    });
    invoiceId = invoice.id;
    requestIds.push(invoice.id);

    const [request] = await db
      .select({
        nonce: schema.paymentRequests.nonce,
        amount: schema.paymentRequests.amount,
      })
      .from(schema.paymentRequests)
      .where(eq(schema.paymentRequests.id, invoice.id));
    invoiceNonce = request.nonce;
    if (request.amount === null)
      throw new Error('The invoice has no settlement amount');
    settlementBaseUnits = request.amount;

    // The customer needs both: tokens on chain to send, and a ledger balance
    // the platform will let them spend.
    await db
      .update(schema.balances)
      .set({ available: settlementBaseUnits })
      .where(
        and(
          eq(schema.balances.walletId, customerRoutineWalletId),
          eq(schema.balances.currency, 'USDC'),
        ),
      );
    await fund(customerRoutineAddress, settlementBaseUnits);
  }, 300_000);

  afterAll(async () => {
    // The merchant side goes through the shared teardown, which knows about
    // every table that points at a merchant — including the analytics work the
    // payment enqueued, which is what a hand-written teardown forgets.
    await destroyMerchantFixture(db, {
      label: 'devnet-merchant',
      userId: merchantUserId,
      merchantId,
      holdingWalletId: merchantWalletIds.holding,
      routineWalletId: merchantWalletIds.routine,
    });

    const customerWalletIds = [
      customerWallets.holding,
      customerWallets.routine,
    ];
    await db
      .delete(schema.ledgerEntries)
      .where(inArray(schema.ledgerEntries.debitWalletId, customerWalletIds));
    await db
      .delete(schema.ledgerEntries)
      .where(inArray(schema.ledgerEntries.creditWalletId, customerWalletIds));
    await db
      .delete(schema.balances)
      .where(inArray(schema.balances.walletId, customerWalletIds));
    await db
      .delete(schema.wallets)
      .where(inArray(schema.wallets.id, customerWalletIds));
    await db
      .delete(schema.auditLogs)
      .where(eq(schema.auditLogs.userId, customerUserId));
    await db.delete(schema.users).where(eq(schema.users.id, customerUserId));
    await pool.end();
  }, 300_000);

  it('moves real tokens from the customer to the merchant and matches the receipt', async () => {
    const customerBefore = await onChain(customerRoutineAddress);
    const merchantBefore = await onChain(merchantRoutineAddress);

    const result = await payments.execute(customerUserId, {
      idempotencyKey: randomUUID(),
      nonce: invoiceNonce,
    });

    // A real signature, not a mock marker.
    expect(result.txSignature).toBeTruthy();
    expect(result.txSignature).not.toMatch(/^mock/i);
    process.stdout.write(`F.4 devnet signature: ${result.txSignature}\n`);

    // Verified by asking the chain, not by trusting our own status column.
    const customerAfter = await onChain(customerRoutineAddress);
    const merchantAfter = await onChain(merchantRoutineAddress);
    expect(customerBefore - customerAfter).toBe(settlementBaseUnits);
    expect(merchantAfter - merchantBefore).toBe(settlementBaseUnits);

    // Asked of the chain, not read from our own status column.
    const status = await treasury.statusOf(result.txSignature!);
    expect(status).toBe('finalized');
  }, 300_000);

  it('records a merchant receipt that agrees with what moved', async () => {
    const [transaction] = await db
      .select()
      .from(schema.merchantTransactions)
      .where(
        and(
          eq(schema.merchantTransactions.merchantId, merchantId),
          inArray(schema.merchantTransactions.paymentRequestId, requestIds),
        ),
      );

    expect(transaction).toBeDefined();
    expect(transaction.status).toBe('finalized');
    expect(transaction.settlementAmount).toBe(settlementBaseUnits);
    expect(transaction.displayAmountMinor).toBe(INVOICE_MINOR);
    // The chain is real, so this is not synthetic evidence.
    expect(transaction.evidenceEnvironment).not.toBe('synthetic');
  }, 120_000);

  it('credits the merchant ledger exactly once', async () => {
    const merchantWalletIds = (
      await db
        .select({ id: schema.wallets.id })
        .from(schema.wallets)
        .where(eq(schema.wallets.userId, merchantUserId))
    ).map((row) => row.id);

    const entries = await db
      .select({ amount: schema.ledgerEntries.amount })
      .from(schema.ledgerEntries)
      .where(inArray(schema.ledgerEntries.creditWalletId, merchantWalletIds));

    expect(entries).toHaveLength(1);
    expect(entries[0].amount).toBe(settlementBaseUnits);
  }, 120_000);

  it('consumes the reserved stock on payment', async () => {
    const [product] = await db
      .select({
        onHandQuantity: schema.merchantProducts.onHandQuantity,
        reservedQuantity: schema.merchantProducts.reservedQuantity,
      })
      .from(schema.merchantProducts)
      .where(eq(schema.merchantProducts.id, productId));

    expect(product.onHandQuantity).toBe(9);
    expect(product.reservedQuantity).toBe(0);
  }, 120_000);

  it('shows the sale in the merchant history with its settlement figures', async () => {
    const history = await merchants.listTransactions(merchantUserId, {
      page: 1,
      pageSize: 20,
    });

    expect(history.items).toHaveLength(1);
    const receipt = history.items[0];
    expect(receipt.settlement.amount).toBe(settlementBaseUnits.toString());
    expect(receipt.settlement.currency).toBe('USDC');
    expect(receipt.stockImpact.unitsSold).toBe(1);
  }, 120_000);
});
