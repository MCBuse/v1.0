import {
  addDays,
  completedLocalDay,
  daysBetween,
  localDate,
  localDayStart,
} from './local-time';

const hours = (date: string, tz: string) =>
  (localDayStart(addDays(date, 1), tz).getTime() -
    localDayStart(date, tz).getTime()) /
  3_600_000;

describe('local time', () => {
  it('9.1.21 Europe/Berlin 25 h and 23 h local days; Africa/Accra ordinary days', () => {
    const berlin = 'Europe/Berlin';
    expect(hours('2026-10-25', berlin)).toBe(25);
    expect(hours('2026-03-29', berlin)).toBe(23);
    expect(hours('2026-10-24', berlin)).toBe(24);
    expect(localDayStart('2026-10-25', berlin).toISOString()).toBe(
      '2026-10-24T22:00:00.000Z',
    );
    expect(localDayStart('2026-10-26', berlin).toISOString()).toBe(
      '2026-10-25T23:00:00.000Z',
    );
    expect(localDayStart('2026-03-30', berlin).toISOString()).toBe(
      '2026-03-29T22:00:00.000Z',
    );

    // Bucketing across the 25 h day: every instant inside it lands on 2026-10-25.
    expect(localDate(new Date('2026-10-24T21:59:59Z'), berlin)).toBe(
      '2026-10-24',
    );
    expect(localDate(new Date('2026-10-24T22:00:00Z'), berlin)).toBe(
      '2026-10-25',
    );
    expect(localDate(new Date('2026-10-25T00:30:00Z'), berlin)).toBe(
      '2026-10-25',
    ); // 02:30 CEST
    expect(localDate(new Date('2026-10-25T01:30:00Z'), berlin)).toBe(
      '2026-10-25',
    ); // 02:30 CET (repeated hour)
    expect(localDate(new Date('2026-10-25T22:59:59Z'), berlin)).toBe(
      '2026-10-25',
    );
    expect(localDate(new Date('2026-10-25T23:00:00Z'), berlin)).toBe(
      '2026-10-26',
    );
    // 23 h day.
    expect(localDate(new Date('2026-03-28T22:59:59Z'), berlin)).toBe(
      '2026-03-28',
    );
    expect(localDate(new Date('2026-03-28T23:00:00Z'), berlin)).toBe(
      '2026-03-29',
    );
    expect(localDate(new Date('2026-03-29T21:59:59Z'), berlin)).toBe(
      '2026-03-29',
    );
    expect(localDate(new Date('2026-03-29T22:00:00Z'), berlin)).toBe(
      '2026-03-30',
    );

    const accra = 'Africa/Accra';
    expect(hours('2026-10-25', accra)).toBe(24);
    expect(hours('2026-03-29', accra)).toBe(24);
    expect(localDayStart('2026-10-25', accra).toISOString()).toBe(
      '2026-10-25T00:00:00.000Z',
    );
    expect(localDate(new Date('2026-10-25T23:59:59Z'), accra)).toBe(
      '2026-10-25',
    );
  });

  it('D is the most recent completed local day at asOf', () => {
    expect(
      completedLocalDay(new Date('2026-09-28T23:00:00Z'), 'Europe/Berlin'),
    ).toBe('2026-09-28'); // 01:00 on 29 Sep
    expect(
      completedLocalDay(new Date('2026-09-28T21:59:00Z'), 'Europe/Berlin'),
    ).toBe('2026-09-27');
    expect(
      completedLocalDay(new Date('2026-10-25T00:00:00Z'), 'Africa/Accra'),
    ).toBe('2026-10-24');
  });

  it('date arithmetic on YYYY-MM-DD strings', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(daysBetween('2026-08-27', '2026-09-28')).toBe(32);
    expect(daysBetween('2026-09-28', '2026-08-27')).toBe(-32);
  });

  it('localDate matches Intl minute by minute across DST changes and odd offsets', () => {
    const reference = (instant: Date, timeZone: string) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(instant);
    const spans: Array<[string, string]> = [
      ['Europe/Berlin', '2026-10-24T20:00:00Z'], // 25 h day
      ['Europe/Berlin', '2026-03-28T20:00:00Z'], // 23 h day
      ['Asia/Kathmandu', '2026-06-01T16:00:00Z'], // +05:45
      ['America/St_Johns', '2026-11-01T00:00:00Z'], // −03:30, DST end
      ['Australia/Lord_Howe', '2026-04-04T10:00:00Z'], // 30-minute DST
      ['America/Santiago', '2026-04-04T23:00:00Z'], // DST end at local midnight
    ];
    for (const [tz, start] of spans) {
      for (let minute = 0; minute < 36 * 60; minute += 1) {
        for (const ms of [0, 59_999]) {
          const instant = new Date(Date.parse(start) + minute * 60_000 + ms);
          expect(localDate(instant, tz)).toBe(reference(instant, tz));
        }
      }
    }
  });
});
