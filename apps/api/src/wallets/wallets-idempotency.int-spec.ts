import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
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
import { WalletsService } from './wallets.service';
import { FinancialOperationsService } from '../financial-operations/financial-operations.service';
import { OperationLedgerService } from '../financial-operations/operation-ledger.service';
import { operationFingerprint } from '../financial-operations/operation-fingerprint';
import { MoneyAuditService } from '../financial-operations/money-audit.service';
import { AccountWalletsService } from '../accounts/account-wallets.service';
import { AccountTransferService } from '../accounts/account-transfer.service';

describe('legacy transfer compatibility through durable operations', () => {
  let db: TestDatabase;
  let pool: Pool;
  let merchant: MerchantFixture;
  let service: WalletsService;
  let operations: FinancialOperationsService;
  let transfers: AccountTransferService;
  const move = (amount: string) => ({
    fromWalletType: 'savings',
    toWalletType: 'routine',
    currency: 'USDC',
    amount,
  });
  beforeAll(async () => {
    ({ db, pool } = await connectTestDatabase());
    operations = new FinancialOperationsService(db);
    transfers = new AccountTransferService(
      null as never,
      new ConfigService(),
      null as never,
      operations,
      new OperationLedgerService(db),
      new AccountWalletsService(db),
      new MoneyAuditService(db),
    );
    service = new WalletsService(db, null as never, null as never, transfers);
  });
  beforeEach(async () => {
    merchant = await createMerchantFixture(db, 'Legacy');
    await db
      .update(schema.balances)
      .set({ available: 10000000n })
      .where(
        and(
          eq(schema.balances.walletId, merchant.holdingWalletId),
          eq(schema.balances.currency, 'USDC'),
        ),
      );
  });
  afterEach(async () => {
    await db
      .delete(schema.auditLogs)
      .where(eq(schema.auditLogs.userId, merchant.userId));
    await destroyMerchantFixture(db, merchant);
  });
  afterAll(async () => pool.end());
  async function pending(amount: string, key: string) {
    try {
      await service.internalTransfer(merchant.userId, move(amount), key);
      throw Error('False success');
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictException);
      const body = (e as ConflictException).getResponse() as {
        code: string;
        operationId: string;
      };
      expect(body.code).toBe('TRANSFER_PENDING');
      return body.operationId;
    }
  }
  it('preserves fractional cents and returns success only after finality', async () => {
    const key = randomUUID();
    const id = await pending('1000001', key);
    const op = await operations.require(id);
    expect(op.amountBaseUnits).toBe(1000001n);
    expect(op.displayAmountMinor).toBeNull();
    await operations.advance(id, 'chain_submitted', {
      chainSignature: 'test-signature',
    });
    await operations.advance(id, 'chain_confirmed', {
      chainStatus: 'finalized',
    });
    await transfers.finalize(await operations.require(id));
    const response = await service.internalTransfer(
      merchant.userId,
      move('1000001'),
      key,
    );
    expect(response.amount).toBe('1000001');
    expect(response.status).toBe('finalized');
    const [balance] = await db
      .select()
      .from(schema.balances)
      .where(
        and(
          eq(schema.balances.walletId, merchant.routineWalletId),
          eq(schema.balances.currency, 'USDC'),
        ),
      );
    expect(balance.available).toBe(1000001n);
  });
  it('coalesces concurrent identical requests into one reservation', async () => {
    const key = randomUUID();
    const ids = await Promise.all(
      Array.from({ length: 4 }, () => pending('3000000', key)),
    );
    expect(new Set(ids).size).toBe(1);
    const [balance] = await db
      .select()
      .from(schema.balances)
      .where(
        and(
          eq(schema.balances.walletId, merchant.holdingWalletId),
          eq(schema.balances.currency, 'USDC'),
        ),
      );
    expect(balance.available).toBe(7000000n);
    expect(balance.pending).toBe(3000000n);
  });
  it('rejects changed inputs under the same key', async () => {
    const key = randomUUID();
    await pending('1000000', key);
    await expect(
      service.internalTransfer(merchant.userId, move('2000000'), key),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects EURC without a ledger fallback', async () => {
    await expect(
      service.internalTransfer(
        merchant.userId,
        { ...move('1'), currency: 'EURC' },
        randomUUID(),
      ),
    ).rejects.toThrow(/USDC/);
  });
  it('does not execute a historical ledger-only transfer again', async () => {
    const key = randomUUID();
    const idempotencyKey = `wallet-transfer:${merchant.userId}:${key}`;
    const fingerprint = operationFingerprint({
      userId: merchant.userId,
      from: 'savings',
      to: 'routine',
      amount: 1000000n,
      currency: 'USDC',
    });
    await db
      .insert(schema.ledgerEntries)
      .values({
        debitWalletId: merchant.holdingWalletId,
        creditWalletId: merchant.routineWalletId,
        amount: 1000000n,
        currency: 'USDC',
        type: 'internal',
        status: 'completed',
        idempotencyKey,
        metadata: JSON.stringify({ fingerprint }),
      });
    await expect(
      service.internalTransfer(merchant.userId, move('1000000'), key),
    ).rejects.toMatchObject({
      response: { code: 'LEGACY_TRANSFER_RECONCILIATION_REQUIRED' },
    });
    expect(
      await operations.findByKey(merchant.userId, idempotencyKey),
    ).toBeNull();
  });
  it('keeps integer units beyond floating point precision exact', async () => {
    const amount = 9007199254740993n;
    await db
      .update(schema.balances)
      .set({ available: amount })
      .where(
        and(
          eq(schema.balances.walletId, merchant.holdingWalletId),
          eq(schema.balances.currency, 'USDC'),
        ),
      );
    const id = await pending(amount.toString(), randomUUID());
    expect((await operations.require(id)).amountBaseUnits).toBe(amount);
  });
});
