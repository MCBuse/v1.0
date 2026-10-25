import {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import type { StaffChangeMerchant } from '@repo/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { globalValidationPipe } from '../common/pipes/validation.pipe';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { CreditAccessService } from '../credit-assessment/credit-access.service';
import type { CreditEvidenceService } from '../credit-assessment/credit-evidence.service';
import { DRIZZLE } from '../database/database.provider';
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
import { StaffController } from '../staff/staff.controller';
import { ChangeIntelligenceConfig } from './change-intelligence.config';
import { ChangeJobTrigger } from './change-job-trigger';
import { ChangeProcessorService } from './change-processor.service';
import { ChangePublisherService } from './change-publisher.service';
import { ChangeSourceLoader } from './change-source.loader';
import { ChangeWorkQueueService } from './change-work-queue.service';
import { StaffChangeController } from './staff-change.controller';
import {
  ChangeOperatorGuard,
  StaffChangeService,
  UPDATE_NOW_ENTITY,
} from './staff-change.service';
import { asOfAfter, repeat } from './engine/fixtures';
import { addDays, localDayStart } from './engine/local-time';

/**
 * Plan §8 / §9.2 "Update now" through the real controllers, guards,
 * validation pipe and a real Postgres. Only the Cloud Run start is observed
 * (its HTTP boundary is unit-tested in change-job-trigger.spec.ts).
 */
class TestIdentity implements CanActivate {
  canActivate(c: ExecutionContext) {
    const r = c.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: { id: string | undefined };
    }>();
    r.user = { id: r.headers['x-test-user'] };
    return Boolean(r.user.id);
  }
}

const TZ = 'Europe/Berlin';
const D0 = '2026-09-20';
const D1 = addDays(D0, 1);

