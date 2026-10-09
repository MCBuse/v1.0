import { Test, type TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Application } from 'express';
import type { Server } from 'node:http';
import * as supertest from 'supertest';
import { IssuersModule } from './issuers.module';
import { IssuersService } from './issuers.persistence.service';

type HttpTestResponse = { body: unknown };
type HttpRequestBuilder = {
  get(path: string): { expect(status: number): Promise<HttpTestResponse> };
  patch(path: string): {
    send(body: unknown): { expect(status: number): Promise<HttpTestResponse> };
  };
  post(path: string): {
    send(body: unknown): { expect(status: number): Promise<HttpTestResponse> };
    expect(status: number): Promise<HttpTestResponse>;
  };
};
const request = supertest.default as unknown as (
  server: Server,
) => HttpRequestBuilder;

const issuerService = {
  getProfile: jest.fn().mockResolvedValue({
    organizations: [
      { id: 'org-test', slug: 'test-issuer', role: 'issuer_admin' },
    ],
    submissions: [{ id: 'req-test', name: 'Test Dollar', status: 'in_review' }],
  }),
  createSubmission: jest
    .fn()
    .mockImplementation((_userId: string, dto: Record<string, string>) => ({
      id: 'req-created',
      ...dto,
      status: 'draft',
    })),
  submitForReview: jest.fn().mockResolvedValue({
    id: 'req-created',
    status: 'in_review',
  }),
  updateSubmission: jest.fn().mockResolvedValue({
    id: 'req-created',
    status: 'needs_changes',
  }),
  decideSubmission: jest.fn().mockResolvedValue({
    id: 'req-test',
    status: 'needs_changes',
    reviewReason: 'Please update the reserve attestation.',
  }),
};

describe('Issuers API', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [IssuersModule],
    })
      .overrideProvider(IssuersService)
      .useValue(issuerService)
      .compile();

    app = moduleRef.createNestApplication();
    const expressApplication = app
      .getHttpAdapter()
      .getInstance() as Application;
    expressApplication.use((request, _response, next) => {
      Object.assign(request, { user: { id: 'test-issuer-user' } });
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns the issuer profile and submissions', async () => {
    const response = await request(app.getHttpServer<Server>() as Server)
      .get('/issuer/me')
      .expect(200);
    const profile = response.body as {
      organizations: Array<{ slug: string; role: string }>;
      submissions: unknown[];
    };

    expect(profile.organizations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: 'test-issuer',
          role: 'issuer_admin',
        }),
      ]),
    );
    expect(profile.submissions.length).toBeGreaterThan(0);
    expect(issuerService.getProfile).toHaveBeenCalledWith('test-issuer-user');
  });

  it('creates a draft submission and then submits it for review', async () => {
    const createResponse = await request(app.getHttpServer<Server>() as Server)
      .post('/issuer/submissions')
      .send({
        issuer: 'Northstar Labs',
        name: 'Harbor Dollar',
        ticker: 'HUD',
        network: 'Ethereum',
        contract: '0xabc1234567890abcdef1234567890abcdef1234',
        reserve: 'Cash equivalents and treasury bills',
        attestation: 'https://northstar.example/harbor/reserve-attestation',
      })
      .expect(201);
    const createdSubmission = createResponse.body as {
      id: string;
      name: string;
      status: string;
    };

    expect(createdSubmission).toMatchObject({
      name: 'Harbor Dollar',
      status: 'draft',
    });
    expect(issuerService.createSubmission).toHaveBeenCalledWith(
      'test-issuer-user',
      expect.objectContaining({ ticker: 'HUD' }),
    );

    const submitResponse = await request(app.getHttpServer<Server>() as Server)
      .post(`/issuer/submissions/${createdSubmission.id}/submit`)
      .expect(201);
    const submitted = submitResponse.body as { status: string };

    expect(submitted.status).toBe('in_review');
    expect(issuerService.submitForReview).toHaveBeenCalledWith(
      'test-issuer-user',
      'req-created',
    );
  });

  it('updates a returned submission before resubmission', async () => {
    const response = await request(app.getHttpServer<Server>() as Server)
      .patch('/issuer/submissions/req-created')
      .send({ name: 'Harbor Dollar Revised' })
      .expect(200);

    expect(response.body).toMatchObject({ status: 'needs_changes' });
    expect(issuerService.updateSubmission).toHaveBeenCalledWith(
      'test-issuer-user',
      'req-created',
      expect.objectContaining({ name: 'Harbor Dollar Revised' }),
    );
  });

  it('records a reviewer request for changes with its reason', async () => {
    const response = await request(app.getHttpServer<Server>() as Server)
      .post('/admin/issuer/submissions/req-test/decision')
      .send({
        decision: 'changes_requested',
        reason: 'Please update the reserve attestation.',
        checklist: ['Token contract matches the submitted details'],
      })
      .expect(201);

    expect(response.body).toMatchObject({
      status: 'needs_changes',
      reviewReason: 'Please update the reserve attestation.',
    });
    expect(issuerService.decideSubmission).toHaveBeenCalledWith(
      'test-issuer-user',
      'req-test',
      expect.objectContaining({ decision: 'changes_requested' }),
    );
  });
});
