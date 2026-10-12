import type { DrizzleDB } from '../database/database.provider';
import * as schema from '../database/schema';
import { IssuersService } from './issuers.persistence.service';

function query(rows: unknown[]) {
  const builder = {
    from: jest.fn(),
    innerJoin: jest.fn(),
    where: jest.fn(),
    for: jest.fn(),
    orderBy: jest.fn().mockResolvedValue(rows),
    limit: jest.fn().mockResolvedValue(rows),
  };
  builder.from.mockReturnValue(builder);
  builder.innerJoin.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  builder.for.mockReturnValue(builder);
  return builder;
}

describe('IssuersService', () => {
  it('returns a submission to the issuer with an append-only reviewer reason', async () => {
    const submittedAt = new Date('2026-10-01T12:00:00.000Z');
    const lockedSubmission = {
      id: 'submission-1',
      organizationId: 'organization-1',
      status: 'in_review',
    };
    const returnedSubmission = {
      ...lockedSubmission,
      issuer: 'Cedar Trust',
      name: 'Cedar USD',
      ticker: 'CUSD',
      network: 'ethereum',
      contractAddress: '0xcedar',
      reserveDisclosure: 'Cash',
      attestationUrl: 'https://cedar.example/attestation',
      status: 'needs_changes',
      submittedAt,
    };
    const selectResults: unknown[][] = [
      [{ id: 'reviewer-membership' }],
      [{ id: 'reviewer-membership' }],
      [returnedSubmission],
      [{ submissionId: 'submission-1', reason: 'Replace the expired attestation.' }],
    ];
    const updatedValues: { status?: string } = {};
    const insertedEvents: Array<{ table: unknown; values: unknown }> = [];

    const updateBuilder = {
      set: jest.fn((values: { status?: string }) => {
        Object.assign(updatedValues, values);
        return updateBuilder;
      }),
      where: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([returnedSubmission]),
    };
    const transaction = {
      select: jest.fn(() => query([lockedSubmission])),
      update: jest.fn(() => updateBuilder),
      insert: jest.fn((table: unknown) => ({
        values: jest.fn(async (values: unknown) => {
          insertedEvents.push({ table, values });
          return [];
        }),
      })),
    };
    const db = {
      select: jest.fn(() => query(selectResults.shift() ?? [])),
      transaction: jest.fn(async (work: (tx: typeof transaction) => Promise<unknown>) => work(transaction)),
    } as unknown as DrizzleDB;
    const service = new IssuersService(db);

    const result = await service.decideSubmission('reviewer-1', 'submission-1', {
      decision: 'changes_requested',
      reason: 'Replace the expired attestation.',
      checklist: [],
    });

    expect(updatedValues.status).toBe('needs_changes');
    expect(insertedEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: schema.submissionReviewEvents,
        values: expect.objectContaining({
          action: 'changes_requested',
          reason: 'Replace the expired attestation.',
        }),
      }),
    ]));
    expect(result).toMatchObject({
      id: 'submission-1',
      status: 'needs_changes',
      reviewReason: 'Replace the expired attestation.',
    });
  });
});