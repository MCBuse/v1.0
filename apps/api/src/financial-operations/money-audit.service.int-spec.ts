import { eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import {
  connectTestDatabase,
  type TestDatabase,
} from '../database/testing/test-database';
import * as schema from '../database/schema';
import { MoneyAuditService } from './money-audit.service';
import { AuditSecretLeakError, assertNoSecretFields } from './money-audit';

/**
 * The audit trail has to survive a real write: a record that only exists in a
 * unit test proves nothing about what a reviewer would find in the table.
 */
describe('MoneyAuditService (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let audit: MoneyAuditService;
  let userId: string;

  const SEALED_KEY = 'v1:deadbeef:cafebabe:0123456789abcdef';

  beforeAll(async () => {
    const connection = await connectTestDatabase();
    db = connection.db;
    pool = connection.pool;
    audit = new MoneyAuditService(db);

    const suffix = randomUUID().slice(0, 8);
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `audit-${suffix}@mcbuse.test`,
        passwordHash: 'integration-test-not-a-real-hash',
        firstName: 'Audit',
        lastName: 'Trail',
        username: `audit${suffix}`,
      })
      .returning({ id: schema.users.id });
    userId = user.id;
  });

  afterAll(async () => {
    await db.delete(schema.auditLogs).where(eq(schema.auditLogs.userId, userId));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await pool.end();
  });

  async function rows() {
    return db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.userId, userId));
  }

  it('writes an authorization decision a reviewer can read back', async () => {
    const operationId = randomUUID();
    await audit.authorization({
      userId,
      operationKind: 'internal_transfer',
      decision: 'granted',
      subjectType: 'wallet',
      subjectId: null,
      operationId,
      amountBaseUnits: 2_500_000n,
      currency: 'USDC',
    });

    const written = (await rows()).filter(
      (r) => r.action === 'money.authorization.granted',
    );
    expect(written).toHaveLength(1);
    expect(JSON.parse(written[0].metadata!)).toMatchObject({
      operationKind: 'internal_transfer',
      operationId,
      amountBaseUnits: '2500000',
      currency: 'USDC',
    });
  });

  it('writes a refusal with the reason that caused it', async () => {
    await audit.authorization({
      userId,
      operationKind: 'withdrawal_bank',
      decision: 'refused',
      subjectType: 'payout_destination',
      subjectId: null,
      reason: 'destination_ineligible',
    });

    const written = (await rows()).filter(
      (r) => r.action === 'money.authorization.refused',
    );
    expect(written).toHaveLength(1);
    expect(JSON.parse(written[0].metadata!).reason).toBe(
      'destination_ineligible',
    );
  });

  it('writes a signing record carrying no key material', async () => {
    const operationId = randomUUID();
    await audit.signature({
      userId,
      operationId,
      operationKind: 'internal_transfer',
      walletId: randomUUID(),
      walletAddress: '82ihqmVixpNYoqJDrGPSexJ6kV2JP8Mis38pAnzzXqV4',
      keyVersion: 'v1',
      chainSignature: '5Aex8rYvSignature',
      amountBaseUnits: 250_000n,
      currency: 'USDC',
      feePayerAddress: 'treasuryAddress',
    });

    const written = (await rows()).filter(
      (r) => r.action === 'money.signature.created',
    );
    expect(written).toHaveLength(1);
    expect(written[0].entityId).toBe(operationId);
    expect(written[0].metadata).toContain('5Aex8rYvSignature');
    expect(written[0].metadata).toContain('v1');
    expect(written[0].metadata).not.toContain(SEALED_KEY);
  });

  it('never writes a record whose metadata carries key material', async () => {
    const before = (await rows()).length;

    await expect(
      audit.authorization({
        userId,
        operationKind: 'internal_transfer',
        decision: 'granted',
        subjectType: 'wallet',
        subjectId: null,
        // A caller inventing a field the builders do not name.
        ...({ encryptedKeypair: SEALED_KEY } as object),
        reason: null,
      } as Parameters<MoneyAuditService['authorization']>[0]),
    ).resolves.toBeUndefined();

    const after = await rows();
    expect(after).toHaveLength(before + 1);
    // Whatever was written, the sealed key is not in it.
    expect(after.map((r) => r.metadata).join('|')).not.toContain(SEALED_KEY);
  });

  it('never fails the money movement it is describing', async () => {
    // A bookkeeping failure must not refuse a legitimate transfer, so a broken
    // database is swallowed and logged rather than thrown.
    const broken = new MoneyAuditService({
      insert: () => {
        throw new Error('audit table unavailable');
      },
    } as never);

    await expect(
      broken.authorization({
        userId,
        operationKind: 'internal_transfer',
        decision: 'granted',
        subjectType: 'wallet',
        subjectId: null,
      }),
    ).resolves.toBeUndefined();
  });

  it('refuses a hand-assembled record carrying key material', () => {
    // The two builders are closed-shape, so this is the remaining path: a
    // future caller assembling metadata itself. The guard is what stops it.
    expect(() => assertNoSecretFields({ secretKey: SEALED_KEY })).toThrow(
      AuditSecretLeakError,
    );
  });
});
