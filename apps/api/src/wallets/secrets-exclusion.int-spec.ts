import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import pinoHttp from 'pino-http';
import { eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import {
  connectTestDatabase,
  type TestDatabase,
} from '../database/testing/test-database';
import * as schema from '../database/schema';
import { SolanaService } from '../solana/solana.service';
import { WalletsService } from './wallets.service';
import { AccountWalletsService } from '../accounts/account-wallets.service';
import { AccountSummaryService } from '../accounts/account-summary.service';
import { FinancialOperationsService } from '../financial-operations/financial-operations.service';
import { MoneyAuditService } from '../financial-operations/money-audit.service';
import { createPinoHttpOptions } from '../logging/http-logger.config';
import type { LoggableRequest, LoggableResponse } from '../logging/http-logger.config';
import type { RatesService } from '../rates/rates.service';
import type { LedgerService } from '../ledger/ledger.service';

/**
 * X.12 — nothing that can move money leaves the process.
 *
 * The wallet here is sealed with the platform's real encryption, so the string
 * being hunted for is the genuine article rather than a placeholder. Every
 * read path a client or an operator can reach is then serialized and searched.
 */
describe('secrets are excluded from responses and logs (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let solana: SolanaService;
  let wallets: WalletsService;
  let accountWallets: AccountWalletsService;
  let summary: AccountSummaryService;
  let operations: FinancialOperationsService;
  let audit: MoneyAuditService;

  let userId: string;
  let holdingWalletId: string;
  let routineWalletId: string;
  let sealedHolding: string;
  let sealedRoutine: string;
  let secretKeyBase58: string;
  const operationIds: string[] = [];

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

  /** Everything a leak could look like, in every encoding we store or send. */
  function forbiddenStrings(): string[] {
    return [sealedHolding, sealedRoutine, secretKeyBase58];
  }

  function assertClean(label: string, value: unknown): void {
    const serialized = JSON.stringify(value, (_key, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    );
    for (const secret of forbiddenStrings()) {
      if (serialized?.includes(secret)) {
        throw new Error(`${label} leaked wallet key material`);
      }
    }
    expect(serialized ?? '').not.toMatch(/encryptedKeypair/);
    expect(serialized ?? '').not.toMatch(/secretKey/);
  }

  beforeAll(async () => {
    const connection = await connectTestDatabase();
    db = connection.db;
    pool = connection.pool;

    const config = new ConfigService();
    solana = new SolanaService(config);
    solana.onModuleInit();

    wallets = new WalletsService(
      db,
      solana,
      null as unknown as LedgerService,
    );
    accountWallets = new AccountWalletsService(db);
    summary = new AccountSummaryService(db, accountWallets, rates);
    operations = new FinancialOperationsService(db);
    audit = new MoneyAuditService(db);

    const suffix = randomUUID().slice(0, 8);
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `secrets-${suffix}@mcbuse.test`,
        passwordHash: 'integration-test-not-a-real-hash',
        firstName: 'Secret',
        lastName: 'Sweep',
        username: `secrets${suffix}`,
      })
      .returning({ id: schema.users.id });
    userId = user.id;

    // Sealed by the platform's own encryption, not a placeholder string.
    const holdingKey = solana.generateKeypair();
    const routineKey = solana.generateKeypair();
    sealedHolding = holdingKey.encryptedKeypair;
    sealedRoutine = routineKey.encryptedKeypair;
    secretKeyBase58 = Buffer.from(
      solana.decryptKeypair(sealedHolding).secretKey,
    ).toString('base64');

    const inserted = await db
      .insert(schema.wallets)
      .values([
        {
          userId,
          type: 'savings',
          solanaPubkey: holdingKey.publicKey,
          encryptedKeypair: sealedHolding,
          encryptionKeyVersion: holdingKey.encryptionKeyVersion,
        },
        {
          userId,
          type: 'routine',
          solanaPubkey: routineKey.publicKey,
          encryptedKeypair: sealedRoutine,
          encryptionKeyVersion: routineKey.encryptionKeyVersion,
        },
      ])
      .returning({ id: schema.wallets.id, type: schema.wallets.type });
    holdingWalletId = inserted.find((w) => w.type === 'savings')!.id;
    routineWalletId = inserted.find((w) => w.type === 'routine')!.id;

    await db.insert(schema.balances).values([
      { walletId: holdingWalletId, currency: 'USDC', available: 5_000_000n },
      { walletId: holdingWalletId, currency: 'EURC' },
      { walletId: routineWalletId, currency: 'USDC', available: 1_000_000n },
      { walletId: routineWalletId, currency: 'EURC' },
    ]);

    const { operation } = await operations.begin({
      userId,
      kind: 'internal_transfer',
      idempotencyKey: `secrets-${suffix}`,
      amountBaseUnits: 250_000n,
      currency: 'USDC',
      sourceWalletId: holdingWalletId,
      destinationWalletId: routineWalletId,
      displayAmountMinor: 25n,
      displayCurrency: 'USD',
      metadata: { from: 'holding', to: 'routine' },
    });
    operationIds.push(operation.id);

    await audit.signature({
      userId,
      operationId: operation.id,
      operationKind: 'internal_transfer',
      walletId: holdingWalletId,
      walletAddress: holdingKey.publicKey,
      keyVersion: holdingKey.encryptionKeyVersion,
      chainSignature: 'sig-for-the-sweep',
      amountBaseUnits: 250_000n,
      currency: 'USDC',
      feePayerAddress: 'treasury',
    });
  });

  afterAll(async () => {
    if (operationIds.length) {
      await db
        .delete(schema.financialOperationEvents)
        .where(
          inArray(schema.financialOperationEvents.operationId, operationIds),
        );
      await db
        .delete(schema.financialOperations)
        .where(inArray(schema.financialOperations.id, operationIds));
    }
    await db.delete(schema.auditLogs).where(eq(schema.auditLogs.userId, userId));
    await db
      .delete(schema.balances)
      .where(
        inArray(schema.balances.walletId, [holdingWalletId, routineWalletId]),
      );
    await db
      .delete(schema.wallets)
      .where(inArray(schema.wallets.id, [holdingWalletId, routineWalletId]));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await pool.end();
  });

  it('the sealed key really is in the database, so the sweep is meaningful', async () => {
    const [row] = await db
      .select({ encryptedKeypair: schema.wallets.encryptedKeypair })
      .from(schema.wallets)
      .where(eq(schema.wallets.id, holdingWalletId));
    expect(row.encryptedKeypair).toBe(sealedHolding);
    expect(sealedHolding.length).toBeGreaterThan(20);
  });

  it('GET /wallets carries no key material', async () => {
    assertClean('findByUserId', await wallets.findByUserId(userId));
  });

  it('GET /wallets/:type/balance carries no key material', async () => {
    assertClean('getBalance', await wallets.getBalance(userId, 'savings', 'USDC'));
  });

  it('GET /accounts carries no key material', async () => {
    assertClean('accounts summary', await summary.forUser(userId));
  });

  it('the operations list carries no key material', async () => {
    assertClean('operations', await operations.listForUser(userId, 50));
  });

  it('the audit trail carries no key material', async () => {
    const rows = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.userId, userId));
    expect(rows.length).toBeGreaterThan(0);
    assertClean('audit logs', rows);
  });

  it('a wallet resolved for signing keeps the key out of anything serialized', async () => {
    const record = await accountWallets.signingRecord(holdingWalletId);
    // The signing path is the one place the sealed key is legitimately loaded.
    expect(record.encryptedKeypair).toBe(sealedHolding);
    // It must not reach a response, which is why no controller returns this type.
    const { encryptedKeypair, ...publicView } = record;
    expect(encryptedKeypair).toBeDefined();
    assertClean('signing record public view', publicView);
  });

  it('the HTTP logger writes neither the token nor the body', () => {
    const lines: string[] = [];
    const logger = pinoHttp(createPinoHttpOptions(false), {
      write: (line: string) => lines.push(line),
    });
    const req = {
      headers: { authorization: `Bearer ${secretKeyBase58}` },
      id: randomUUID(),
      method: 'POST',
      url: '/api/v1/wallets/transfer',
    } as unknown as LoggableRequest;
    (req as LoggableRequest & { body: unknown }).body = {
      encryptedKeypair: sealedHolding,
    };
    const res = Object.assign(new EventEmitter(), {
      locals: {},
      setHeader: jest.fn(),
      statusCode: 200,
    }) as unknown as LoggableResponse & EventEmitter;

    logger(req, res as unknown as LoggableResponse);
    res.emit('finish');

    expect(lines).toHaveLength(1);
    assertClean('http log line', lines[0]);
  });
});