describe('Staff Update now (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let app: INestApplication;
  let queue: ChangeWorkQueueService;
  let processor: ChangeProcessorService;
  let trigger: ChangeJobTrigger;
  const fixtures: MerchantFixture[] = [];
  const staffUsers: string[] = [];
  let aci: MerchantFixture; // enabled, searched by name
  let bakery: MerchantFixture; // enabled, searched by email
  let off: MerchantFixture; // not allowlisted
  let shift: MerchantFixture; // enabled, demand shift for confirmation timing
  let operator: string;
  let analyst: string;
  let both: string;
  let nobody: string;

  const http = () =>
    request(app.getHttpServer() as unknown as Parameters<typeof request>[0]);
  const list = (user: string, q?: string) =>
    http()
      .get('/staff/changes/merchants')
      .query(q === undefined ? {} : { q })
      .set('x-test-user', user);
  const updateNow = (user: string, merchantId: string, reason = 'Restocked') =>
    http()
      .post('/staff/changes/update-now')
      .set('x-test-user', user)
      .send({ merchantId, reason });
  const q = async <T = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ) => (await pool.query(text, values)).rows as T[];

  const staffUser = async (
    label: string,
    permissions: Array<'credit_analyst' | 'change_intelligence_operator'>,
  ) => {
    const [user] = await db
      .insert(schema.users)
      .values({
        username: `${label}${randomUUID().slice(0, 8)}`,
        email: `${label}-${randomUUID().slice(0, 8)}@mcbuse.test`,
        firstName: label,
        lastName: 'Staff',
      })
      .returning({ id: schema.users.id });
    staffUsers.push(user.id);
    for (const permission of permissions)
      await db
        .insert(schema.staffPermissions)
        .values({ userId: user.id, permission });
    return user.id;
  };

  const merchant = async (label: string) => {
    const fixture = await createMerchantFixture(db, label);
    fixtures.push(fixture);
    return fixture;
  };

  /** Clears the one-minute limit for the next request (the test cannot wait a minute). */
  const ageUpdateNow = (merchantId: string) =>
    q(
      `UPDATE merchant_change_work SET last_update_now_at = now() - interval '61 seconds' WHERE merchant_id = $1`,
      [merchantId],
    );

  const work = async (merchantId: string) =>
    (
      await q<{
        requested_revision: string;
        processed_revision: string;
        requested_by_user_id: string | null;
        last_update_now_at: Date | null;
      }>(
        `SELECT requested_revision::text, processed_revision::text, requested_by_user_id::text, last_update_now_at
         FROM merchant_change_work WHERE merchant_id = $1`,
        [merchantId],
      )
    )[0];

  beforeAll(async () => {
    ({ db, pool } = await connectTestDatabase());
    [aci, bakery, off, shift] = await Promise.all(
      ['UnAci', 'UnBakery', 'UnOff', 'UnShift'].map(merchant),
    );
    await db
      .update(schema.merchants)
      .set({ businessName: 'Aci Café Update' })
      .where(eq(schema.merchants.id, aci.merchantId));
    operator = await staffUser('op', ['change_intelligence_operator']);
    analyst = await staffUser('an', ['credit_analyst']);
    both = await staffUser('both', [
      'credit_analyst',
      'change_intelligence_operator',
    ]);
    nobody = await staffUser('nobody', []);

    const config = new ChangeIntelligenceConfig({
      MERCHANT_CHANGE_INTELLIGENCE_ENABLED: 'true',
      // Public ids for one, UUIDs for the rest: both forms are accepted.
      MERCHANT_CHANGE_INTELLIGENCE_ALLOWLIST: [
        aci.merchantId,
        bakery.merchantId,
        shift.merchantId,
      ].join(','),
    });
    queue = new ChangeWorkQueueService(db, config);
    processor = new ChangeProcessorService(
      db,
      config,
      queue,
      new ChangeSourceLoader(),
      new ChangePublisherService(queue),
    );
    // Local configuration: no job name, so a start is logged and skipped.
    trigger = new ChangeJobTrigger(new ConfigService({}));
    const mod = await Test.createTestingModule({
      controllers: [StaffController, StaffChangeController],
      providers: [
        { provide: DRIZZLE, useValue: db },
        {
          provide: StaffChangeService,
          useValue: new StaffChangeService(db, config, queue, trigger),
        },
        ChangeOperatorGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestIdentity)
      .compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(globalValidationPipe);
    app.useGlobalFilters(new HttpExceptionFilter());
    // Listen once on a fixed loopback address: supertest otherwise listens on an ephemeral
    // wildcard port and closes it after every request, and a reused keep-alive socket or
    // a port held by another local process then fails the request (socket hang up, 404).
    await app.listen(0, '127.0.0.1');

    // Initialize the enabled merchants so they have work rows and a last success.
    for (const f of [aci, bakery])
      expect(
        (
          await processor.processMerchant(f.merchantId, {
            asOf: asOfAfter(D0, TZ),
          })
        )?.status,
      ).toBe('succeeded');
  });

  afterAll(async () => {
    await app?.close();
    for (const fixture of fixtures) await destroyMerchantFixture(db, fixture);
    if (staffUsers.length) {
      await db
        .delete(schema.auditLogs)
        .where(inArray(schema.auditLogs.userId, staffUsers));
      await db
        .delete(schema.staffPermissions)
        .where(inArray(schema.staffPermissions.userId, staffUsers));
      await db.delete(schema.users).where(inArray(schema.users.id, staffUsers));
    }
    await pool?.end();
  });

  afterEach(() => jest.restoreAllMocks());

  it('9.2.update-now-picker: searches by name and owner email, lists only enabled merchants', async () => {
    const byName = (await list(operator, 'aci café').expect(200)).body as {
      merchants: StaffChangeMerchant[];
    };
    expect(byName.merchants).toHaveLength(1);
    const [found] = byName.merchants;
    const [publicId] = await q<{ public_id: string }>(
      'SELECT public_id FROM merchants WHERE id = $1',
      [aci.merchantId],
    );
    expect(found).toEqual({
      merchantId: aci.merchantId,
      publicId: publicId.public_id,
      businessName: 'Aci Café Update',
      ownerEmail: expect.stringMatching(/^unaci.*@mcbuse\.test$/) as string,
      lastSuccessfulUpdateAt: expect.any(String) as string,
      processing: 'idle',
    });

    const [ownerEmail] = await q<{ email: string }>(
      'SELECT email FROM users WHERE id = $1',
      [bakery.userId],
    );
    const byEmail = (
      await list(operator, ownerEmail.email.toUpperCase()).expect(200)
    ).body as { merchants: StaffChangeMerchant[] };
    expect(byEmail.merchants.map((m) => m.merchantId)).toEqual([
      bakery.merchantId,
    ]);

    // Not allowlisted: never listed, whatever the query.
    const offName = (
      await q<{ business_name: string }>(
        'SELECT business_name FROM merchants WHERE id = $1',
        [off.merchantId],
      )
    )[0].business_name;
    expect(
      (
        (await list(operator, offName).expect(200)).body as {
          merchants: StaffChangeMerchant[];
        }
      ).merchants,
    ).toEqual([]);
    const all = (await list(operator).expect(200)).body as {
      merchants: StaffChangeMerchant[];
    };
    expect(all.merchants.map((m) => m.merchantId)).not.toContain(
      off.merchantId,
    );
    expect(all.merchants.length).toBeLessThanOrEqual(50);

    // LIKE wildcards are matched literally.
    expect(
      (
        (await list(operator, '%').expect(200)).body as {
          merchants: StaffChangeMerchant[];
        }
      ).merchants,
    ).toEqual([]);
  });

  it('9.2.update-now-403: staff without the permission and other users get 403', async () => {
    for (const user of [analyst, nobody]) {
      await list(user).expect(403);
      await updateNow(user, aci.merchantId).expect(403);
    }
    // Revoked permission takes effect on the next request.
    const revoked = await staffUser('rev', ['change_intelligence_operator']);
    await list(revoked).expect(200);
    await db
      .update(schema.staffPermissions)
      .set({ active: false })
      .where(eq(schema.staffPermissions.userId, revoked));
    await list(revoked).expect(403);
  });

  it('9.2.update-now-404: merchants and merchant owners get 404', async () => {
    for (const f of [aci, off]) {
      await list(f.userId).expect(404);
      await updateNow(f.userId, f.merchantId).expect(404);
    }
    expect((await work(off.merchantId)) ?? null).toBeNull();
  });

  it('9.2.update-now-dual-permission: one user can hold credit_analyst and change_intelligence_operator', async () => {
    const rows = await q<{ permission: string }>(
      'SELECT permission FROM staff_permissions WHERE user_id = $1 ORDER BY permission',
      [both],
    );
    expect(rows.map((r) => r.permission)).toEqual([
      'change_intelligence_operator',
      'credit_analyst',
    ]);
    // Credit behaviour is unchanged for the same user.
    await expect(
      new CreditAccessService(db, {} as CreditEvidenceService).requireStaff(
        both,
      ),
    ).resolves.toBeUndefined();
    await expect(
      new CreditAccessService(db, {} as CreditEvidenceService).requireStaff(
        operator,
      ),
    ).rejects.toThrow('Credit analyst access required');
    await list(both).expect(200);
    const me = await http().get('/staff/me').set('x-test-user', both);
    expect(me.status).toBe(200);
    expect(me.body).toEqual({
      permission: 'credit_analyst',
      permissions: expect.arrayContaining([
        'credit_analyst',
        'change_intelligence_operator',
      ]) as string[],
    });
    expect(
      (await http().get('/staff/me').set('x-test-user', operator)).body,
    ).toEqual({
      permission: 'change_intelligence_operator',
      permissions: ['change_intelligence_operator'],
    });
    await http().get('/staff/me').set('x-test-user', nobody).expect(403);
    await http().get('/staff/me').set('x-test-user', aci.userId).expect(403);
  });

  it('validates the request and only accepts enabled merchants', async () => {
    await updateNow(operator, aci.merchantId, '').expect(400);
    await updateNow(operator, aci.merchantId, '   ').expect(400);
    await updateNow(operator, aci.merchantId, 'x'.repeat(201)).expect(400);
    await updateNow(operator, 'not-a-uuid').expect(400);
    await http()
      .post('/staff/changes/update-now')
      .set('x-test-user', operator)
      .send({ merchantId: aci.merchantId })
      .expect(400);
    await updateNow(operator, off.merchantId).expect(404);
    await updateNow(operator, randomUUID()).expect(404);
    expect((await work(off.merchantId)) ?? null).toBeNull();
  });

  it('9.2.update-now-audited and 9.2.update-now-already-running: queued, then already_running within a minute', async () => {
    const start = jest.spyOn(trigger, 'start');
    const before = await work(bakery.merchantId);
    const first = await updateNow(
      operator,
      bakery.merchantId,
      '  Merchant restocked croissants  ',
    ).expect(202);
    expect(first.body).toEqual({ status: 'queued' });
    expect(start).toHaveBeenCalledTimes(1);
    const after = await work(bakery.merchantId);
    expect(BigInt(after.requested_revision)).toBe(
      BigInt(before.requested_revision) + 1n,
    );
    expect(after.requested_by_user_id).toBe(operator);

    const second = await updateNow(both, bakery.merchantId).expect(202);
    expect(second.body).toEqual({ status: 'already_running' });
    expect(start).toHaveBeenCalledTimes(1);
    expect((await work(bakery.merchantId)).requested_revision).toBe(
      after.requested_revision,
    );

    const audit = await q<{
      user_id: string;
      action: string;
      entity_type: string;
      entity_id: string;
      metadata: string;
    }>(
      `SELECT user_id, action, entity_type, entity_id, metadata FROM audit_logs
       WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at, action DESC`,
      [UPDATE_NOW_ENTITY, bakery.merchantId],
    );
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({
      user_id: operator,
      action: 'change.update_now.queued',
      entity_type: 'change_update_now',
    });
    expect(JSON.parse(audit[0].metadata)).toEqual({
      merchantId: bakery.merchantId,
      reason: 'Merchant restocked croissants',
      status: 'queued',
    });
    expect(audit[1]).toMatchObject({
      user_id: both,
      action: 'change.update_now.already_running',
    });

    // The run it produces records the staff user; the request is consumed.
    const outcome = await processor.processMerchant(bakery.merchantId, {
      asOf: asOfAfter(D0, TZ, 3),
    });
    expect(outcome?.status).toBe('succeeded');
    const [run] = await q<{ requested_by_user_id: string }>(
      'SELECT requested_by_user_id::text FROM merchant_change_runs WHERE id = $1',
      [outcome?.runId],
    );
    expect(run.requested_by_user_id).toBe(operator);
    expect((await work(bakery.merchantId)).requested_by_user_id).toBeNull();
  });

  it('9.2.update-now-already-running during processing and 9.2.update-now-no-overlap with the hourly run', async () => {
    await ageUpdateNow(aci.merchantId);
    // An hourly execution holds the merchant's lease.
    await queue.requestRun(aci.merchantId, 'clock');
    const hourly = await queue.claim({ merchantId: aci.merchantId });
    expect(hourly).not.toBeNull();
    const start = jest.spyOn(trigger, 'start');
    expect(
      (await updateNow(operator, aci.merchantId).expect(202)).body,
    ).toEqual({ status: 'already_running' });
    expect(start).not.toHaveBeenCalled();

    // The hourly run finishes; Update now queues and the job's run cannot overlap a live lease.
    expect(
      (await processor.processWork(hourly!, { asOf: asOfAfter(D0, TZ, 4) }))
        .status,
    ).toBe('succeeded');
    expect(
      (await updateNow(operator, aci.merchantId).expect(202)).body,
    ).toEqual({ status: 'queued' });
    const jobClaim = await queue.claim({ merchantId: aci.merchantId });
    expect(jobClaim?.requestedByUserId).toBe(operator);
    // A second worker (e.g. the hourly schedule) finds nothing to claim while it runs.
    expect(await queue.claim({ merchantId: aci.merchantId })).toBeNull();
    expect(await queue.claim()).toBeNull();
    expect(
      await processor.processMerchant(aci.merchantId, {
        asOf: asOfAfter(D0, TZ, 4),
      }),
    ).toBeNull();
    expect(
      (await processor.processWork(jobClaim!, { asOf: asOfAfter(D0, TZ, 4) }))
        .status,
    ).toBe('succeeded');
    const runs = await q<{ started_at: Date; completed_at: Date }>(
      `SELECT started_at, completed_at FROM merchant_change_runs WHERE merchant_id = $1 ORDER BY started_at`,
      [aci.merchantId],
    );
    for (let i = 1; i < runs.length; i += 1)
      expect(runs[i].started_at.getTime()).toBeGreaterThanOrEqual(
        runs[i - 1].completed_at.getTime(),
      );
  });

  it('reports a failed job start honestly and leaves the work due', async () => {
    await ageUpdateNow(aci.merchantId);
    jest.spyOn(trigger, 'start').mockRejectedValueOnce(new Error('HTTP 403'));
    const before = await work(aci.merchantId);
    // 5xx bodies are generic (HttpExceptionFilter); the portal explains a 503.
    await updateNow(operator, aci.merchantId).expect(503);
    const after = await work(aci.merchantId);
    expect(BigInt(after.requested_revision)).toBeGreaterThan(
      BigInt(after.processed_revision),
    );
    expect(BigInt(after.requested_revision)).toBe(
      BigInt(before.requested_revision) + 1n,
    );
  });

  it('9.2.update-now-confirmation-timing: an extra run on the same local day does not confirm a demand change', async () => {
    const [{ id: product }] = await q<{ id: string }>(
      `INSERT INTO merchant_products (merchant_id, name, unit_price_minor, on_hand_quantity, low_stock_threshold, created_at)
       VALUES ($1, 'Cappuccino', 250, 400, 5, $2) RETURNING id`,
      [shift.merchantId, localDayStart('2026-07-01', TZ)],
    );
    const cash = async (lastDay: string, daily: number[]) => {
      const days = daily.map((_, i) => addDays(lastDay, i - daily.length + 1));
      await q(
        `WITH days AS (SELECT d, n FROM unnest($3::date[], $4::int[]) AS t(d, n) WHERE n > 0),
         sales AS (
           INSERT INTO merchant_cash_sales (merchant_id, receipt_number, amount_minor, occurred_at, actor_user_id, idempotency_key)
           SELECT $1, 'CS-' || substr(md5(random()::text), 1, 20), 250 * n, (d + time '12:00') AT TIME ZONE $5, $2,
             gen_random_uuid()::text FROM days RETURNING id, amount_minor)
         INSERT INTO merchant_cash_sale_items (cash_sale_id, product_id, type, name, quantity, unit_price_minor, line_total_minor)
         SELECT id, $6, 'product', 'Line', (amount_minor / 250)::int, 250, amount_minor FROM sales`,
        [shift.merchantId, shift.userId, days, daily, TZ, product],
      );
    };
    const demandCases = () =>
      q(
        `SELECT id FROM merchant_change_cases WHERE merchant_id = $1 AND case_type LIKE 'unit_demand_%'`,
        [shift.merchantId],
      );
    // Four steady weeks, then a week at 6/day: D0 is the first qualifying day.
    await cash(D0, [...repeat(4, 28), ...repeat(6, 7)]);
    expect(
      (
        await processor.processMerchant(shift.merchantId, {
          asOf: asOfAfter(D0, TZ, 1),
        })
      )?.status,
    ).toBe('succeeded');
    // A clock run on D0 (as the hourly schedule would) records the first qualifying day.
    await queue.requestRun(shift.merchantId, 'clock');
    await processor.processMerchant(shift.merchantId, {
      asOf: asOfAfter(D0, TZ, 2),
    });
    expect(await demandCases()).toHaveLength(0);

    // Update now later the same local day: processed, but no confirmation.
    expect(
      (await updateNow(operator, shift.merchantId).expect(202)).body,
    ).toEqual({ status: 'queued' });
    expect(
      (
        await processor.processMerchant(shift.merchantId, {
          asOf: asOfAfter(D0, TZ, 9),
        })
      )?.status,
    ).toBe('succeeded');
    expect(await demandCases()).toHaveLength(0);

    // The second qualifying local day confirms, exactly as without Update now.
    await cash(D1, [6]);
    await queue.requestRun(shift.merchantId, 'clock');
    expect(
      (
        await processor.processMerchant(shift.merchantId, {
          asOf: asOfAfter(D1, TZ, 1),
        })
      )?.status,
    ).toBe('succeeded');
    expect(await demandCases()).toHaveLength(1);
  });
});
