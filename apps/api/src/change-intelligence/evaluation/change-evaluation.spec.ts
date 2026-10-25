import {
  createStore,
  productFixture,
  repeat,
  saleLines,
} from '../engine/fixtures';
import { addDays, localDate } from '../engine/local-time';
import {
  arithmeticChecks,
  dayRange,
  forecastWape,
  injectShift,
  qualifyingCounts,
  replayDays,
  seededRandom,
  type History,
} from './change-evaluation';

const TZ = 'Europe/Berlin';
const LAST = '2026-09-20';

const history = (daily: number[]): History => ({
  merchantId: 'm',
  timezone: TZ,
  products: [
    productFixture({
      id: 'a',
      name: 'Cappuccino',
      historyStart: new Date('2026-06-01T00:00:00Z'),
    }),
  ],
  sales: saleLines({
    productId: 'a',
    lastDay: LAST,
    dailyUnits: daily,
    timezone: TZ,
  }),
});

describe('evaluation export helpers', () => {
  it('seeded injection is deterministic and scales units from the shift day', () => {
    const h = history(repeat(4, 42));
    const from = addDays(LAST, -6);
    const a = injectShift(h, 'a', 1.5, from, seededRandom('s'));
    const b = injectShift(h, 'a', 1.5, from, seededRandom('s'));
    expect(a).toEqual(b);
    const unitsFrom = (lines: typeof a, day: string) =>
      lines
        .filter((l) => localDate(l.occurredAt, TZ) >= day)
        .reduce((n, l) => n + l.quantity, 0);
    expect(
      unitsFrom(injectShift(h, 'a', 2, from, seededRandom('x')), from),
    ).toBe(2 * 4 * 7);
    const early = (lines: typeof a) =>
      lines.filter((l) => localDate(l.occurredAt, TZ) < from);
    expect(early(a)).toEqual(early(h.sales));
    expect(
      unitsFrom(injectShift(h, 'a', 0.5, from, seededRandom('y')), from),
    ).toBeLessThan(28);
  });

  it('replays daily evaluations and reproduces the arithmetic independently', () => {
    const h = history([...repeat(4, 35), ...repeat(8, 7)]);
    const days = dayRange(addDays(LAST, -8), LAST);
    const records = replayDays(
      h,
      createStore({ merchantId: 'm', timezone: TZ }),
      days,
      h.sales,
      true,
    );
    const counts = qualifyingCounts(h, records, 2.5);
    expect(counts.evaluations).toBe(days.length);
    expect(counts.qualifying).toBeGreaterThan(0);
    expect(counts.confirmedCases.map((c) => c.type)).toEqual([
      'unit_demand_increase',
    ]);
    expect(arithmeticChecks(h, records).mismatches).toBe(0);
    const wape = forecastWape(h, records, addDays(LAST, -41), LAST);
    expect(wape.evaluations).toBe(2); // only days whose next 7 days are recorded
  });
});
