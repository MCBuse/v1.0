import type { CreditProfile, StaffCreditAssessment } from '@repo/shared';
import {
  INestApplication,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Pool } from 'pg';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import {
  connectTestDatabase,
  TestDatabase,
} from '../database/testing/test-database';
import {
  createMerchantFixture,
  destroyMerchantFixture,
  MerchantFixture,
} from '../database/testing/merchant-fixture';
import * as s from '../database/schema';
import { DRIZZLE } from '../database/database.provider';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { globalValidationPipe } from '../common/pipes/validation.pipe';
import {
  CreditAccessService,
  CreditAnalystGuard,
} from './credit-access.service';
import { CreditEvidenceService } from './credit-evidence.service';
import { StaffCreditService } from './staff-credit.service';
import {
  MerchantCreditController,
  StaffCreditController,
} from './credit.controller';
import { ScoringClient } from './scoring-client';
import { MerchantService } from '../data-capture/merchant.service';
import { MerchantAssessmentService } from '../data-capture/assessment/merchant-assessment.service';
import { RatesService } from '../rates/rates.service';
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
describe('private Python scoring and staff access (integration)', () => {
  let db: TestDatabase,
    pool: Pool,
    app: INestApplication,
    one: MerchantFixture,
    two: MerchantFixture,
    staffId: string;
  let evidence: CreditEvidenceService,
    staff: StaffCreditService,
    assessments: MerchantAssessmentService,
    merchants: MerchantService;
  beforeAll(async () => {
    ({ db, pool } = await connectTestDatabase());
    one = await createMerchantFixture(db, 'CreditOne');
    two = await createMerchantFixture(db, 'CreditTwo');
    const [user] = await db
      .insert(s.users)
      .values({
        username: `credit${randomUUID().slice(0, 8)}`,
        firstName: 'Credit',
        lastName: 'Analyst',
      })
      .returning();
    staffId = user.id;
    await db.insert(s.staffPermissions).values({ userId: staffId });
    const config = new ConfigService({
      MERCHANT_DATA_CAPTURE_ENABLED: true,
      CREDIT_SCORING_URL: 'http://127.0.0.1:55440',
      CREDIT_SCORING_TOKEN: 'local-pilot-test-token-not-for-production',
    });
    const scoring = new ScoringClient(config);
    evidence = new CreditEvidenceService(db, scoring);
    const access = new CreditAccessService(db, evidence);
    staff = new StaffCreditService(db, evidence, scoring, access);
    merchants = new MerchantService(db, {} as RatesService, config);
    assessments = new MerchantAssessmentService(db, merchants, evidence);
    const mod = await Test.createTestingModule({
      controllers: [StaffCreditController, MerchantCreditController],
      providers: [
        { provide: DRIZZLE, useValue: db },
        { provide: CreditAccessService, useValue: access },
        { provide: CreditEvidenceService, useValue: evidence },
        { provide: StaffCreditService, useValue: staff },
        { provide: ScoringClient, useValue: scoring },
        { provide: MerchantService, useValue: merchants },
        CreditAnalystGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestIdentity)
      .compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(globalValidationPipe);
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    if (!db) return;
    for (const fixture of [one, two])
      if (fixture) {
        await db
          .delete(s.staffCreditAssessments)
          .where(eq(s.staffCreditAssessments.merchantId, fixture.merchantId));
        await db
          .delete(s.merchantCreditProfiles)
          .where(eq(s.merchantCreditProfiles.merchantId, fixture.merchantId));
        await db
          .delete(s.creditPilotEnrollments)
          .where(eq(s.creditPilotEnrollments.merchantId, fixture.merchantId));
        await destroyMerchantFixture(db, fixture);
      }
    if (staffId) {
      await db
        .delete(s.staffCreditAssessments)
        .where(eq(s.staffCreditAssessments.actorUserId, staffId));
      await db
        .delete(s.staffPermissions)
        .where(eq(s.staffPermissions.userId, staffId));
      await db.delete(s.auditLogs).where(eq(s.auditLogs.userId, staffId));
      await db.delete(s.users).where(eq(s.users.id, staffId));
    }
    await pool?.end();
  });
  it('denies merchants at every staff route and supports a staff-only account', async () => {
    for (const path of [
      '/staff/me',
      '/staff/credit-assessments',
      '/staff/credit-assessments/model',
      '/staff/credit-assessments/merchants',
    ])
      await request(
        app.getHttpServer() as unknown as Parameters<typeof request>[0],
      )
        .get(path)
        .set('x-test-user', one.userId)
        .expect(403);
    await request(
      app.getHttpServer() as unknown as Parameters<typeof request>[0],
    )
      .post('/staff/credit-assessments')
      .set('x-test-user', one.userId)
      .send({ exampleId: 'complete' })
      .expect(403);
    await request(
      app.getHttpServer() as unknown as Parameters<typeof request>[0],
    )
      .get('/staff/me')
      .set('x-test-user', staffId)
      .expect(200);
  });
  it('runs real Python synthetic scoring and persists a single immutable result on concurrent retries', async () => {
    const key = randomUUID();
    const run = () =>
      request(app.getHttpServer() as unknown as Parameters<typeof request>[0])
        .post('/staff/credit-assessments')
        .set('x-test-user', staffId)
        .set('Idempotency-Key', key)
        .send({ exampleId: 'complete' })
        .expect(201);
    const [a, b] = await Promise.all([run(), run()]);
    const aBody = a.body as StaffCreditAssessment;
    const bBody = b.body as StaffCreditAssessment;
    expect(aBody.id).toBe(bBody.id);
    expect(aBody.result.experimentalCredit?.creditScore).toBeGreaterThanOrEqual(
      300,
    );
    await request(
      app.getHttpServer() as unknown as Parameters<typeof request>[0],
    )
      .post('/staff/credit-assessments')
      .set('x-test-user', staffId)
      .set('Idempotency-Key', key)
      .send({ exampleId: 'missing-margin' })
      .expect(409);
    const rows = await db
      .select()
      .from(s.auditLogs)
      .where(
        and(
          eq(s.auditLogs.entityId, aBody.id),
          eq(s.auditLogs.action, 'credit.assessment.run'),
        ),
      );
    expect(rows).toHaveLength(1);
  });
  it('requires enrollment and independent pilot consent, including on history and detail', async () => {
    await expect(
      staff.run(staffId, { merchantId: one.merchantId }, randomUUID()),
    ).rejects.toThrow();
    await db
      .insert(s.creditPilotEnrollments)
      .values({ merchantId: one.merchantId });
    await expect(
      staff.run(staffId, { merchantId: one.merchantId }, randomUUID()),
    ).rejects.toThrow();
    await evidence.setConsent(one.merchantId, one.userId, true);
    const result = await staff.run(
      staffId,
      { merchantId: one.merchantId },
      randomUUID(),
    );
    expect(
      (result.result as StaffCreditAssessment['result']).experimentalCredit,
    ).toBeNull();
    expect(
      (result.result as StaffCreditAssessment['result']).unavailableFields,
    ).toContain('estimated_margin_pct');
    await evidence.setConsent(one.merchantId, one.userId, false);
    await expect(staff.detail(staffId, result.id)).rejects.toThrow();
    await expect(staff.history(staffId, one.merchantId)).rejects.toThrow();
  });
  it('stores declared cents without accepting computed margin and isolates merchant profiles', async () => {
    await request(
      app.getHttpServer() as unknown as Parameters<typeof request>[0],
    )
      .patch('/merchants/me/credit-profile')
      .set('x-test-user', one.userId)
      .send({
        data: {
          loanAmountMinor: '10',
          commencementDate: '2020-01-15',
          merchantType: 'grocer',
        },
      })
      .expect(200);
    const other = await request(
      app.getHttpServer() as unknown as Parameters<typeof request>[0],
    )
      .get('/merchants/me/credit-profile')
      .set('x-test-user', two.userId)
      .expect(200);
    expect(other.body).toEqual({});
    await request(
      app.getHttpServer() as unknown as Parameters<typeof request>[0],
    )
      .patch('/merchants/me/credit-profile')
      .set('x-test-user', one.userId)
      .send({ data: { estimatedMarginPct: 80 } })
      .expect(400);
  });
  it('keeps private pilot results out of merchant assessments and keeps old snapshots unchanged', async () => {
    await merchants.updateConsent(one.userId, true);
    const first = await assessments.run(one.userId, undefined, randomUUID());
    expect(first.credit?.financialProfile).toBeNull();
    expect(first.credit?.profileConfidence).not.toBeNull();
    expect(JSON.stringify(first)).not.toMatch(
      /experimentalCredit|probabilityOfDefault|policyOverlayPoints/,
    );
    await evidence.saveProfile(one.merchantId, { loanAmountMinor: '200' });
    const saved = await assessments.require(one.userId, first.id);
    expect(
      (saved.businessProfile.creditProfile as CreditProfile).loanAmountMinor,
    ).toBe('10');
    await expect(assessments.require(two.userId, first.id)).rejects.toThrow();
    const pilot = (await staff.history(staffId)).assessments[0];
    await expect(assessments.require(one.userId, pilot.id)).rejects.toThrow();
    expect(JSON.stringify(await assessments.history(one.userId))).not.toMatch(
      /experimentalCredit|probabilityOfDefault|policyOverlayPoints/,
    );
  });
  it('preserves readiness when the Python service is unavailable', async () => {
    const offline = new CreditEvidenceService(
      db,
      new ScoringClient(
        new ConfigService({
          CREDIT_SCORING_URL: 'http://127.0.0.1:1',
          CREDIT_SCORING_TOKEN: 'local-pilot-test-token-not-for-production',
        }),
      ),
    );
    const fallback = new MerchantAssessmentService(db, merchants, offline);
    const r = await fallback.run(one.userId, undefined, randomUUID());
    expect(r.credit?.status).toBe('temporarily_unavailable');
    expect(r.stage).toBeDefined();
    expect(r.score).toBeNull();
  });
  it('rejects non-boolean consent rather than converting a string into permission', async () => {
    await request(
      app.getHttpServer() as unknown as Parameters<typeof request>[0],
    )
      .post('/merchants/me/credit-pilot-consent')
      .set('x-test-user', one.userId)
      .send({ active: 'false' })
      .expect(400);
    expect((await evidence.consent(one.merchantId)).active).toBe(false);
  });
  it('uses the saved window, excludes future and old payments, and retains older critical blockers', async () => {
    const to = new Date('2026-09-21T12:00:00Z');
    const from = new Date(to.getTime() - 90 * 86400000);
    for (const [days, minor, environment] of [
      [-100, 99900, 'live'],
      [-80, 10, 'live'],
      [-1, 475, 'live'],
      [1, 99900, 'live'],
      [-1, 600, 'synthetic'],
    ] as const) {
      const occurredAt = new Date(to.getTime() + days * 86400000);
      const [pr] = await db
        .insert(s.paymentRequests)
        .values({
          creatorWalletId: one.routineWalletId,
          merchantId: one.merchantId,
          type: 'dynamic',
          nonce: randomUUID(),
          status: 'completed',
          amount: 1000000n,
          currency: 'USDC',
          displayAmountMinor: BigInt(minor),
          displayCurrency: 'EUR',
        })
        .returning();
      const [ledger] = await db
        .insert(s.ledgerEntries)
        .values({
          debitWalletId: two.routineWalletId,
          creditWalletId: one.routineWalletId,
          amount: 1000000n,
          currency: 'USDC',
          type: 'p2p',
          paymentRequestId: pr.id,
        })
        .returning();
      await db.insert(s.merchantTransactions).values({
        receiptNumber: `CR${randomUUID().slice(0, 20)}`,
        merchantId: one.merchantId,
        paymentRequestId: pr.id,
        ledgerEntryId: ledger.id,
        displayAmountMinor: BigInt(minor),
        displayCurrency: 'EUR',
        settlementAmount: 1000000n,
        settlementCurrency: 'USDC',
        quoteRateScaled: 1000000n,
        occurredAt,
        finalizedAt: occurredAt,
        evidenceEnvironment: environment,
      });
    }
    const built = await evidence.build(one.merchantId, to, from);
    expect(built.values.verified_sales_eur).toBe(4.85);
    expect(built.values.finalized_payments).toBe(2);
    expect(built.values.avg_txn_value_eur).toBe(2.425);
    expect(built.values.finality).toBeNull();
    const readiness = await merchants.getReadiness(one.userId, { from, to });
    expect(readiness.measured.finalizedPayments).toBe(3);
    await db.insert(s.merchantCaptureExceptions).values({
      merchantId: one.merchantId,
      severity: 'critical',
      status: 'open',
      reasonCode: 'malformed_payload',
      createdAt: new Date(from.getTime() - 86400000),
    });
    expect((await merchants.getReadiness(one.userId, { from, to })).stage).toBe(
      'integrity_review',
    );
  });
  it('counts merchant-recorded cash sales in the sales inputs and skips voided ones', async () => {
    // A window with no card payments from the earlier cases, so only cash counts.
    const to = new Date('2027-03-01T12:00:00Z');
    const from = new Date(to.getTime() - 90 * 86400000);
    for (const [days, minor, status] of [
      [-2, 300, 'recorded'],
      [-1, 450, 'recorded'],
      [-1, 99900, 'voided'],
    ] as const) {
      await db.insert(s.merchantCashSales).values({
        merchantId: one.merchantId,
        receiptNumber: `CS${randomUUID().slice(0, 20)}`,
        amountMinor: BigInt(minor),
        occurredAt: new Date(to.getTime() + days * 86400000),
        status,
        actorUserId: one.userId,
        idempotencyKey: randomUUID(),
      });
    }
    const built = await evidence.build(one.merchantId, to, from);
    expect(built.values.finalized_payments).toBe(2);
    expect(built.values.verified_sales_eur).toBe(7.5);
    expect(built.values.avg_txn_value_eur).toBe(3.75);
    expect(built.provenance.verified_sales_eur).toBe('merchant_recorded_cash');
    expect(built.integritySummary[0]).toContain(
      '2 merchant-recorded cash sales used for sales inputs',
    );
    // Payment-reliability inputs still come only from digital payments.
    expect(built.values.capture_quality).toBeNull();
  });
  it('revocation takes effect without a new login', async () => {
    await db
      .update(s.staffPermissions)
      .set({ active: false })
      .where(eq(s.staffPermissions.userId, staffId));
    await request(
      app.getHttpServer() as unknown as Parameters<typeof request>[0],
    )
      .get('/staff/credit-assessments')
      .set('x-test-user', staffId)
      .expect(403);
  });
});
