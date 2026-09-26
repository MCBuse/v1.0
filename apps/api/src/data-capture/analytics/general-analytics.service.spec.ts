import { GeneralAnalyticsService } from './general-analytics.service';

/**
 * A stand-in for Drizzle: every `select()` chain resolves to the next queued
 * result, in the order the service issues its queries.
 */
function fakeDb(results: unknown[][]) {
  let next = 0;
  return {
    select: () => {
      const rows = results[next++] ?? [];
      const chain: Record<string, unknown> = {};
      for (const method of ['from', 'innerJoin', 'where'])
        chain[method] = () => chain;
      chain.then = (
        resolve: (value: unknown) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(rows).then(resolve, reject);
      return chain;
    },
  };
}

describe('GeneralAnalyticsService record inclusion', () => {
  const now = new Date('2026-09-20T12:00:00.000Z');
  const at = (hoursAgo: number) =>
    new Date(now.getTime() - hoursAgo * 3_600_000);
  const merchants = {
    requireMerchant: () =>
      Promise.resolve({ merchantId: 'merchant-1', timezone: 'UTC' }),
  };

  // Digital receipts from every evidence environment, plus one cash sale.
  const digitalRows = [
    { amount: 1_000n, occurredAt: at(1), environment: 'live' },
    { amount: 2_000n, occurredAt: at(2), environment: 'test' },
    { amount: 3_000n, occurredAt: at(3), environment: 'synthetic' },
    { amount: 4_000n, occurredAt: at(4), environment: 'unknown' },
  ];
  const cashRows = [{ amount: 500n, occurredAt: at(5) }];

  const run = (source?: 'mcbuse_payment' | 'merchant_cash') => {
    const db = fakeDb([digitalRows, cashRows, [], [], [], [], [], []]);
    const service = new GeneralAnalyticsService(
      db as never,
      merchants as never,
    );
    return service.forMerchant('user-1', { period: '7d', source, now });
  };

  it('counts every record irrespective of its evidence environment', async () => {
    const result = await run();
    expect(result.transactions.totals.transactionCount).toBe(5);
    expect(result.transactions.totals.salesMinor).toBe('10500');
    expect(result.transactions.bySource.digital.count).toBe(4);
    expect(result.transactions.bySource.cash.count).toBe(1);
    expect(result.filters).toEqual({ source: 'all', applied: false });
  });

  it('still narrows by source, and reports that as the only filter', async () => {
    const result = await run('merchant_cash');
    expect(result.transactions.totals.transactionCount).toBe(1);
    expect(result.transactions.totals.salesMinor).toBe('500');
    expect(result.filters).toEqual({ source: 'merchant_cash', applied: true });
  });
});
