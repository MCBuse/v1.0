import {
  buildTransactionAnalytics,
  type AnalyticsSale,
} from './transaction-analytics';

const TIMEZONE = 'Europe/Berlin';

function sale(
  isoLocal: string,
  amountMinor: bigint,
  source: AnalyticsSale['source'] = 'mcbuse_payment',
  paymentMethod = 'mcbuse_wallet',
): AnalyticsSale {
  // The suffix is the Berlin offset in September, so the local wall-clock
  // time in the test reads exactly as written.
  return {
    amountMinor,
    occurredAt: new Date(`${isoLocal}+02:00`),
    source,
    paymentMethod,
  };
}

const RANGE = {
  from: new Date('2026-09-01T00:00:00+02:00'),
  to: new Date('2026-09-07T23:59:59.999+02:00'),
};

function build(
  sales: AnalyticsSale[],
  overrides: Partial<Parameters<typeof buildTransactionAnalytics>[0]> = {},
) {
  return buildTransactionAnalytics({
    sales,
    previousSales: [],
    range: RANGE,
    timezone: TIMEZONE,
    grouping: 'day',
    now: new Date('2026-09-08T10:00:00+02:00'),
    ...overrides,
  });
}

describe('transaction analytics', () => {
  describe('totals', () => {
    it('reports recorded sales and the transaction count', () => {
      const result = build([
        sale('2026-09-01T10:00:00', 1_000n),
        sale('2026-09-02T11:00:00', 2_500n),
      ]);
      expect(result.totals.salesMinor).toBe('3500');
      expect(result.totals.transactionCount).toBe(2);
    });

    it('reports the average transaction value', () => {
      const result = build([
        sale('2026-09-01T10:00:00', 1_000n),
        sale('2026-09-02T11:00:00', 2_000n),
      ]);
      expect(result.totals.averageTransactionMinor).toBe('1500');
    });

    it('rounds the average to the nearest minor unit', () => {
      const result = build([
        sale('2026-09-01T10:00:00', 1_000n),
        sale('2026-09-02T11:00:00', 1_001n),
      ]);
      // 2001 / 2 = 1000.5, rounded to 1001
      expect(result.totals.averageTransactionMinor).toBe('1001');
    });

    it('reports a zero average rather than dividing by zero', () => {
      const result = build([]);
      expect(result.totals.transactionCount).toBe(0);
      expect(result.totals.averageTransactionMinor).toBe('0');
    });
  });

  describe('source split', () => {
    it('splits amounts, counts and shares between cash and digital', () => {
      const result = build([
        sale('2026-09-01T10:00:00', 7_500n, 'mcbuse_payment'),
        sale('2026-09-02T10:00:00', 2_500n, 'merchant_cash', 'cash'),
      ]);

      expect(result.bySource.digital).toEqual({
        amountMinor: '7500',
        count: 1,
        amountSharePercent: 75,
        countSharePercent: 50,
      });
      expect(result.bySource.cash).toEqual({
        amountMinor: '2500',
        count: 1,
        amountSharePercent: 25,
        countSharePercent: 50,
      });
    });

    it('reports zero shares when there are no sales', () => {
      const result = build([]);
      expect(result.bySource.digital.amountSharePercent).toBe(0);
      expect(result.bySource.cash.amountSharePercent).toBe(0);
    });

    it('keeps shares summing to a hundred', () => {
      const result = build([
        sale('2026-09-01T10:00:00', 1n, 'mcbuse_payment'),
        sale('2026-09-01T11:00:00', 2n, 'merchant_cash', 'cash'),
      ]);
      const total =
        result.bySource.digital.amountSharePercent +
        result.bySource.cash.amountSharePercent;
      expect(total).toBeCloseTo(100, 2);
    });
  });

  describe('payment method distribution', () => {
    it('groups by payment method, not by capture channel', () => {
      const result = build([
        sale('2026-09-01T10:00:00', 1_000n, 'mcbuse_payment', 'mcbuse_wallet'),
        sale('2026-09-01T11:00:00', 3_000n, 'mcbuse_payment', 'mcbuse_wallet'),
        sale('2026-09-02T10:00:00', 1_000n, 'merchant_cash', 'cash'),
      ]);

      expect(result.byPaymentMethod).toEqual([
        {
          method: 'mcbuse_wallet',
          amountMinor: '4000',
          count: 2,
          amountSharePercent: 80,
        },
        {
          method: 'cash',
          amountMinor: '1000',
          count: 1,
          amountSharePercent: 20,
        },
      ]);
    });

    it('orders methods by amount, largest first', () => {
      const result = build([
        sale('2026-09-01T10:00:00', 100n, 'merchant_cash', 'cash'),
        sale('2026-09-01T11:00:00', 900n, 'mcbuse_payment', 'mcbuse_wallet'),
      ]);
      expect(result.byPaymentMethod.map((m) => m.method)).toEqual([
        'mcbuse_wallet',
        'cash',
      ]);
    });
  });

  describe('grouping', () => {
    it('groups by day across the whole range, including empty days', () => {
      const result = build([sale('2026-09-03T10:00:00', 1_000n)]);
      expect(result.series).toHaveLength(7);
      expect(result.series[0].periodStart).toBe('2026-09-01');
      expect(result.series[6].periodStart).toBe('2026-09-07');
      expect(result.series[2].amountMinor).toBe('1000');
      expect(result.series[0].amountMinor).toBe('0');
    });

    it('groups by week when asked', () => {
      const result = buildTransactionAnalytics({
        sales: [
          sale('2026-09-01T10:00:00', 1_000n),
          sale('2026-09-09T10:00:00', 2_000n),
        ],
        previousSales: [],
        range: {
          from: new Date('2026-09-01T00:00:00+02:00'),
          to: new Date('2026-09-14T23:59:59.999+02:00'),
        },
        timezone: TIMEZONE,
        grouping: 'week',
        now: new Date('2026-09-15T10:00:00+02:00'),
      });
      // 1-14 September 2026 touches three ISO weeks: the 1st is a Tuesday and
      // the 14th is a Monday, which opens a third.
      expect(result.series.map((s) => s.periodStart)).toEqual([
        '2026-08-31',
        '2026-09-07',
        '2026-09-14',
      ]);
      expect(result.series[0].amountMinor).toBe('1000');
      expect(result.series[1].amountMinor).toBe('2000');
      expect(result.series[2].amountMinor).toBe('0');
    });

    it('spans each week Monday to Sunday', () => {
      const result = buildTransactionAnalytics({
        sales: [],
        previousSales: [],
        range: {
          from: new Date('2026-09-01T00:00:00+02:00'),
          to: new Date('2026-09-06T23:59:59.999+02:00'),
        },
        timezone: TIMEZONE,
        grouping: 'week',
        now: new Date('2026-09-10T10:00:00+02:00'),
      });
      expect(result.series[0].periodStart).toBe('2026-08-31');
      expect(result.series[0].periodEnd).toBe('2026-09-06');
    });

    it('groups by month when asked', () => {
      const result = buildTransactionAnalytics({
        sales: [
          sale('2026-08-15T10:00:00', 1_000n),
          sale('2026-09-05T10:00:00', 2_000n),
        ],
        previousSales: [],
        range: {
          from: new Date('2026-08-01T00:00:00+02:00'),
          to: new Date('2026-09-30T23:59:59.999+02:00'),
        },
        timezone: TIMEZONE,
        grouping: 'month',
        now: new Date('2026-10-01T10:00:00+02:00'),
      });
      expect(result.series.map((s) => s.periodStart)).toEqual([
        '2026-08-01',
        '2026-09-01',
      ]);
    });

    it('returns the whole range rather than truncating to a fixed number', () => {
      const result = buildTransactionAnalytics({
        sales: [],
        previousSales: [],
        range: {
          from: new Date('2026-06-01T00:00:00+02:00'),
          to: new Date('2026-09-07T23:59:59.999+02:00'),
        },
        timezone: TIMEZONE,
        grouping: 'day',
        now: new Date('2026-09-08T10:00:00+02:00'),
      });
      // 99 days, well past any 14-entry cut-off.
      expect(result.series.length).toBe(99);
    });

    it('carries an average per period', () => {
      const result = build([
        sale('2026-09-01T10:00:00', 1_000n),
        sale('2026-09-01T12:00:00', 3_000n),
      ]);
      expect(result.series[0].averageMinor).toBe('2000');
    });
  });

  describe('partial periods', () => {
    it('marks a period that has not finished yet', () => {
      const result = buildTransactionAnalytics({
        sales: [sale('2026-09-07T10:00:00', 1_000n)],
        previousSales: [],
        range: RANGE,
        timezone: TIMEZONE,
        grouping: 'day',
        // Still inside 7 September.
        now: new Date('2026-09-07T14:00:00+02:00'),
      });
      expect(result.series.at(-1)?.partial).toBe(true);
      expect(result.series[0].partial).toBe(false);
      expect(result.labels.partialPeriod).toBe(true);
    });

    it('marks nothing partial once the range is in the past', () => {
      const result = build([sale('2026-09-01T10:00:00', 1_000n)]);
      expect(result.series.every((s) => !s.partial)).toBe(true);
      expect(result.labels.partialPeriod).toBe(false);
    });
  });

  describe('trends', () => {
    it('compares sales, count and average against the previous period', () => {
      const result = build(
        [
          sale('2026-09-01T10:00:00', 1_000n),
          sale('2026-09-02T10:00:00', 1_000n),
        ],
        {
          previousSales: [sale('2026-08-25T10:00:00', 1_000n)],
        },
      );

      expect(result.trends.sales.currentMinor).toBe('2000');
      expect(result.trends.sales.previousMinor).toBe('1000');
      expect(result.trends.sales.changePercent).toBe(100);

      expect(result.trends.transactionCount.current).toBe(2);
      expect(result.trends.transactionCount.previous).toBe(1);
      expect(result.trends.transactionCount.changePercent).toBe(100);

      // Average is unchanged even though volume doubled.
      expect(result.trends.averageValue.changePercent).toBe(0);
    });

    it('labels a missing baseline instead of inventing a change', () => {
      const result = build([sale('2026-09-01T10:00:00', 1_000n)]);
      expect(result.trends.sales.changePercent).toBeNull();
      expect(result.trends.sales.baselineAvailable).toBe(false);
      expect(result.labels.missingBaseline).toBe(true);
    });

    it('reports a decline as a negative change', () => {
      const result = build([sale('2026-09-01T10:00:00', 500n)], {
        previousSales: [sale('2026-08-25T10:00:00', 1_000n)],
      });
      expect(result.trends.sales.changePercent).toBe(-50);
    });
  });

  describe('hourly rhythm', () => {
    it('always reports all twenty-four hours', () => {
      const result = build([sale('2026-09-01T09:00:00', 1_000n)]);
      expect(result.hourly).toHaveLength(24);
      expect(result.hourly[9]).toEqual({
        hour: 9,
        amountMinor: '1000',
        count: 1,
      });
      expect(result.hourly[0]).toEqual({ hour: 0, amountMinor: '0', count: 0 });
    });

    it('buckets by the merchant’s local hour, not UTC', () => {
      // 23:30 UTC on 1 September is 01:30 on 2 September in Berlin.
      const result = build([
        {
          amountMinor: 1_000n,
          occurredAt: new Date('2026-09-01T23:30:00Z'),
          source: 'mcbuse_payment',
          paymentMethod: 'mcbuse_wallet',
        },
      ]);
      expect(result.hourly[1].count).toBe(1);
      expect(result.series[1].amountMinor).toBe('1000');
    });
  });

  describe('peak hours and trading windows', () => {
    it('names the peak hour by amount', () => {
      const result = build([
        sale('2026-09-01T09:00:00', 1_000n),
        sale('2026-09-01T17:00:00', 5_000n),
      ]);
      expect(result.peakHour).toEqual({
        hour: 17,
        amountMinor: '5000',
        count: 1,
      });
    });

    it('has no peak hour when nothing was sold', () => {
      expect(build([]).peakHour).toBeNull();
    });

    it('finds the busiest contiguous three-hour window', () => {
      const result = build([
        sale('2026-09-01T08:00:00', 1_000n),
        sale('2026-09-01T12:00:00', 4_000n),
        sale('2026-09-01T13:00:00', 4_000n),
        sale('2026-09-01T14:00:00', 1_000n),
      ]);
      expect(result.busiestWindow).toEqual({
        startHour: 12,
        endHour: 14,
        amountMinor: '9000',
        count: 3,
        amountSharePercent: 90,
      });
    });

    it('reports the trading window actually observed', () => {
      const result = build([
        sale('2026-09-01T08:00:00', 1_000n),
        sale('2026-09-01T19:00:00', 1_000n),
      ]);
      expect(result.tradingWindow).toEqual({ firstHour: 8, lastHour: 19 });
    });

    it('has no trading window without sales', () => {
      expect(build([]).tradingWindow).toBeNull();
    });
  });
});
