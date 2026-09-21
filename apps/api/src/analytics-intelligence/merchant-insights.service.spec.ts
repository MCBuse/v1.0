import { ConfigService } from '@nestjs/config';
import { MerchantInsightsService } from './merchant-insights.service';

describe('insight freshness', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    { ageMinutes: 360, threshold: undefined, stale: false },
    { ageMinutes: 375, threshold: undefined, stale: false },
    { ageMinutes: 376, threshold: undefined, stale: true },
    { ageMinutes: 61, threshold: 60, stale: true },
  ])('reports stale=$stale after $ageMinutes minutes', async ({ ageMinutes, threshold, stale }) => {
    const now = new Date('2026-09-19T12:00:00Z');
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
    const snapshot = {
      id: 'snapshot', calculationVersion: 'merchant-intelligence-v1',
      generatedAt: new Date(now.getTime() - ageMinutes * 60_000),
      periodFrom: now, periodTo: now, sourceCoverage: {}, snapshot: { metrics: {} },
    };
    const query = (records: unknown[]) => ({
      from: jest.fn().mockReturnThis(), innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(records),
    });
    const insights = query([]);
    insights.orderBy.mockResolvedValue([]);
    // The reads, in the order the service makes them: the merchant, its latest
    // snapshot, whether the last refresh failed, then the active insights.
    const db = { select: jest.fn()
      .mockReturnValueOnce(query([{ merchantId: 'merchant', publicId: 'merchant-public' }]))
      .mockReturnValueOnce(query([snapshot]))
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(insights),
    };
    const config = new ConfigService({
      MERCHANT_INTELLIGENCE_ENABLED: 'true',
      ...(threshold === undefined ? {} : { MERCHANT_INTELLIGENCE_STALE_AFTER_MINUTES: threshold }),
    });
    const service = new MerchantInsightsService(
      db as unknown as ConstructorParameters<typeof MerchantInsightsService>[0],
      config,
      {} as ConstructorParameters<typeof MerchantInsightsService>[2],
    );
    const result = await service.getForUser('user');
    expect(result.stale).toBe(stale);
    expect(result.generatedAt).toBe(snapshot.generatedAt.toISOString());
    // N.13 — the same judgement, with the age it was made from.
    expect(result.freshness).toEqual({
      generatedAt: snapshot.generatedAt.toISOString(),
      ageSeconds: ageMinutes * 60,
      stale,
      staleAfterMinutes: threshold ?? 375,
    });
    expect(result.lastFailure).toBeNull();
  });

  it('reports the last failed refresh alongside the figures', async () => {
    const now = new Date('2026-09-19T12:00:00Z');
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
    const failedAt = new Date(now.getTime() - 20 * 60_000);
    const snapshot = {
      id: 'snapshot', calculationVersion: 'merchant-intelligence-v1',
      generatedAt: new Date(now.getTime() - 30 * 60_000),
      periodFrom: now, periodTo: now, sourceCoverage: {}, snapshot: { metrics: {} },
    };
    const query = (records: unknown[]) => ({
      from: jest.fn().mockReturnThis(), innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(records),
    });
    const insights = query([]);
    insights.orderBy.mockResolvedValue([]);
    const db = { select: jest.fn()
      .mockReturnValueOnce(query([{ merchantId: 'merchant', publicId: 'merchant-public' }]))
      .mockReturnValueOnce(query([snapshot]))
      .mockReturnValueOnce(query([{ attempts: 3, lastError: 'engine timed out', lastQueuedAt: failedAt }]))
      .mockReturnValueOnce(insights),
    };
    const service = new MerchantInsightsService(
      db as unknown as ConstructorParameters<typeof MerchantInsightsService>[0],
      new ConfigService({ MERCHANT_INTELLIGENCE_ENABLED: 'true' }),
      {} as ConstructorParameters<typeof MerchantInsightsService>[2],
    );

    const result = await service.getForUser('user');

    expect(result.lastFailure).toEqual({
      at: failedAt.toISOString(),
      reason: 'engine timed out',
      attempts: 3,
    });
    // The figures that did load are still returned: the failure is a caveat.
    expect(result.status).toBe('ready');
  });

  it('says nothing about failures when the worker is healthy', async () => {
    const now = new Date('2026-09-19T12:00:00Z');
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
    const snapshot = {
      id: 'snapshot', calculationVersion: 'merchant-intelligence-v1',
      generatedAt: now, periodFrom: now, periodTo: now,
      sourceCoverage: {}, snapshot: { metrics: {} },
    };
    const query = (records: unknown[]) => ({
      from: jest.fn().mockReturnThis(), innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(records),
    });
    const insights = query([]);
    insights.orderBy.mockResolvedValue([]);
    const db = { select: jest.fn()
      .mockReturnValueOnce(query([{ merchantId: 'merchant', publicId: 'merchant-public' }]))
      .mockReturnValueOnce(query([snapshot]))
      // A queue row with attempts but no error is not a failure.
      .mockReturnValueOnce(query([{ attempts: 1, lastError: null, lastQueuedAt: now }]))
      .mockReturnValueOnce(insights),
    };
    const service = new MerchantInsightsService(
      db as unknown as ConstructorParameters<typeof MerchantInsightsService>[0],
      new ConfigService({ MERCHANT_INTELLIGENCE_ENABLED: 'true' }),
      {} as ConstructorParameters<typeof MerchantInsightsService>[2],
    );

    expect((await service.getForUser('user')).lastFailure).toBeNull();
  });
});
