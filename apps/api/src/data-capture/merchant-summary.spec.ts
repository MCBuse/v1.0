import {
  buildMerchantActivitySummary,
  calculateCaptureQualityPercent,
  merchantCalendarDaySpan,
} from './merchant-summary';

describe('merchant activity summary', () => {
  it('uses the merchant calendar, zero-fills 30 days, and measures capture quality from capture evidence only', () => {
    const result = buildMerchantActivitySummary({
      now: new Date('2026-03-29T22:30:00.000Z'),
      timeZone: 'Europe/Berlin',
      transactions: [
        {
          displayAmountMinor: 100n,
          occurredAt: new Date('2026-03-29T21:30:00.000Z'),
        },
        {
          displayAmountMinor: 200n,
          occurredAt: new Date('2026-03-29T22:10:00.000Z'),
        },
      ],
      exceptions: [
        {
          reasonCode: 'malformed_event',
          createdAt: new Date('2026-03-29T22:05:00.000Z'),
        },
        {
          reasonCode: 'missed_event',
          createdAt: new Date('2026-03-29T22:06:00.000Z'),
        },
        {
          reasonCode: 'duplicate_event',
          createdAt: new Date('2026-03-29T22:07:00.000Z'),
        },
        {
          reasonCode: 'transfer_failed',
          createdAt: new Date('2026-03-29T22:08:00.000Z'),
        },
      ],
    });

    expect(result.receivedTodayMinor).toBe(200n);
    expect(result.received30DaysMinor).toBe(300n);
    expect(result.paymentCount30Days).toBe(2);
    expect(result.averageSaleMinor).toBe(150n);
    expect(result.dailyTrend).toHaveLength(30);
    expect(result.dailyTrend[0]?.start).toBe('2026-03-01');
    expect(result.dailyTrend.at(-1)).toEqual({
      start: '2026-03-30',
      amountMinor: '200',
      paymentCount: 1,
    });
    expect(result.captureQualityPercent).toBe(50);
    expect(result.lastCapturedAt).toBe('2026-03-29T22:10:00.000Z');
  });

  it('handles empty, malformed, missed, and duplicate capture evidence', () => {
    expect(calculateCaptureQualityPercent(0, [])).toBe(0);
    expect(calculateCaptureQualityPercent(1, ['malformed_event'])).toBe(50);
    expect(
      calculateCaptureQualityPercent(1, [
        'malformed_event',
        'missed_event',
        'duplicate_event',
      ]),
    ).toBe(33.33);
    expect(calculateCaptureQualityPercent(1, ['duplicate_event'])).toBe(100);
  });

  it('groups the repeated Europe/Berlin hour and excludes older merchant dates', () => {
    const result = buildMerchantActivitySummary({
      now: new Date('2026-10-25T22:30:00.000Z'),
      timeZone: 'Europe/Berlin',
      transactions: [
        {
          displayAmountMinor: 100n,
          occurredAt: new Date('2026-10-25T00:30:00.000Z'),
        },
        {
          displayAmountMinor: 200n,
          occurredAt: new Date('2026-10-25T01:30:00.000Z'),
        },
        {
          displayAmountMinor: 999n,
          occurredAt: new Date('2026-09-25T21:00:00.000Z'),
        },
      ],
      exceptions: [
        {
          reasonCode: 'missed_event',
          createdAt: new Date('2026-09-25T21:00:00.000Z'),
        },
      ],
    });

    expect(result.dailyTrend[0]?.start).toBe('2026-09-26');
    expect(result.dailyTrend.at(-1)).toEqual({
      start: '2026-10-25',
      amountMinor: '300',
      paymentCount: 2,
    });
    expect(result.hourlyRhythm[2]).toEqual({
      start: '02:00',
      amountMinor: '300',
      paymentCount: 2,
    });
    expect(result.received30DaysMinor).toBe(300n);
    expect(result.captureQualityPercent).toBe(100);
  });

  it('counts observed Berlin calendar days instead of elapsed 24-hour blocks', () => {
    expect(
      merchantCalendarDaySpan(
        new Date('2026-03-29T21:30:00.000Z'),
        new Date('2026-03-29T22:30:00.000Z'),
        'Europe/Berlin',
      ),
    ).toBe(2);
    expect(
      merchantCalendarDaySpan(
        new Date('2026-10-24T22:30:00.000Z'),
        new Date('2026-10-25T23:30:00.000Z'),
        'Europe/Berlin',
      ),
    ).toBe(2);
  });
});
