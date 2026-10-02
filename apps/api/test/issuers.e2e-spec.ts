import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { inArray } from 'drizzle-orm';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { globalValidationPipe } from '../src/common/pipes/validation.pipe';
import { DRIZZLE } from '../src/database/database.provider';
import type { DrizzleDB } from '../src/database/database.provider';
import * as schema from '../src/database/schema';

jest.setTimeout(30_000);

const testPassword = 'IssuerWorkflowE2e2026!';
const requiredChecklist = [
  'Token contract matches the submitted details',
  'Reserve model and disclosures are clear',
  'Latest attestation is accessible and current',
];

type TestUser = { id: string; email: string };
type AuthResponse = { accessToken: string };
type ProfileResponse = {
  organizations: Array<{ slug: string; role: string }>;
  submissions: Array<{ id: string }>;
};
type SubmissionResponse = { id: string; status: string };

describe('Issuer workflow database e2e', () => {
  let app: INestApplication<App> | undefined;
  let db: DrizzleDB | undefined;
  let issuerA: TestUser;
  let issuerB: TestUser;
  let reviewer: TestUser;
  let issuerAOrganizationId: string;
  let issuerBOrganizationId: string;
  let reviewerOrganizationId: string;
  let issuerAToken: string;
  let issuerBToken: string;
  let reviewerToken: string;
  let issuerBApprovedSubmissionId: string;
  let registryCollisionSubmissionId: string;
  let approvableSubmissionId: string;
  const userIds: string[] = [];
  const organizationIds: string[] = [];
  const submissionIds: string[] = [];

  async function createUser(
    email: string,
    username: string,
    firstName: string,
    lastName: string,
  ): Promise<TestUser> {
    const [user] = await db!
      .insert(schema.users)
      .values({
        email,
        username,
        firstName,
        lastName,
        passwordHash: await bcrypt.hash(testPassword, 4),
        isEmailVerified: true,
      })
      .returning({ id: schema.users.id, email: schema.users.email });
    userIds.push(user.id);
    return { id: user.id, email: user.email! };
  }

  async function createOrganization(legalName: string, slug: string) {
    const [organization] = await db!
      .insert(schema.issuerOrganizations)
      .values({
        legalName,
        slug,
        verificationStatus: 'verified',
      })
      .returning({ id: schema.issuerOrganizations.id });
    organizationIds.push(organization.id);
    return organization.id;
  }

  async function createSubmission(input: {
    organizationId: string;
    submittedBy: string;
    status: 'in_review' | 'approved';
    network: string;
    contractAddress: string;
    ticker: string;
  }) {
    const [submission] = await db!
      .insert(schema.stablecoinSubmissions)
      .values({
        organizationId: input.organizationId,
        submittedBy: input.submittedBy,
        name: `E2E ${input.ticker}`,
        ticker: input.ticker,
        network: input.network,
        contractAddress: input.contractAddress,
        normalizedContractAddress: input.contractAddress.toLowerCase(),
        reserveDisclosure: 'Automated test fixture only.',
        attestationUrl: 'https://example.invalid/e2e-attestation',
        status: input.status,
        submittedAt: new Date(),
      })
      .returning({ id: schema.stablecoinSubmissions.id });
    submissionIds.push(submission.id);
    return submission.id;
  }

  async function login(user: TestUser): Promise<string> {
    const response = await request(app!.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: testPassword })
      .expect(200);
    return (response.body as AuthResponse).accessToken;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(globalValidationPipe);
    db = app.get<DrizzleDB>(DRIZZLE);
    await app.init();

    const runId = randomUUID();
    issuerA = await createUser(
      `issuer-a-${runId}@example.test`,
      `issuer_a_${runId.slice(0, 8)}`,
      'Issuer',
      'Alpha',
    );
    issuerB = await createUser(
      `issuer-b-${runId}@example.test`,
      `issuer_b_${runId.slice(0, 8)}`,
      'Issuer',
      'Beta',
    );
    reviewer = await createUser(
      `reviewer-${runId}@example.test`,
      `reviewer_${runId.slice(0, 8)}`,
      'Review',
      'Staff',
    );

    issuerAOrganizationId = await createOrganization(
      'E2E Issuer Alpha',
      `e2e-issuer-alpha-${runId}`,
    );
    issuerBOrganizationId = await createOrganization(
      'E2E Issuer Beta',
      `e2e-issuer-beta-${runId}`,
    );
    reviewerOrganizationId = await createOrganization(
      'E2E Review Team',
      `e2e-review-team-${runId}`,
    );

    await db.insert(schema.issuerMemberships).values([
      {
        organizationId: issuerAOrganizationId,
        userId: issuerA.id,
        role: 'issuer_admin',
        status: 'active',
      },
      {
        organizationId: issuerBOrganizationId,
        userId: issuerB.id,
        role: 'issuer_admin',
        status: 'active',
      },
      {
        organizationId: reviewerOrganizationId,
        userId: reviewer.id,
        role: 'reviewer',
        status: 'active',
      },
    ]);

    const collisionContract = `0x${randomBytes(20).toString('hex')}`;
    issuerBApprovedSubmissionId = await createSubmission({
      organizationId: issuerBOrganizationId,
      submittedBy: issuerB.id,
      status: 'approved',
      network: 'ethereum',
      contractAddress: collisionContract,
      ticker: 'E2BB',
    });
    await db.insert(schema.stablecoinRegistryEntries).values({
      submissionId: issuerBApprovedSubmissionId,
      organizationId: issuerBOrganizationId,
      name: 'E2E E2BB',
      ticker: 'E2BB',
      network: 'ethereum',
      contractAddress: collisionContract,
      normalizedContractAddress: collisionContract,
      reserveDisclosure: 'Automated test fixture only.',
      attestationUrl: 'https://example.invalid/e2e-attestation',
    });

    registryCollisionSubmissionId = await createSubmission({
      organizationId: issuerAOrganizationId,
      submittedBy: issuerA.id,
      status: 'in_review',
      network: 'ethereum',
      contractAddress: collisionContract,
      ticker: 'E2AC',
    });
    approvableSubmissionId = await createSubmission({
      organizationId: issuerAOrganizationId,
      submittedBy: issuerA.id,
      status: 'in_review',
      network: 'base',
      contractAddress: `0x${randomBytes(20).toString('hex')}`,
      ticker: 'E2OK',
    });

    issuerAToken = await login(issuerA);
    issuerBToken = await login(issuerB);
    reviewerToken = await login(reviewer);
  });

  afterAll(async () => {
    if (db) {
      await db.transaction(async (tx) => {
        if (userIds.length) {
          await tx
            .delete(schema.auditLogs)
            .where(inArray(schema.auditLogs.userId, userIds));
          await tx
            .delete(schema.refreshTokens)
            .where(inArray(schema.refreshTokens.userId, userIds));
        }
        if (submissionIds.length) {
          await tx
            .delete(schema.submissionReviewEvents)
            .where(
              inArray(
                schema.submissionReviewEvents.submissionId,
                submissionIds,
              ),
            );
          await tx
            .delete(schema.stablecoinRegistryEntries)
            .where(
              inArray(
                schema.stablecoinRegistryEntries.submissionId,
                submissionIds,
              ),
            );
          await tx
            .delete(schema.stablecoinSubmissions)
            .where(inArray(schema.stablecoinSubmissions.id, submissionIds));
        }
        if (organizationIds.length) {
          await tx
            .delete(schema.issuerMemberships)
            .where(
              inArray(schema.issuerMemberships.organizationId, organizationIds),
            );
          await tx
            .delete(schema.issuerOrganizations)
            .where(inArray(schema.issuerOrganizations.id, organizationIds));
        }
        if (userIds.length) {
          await tx
            .delete(schema.users)
            .where(inArray(schema.users.id, userIds));
        }
      });
    }
    await app?.close();
  });

  it('requires authentication and scopes issuer data to its organization', async () => {
    await request(app!.getHttpServer()).get('/api/v1/issuer/me').expect(401);

    const ownProfile = await request(app!.getHttpServer())
      .get('/api/v1/issuer/me')
      .set('Authorization', `Bearer ${issuerAToken}`)
      .expect(200);
    const profile = ownProfile.body as ProfileResponse;
    expect(profile.submissions.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        registryCollisionSubmissionId,
        approvableSubmissionId,
      ]),
    );
    expect(profile.submissions.map((item) => item.id)).not.toContain(
      issuerBApprovedSubmissionId,
    );

    await request(app!.getHttpServer())
      .get(`/api/v1/issuer/submissions/${issuerBApprovedSubmissionId}`)
      .set('Authorization', `Bearer ${issuerAToken}`)
      .expect(404);
    await request(app!.getHttpServer())
      .get('/api/v1/admin/issuer/submissions')
      .set('Authorization', `Bearer ${issuerAToken}`)
      .expect(403);
  });

  it('allows reviewers to inspect the queue but requires complete decisions', async () => {
    const queueResponse = await request(app!.getHttpServer())
      .get('/api/v1/admin/issuer/submissions')
      .set('Authorization', `Bearer ${reviewerToken}`)
      .expect(200);
    const queue = queueResponse.body as Array<{ id: string }>;
    expect(queue.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        registryCollisionSubmissionId,
        approvableSubmissionId,
      ]),
    );

    await request(app!.getHttpServer())
      .post(
        `/api/v1/admin/issuer/submissions/${approvableSubmissionId}/decision`,
      )
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ decision: 'approved', checklist: [] })
      .expect(400);
    await request(app!.getHttpServer())
      .post(
        `/api/v1/admin/issuer/submissions/${registryCollisionSubmissionId}/decision`,
      )
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ decision: 'rejected' })
      .expect(400);

    await request(app!.getHttpServer())
      .get('/api/v1/admin/issuer/submissions')
      .set('Authorization', `Bearer ${issuerBToken}`)
      .expect(403);
  });

  it('rolls back a conflicting publication and publishes a valid approval atomically', async () => {
    await request(app!.getHttpServer())
      .post(
        `/api/v1/admin/issuer/submissions/${registryCollisionSubmissionId}/decision`,
      )
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ decision: 'approved', checklist: requiredChecklist })
      .expect(400);

    const [stillInReview] = await db!
      .select({ status: schema.stablecoinSubmissions.status })
      .from(schema.stablecoinSubmissions)
      .where(
        inArray(schema.stablecoinSubmissions.id, [
          registryCollisionSubmissionId,
        ]),
      );
    expect(stillInReview.status).toBe('in_review');

    const publishedResponse = await request(app!.getHttpServer())
      .post(
        `/api/v1/admin/issuer/submissions/${approvableSubmissionId}/decision`,
      )
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ decision: 'approved', checklist: requiredChecklist })
      .expect(201);
    expect((publishedResponse.body as SubmissionResponse).status).toBe(
      'approved',
    );

    const publicRegistry = await request(app!.getHttpServer())
      .get('/api/v1/registry/stablecoins')
      .expect(200);
    expect(
      (publicRegistry.body as Array<{ ticker: string }>).map(
        (entry) => entry.ticker,
      ),
    ).toContain('E2OK');

    const [reviewEvent] = await db!
      .select({ id: schema.submissionReviewEvents.id })
      .from(schema.submissionReviewEvents)
      .where(
        inArray(schema.submissionReviewEvents.submissionId, [
          approvableSubmissionId,
        ]),
      );
    const [registryEntry] = await db!
      .select({ id: schema.stablecoinRegistryEntries.id })
      .from(schema.stablecoinRegistryEntries)
      .where(
        inArray(schema.stablecoinRegistryEntries.submissionId, [
          approvableSubmissionId,
        ]),
      );
    expect(reviewEvent).toBeDefined();
    expect(registryEntry).toBeDefined();
  });
});
