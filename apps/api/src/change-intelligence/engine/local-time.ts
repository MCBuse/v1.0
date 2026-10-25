import { merchantLocalDateKey } from '../../data-capture/merchant-summary';

/** Local calendar date (YYYY-MM-DD) of an instant in an IANA timezone. */
export function localDate(instant: Date, timeZone: string): string {
  return merchantLocalDateKey(instant, timeZone);
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

/** D: the most recent completed local day at `asOf`. */
export function completedLocalDay(asOf: Date, timeZone: string): string {
  return addDays(localDate(asOf, timeZone), -1);
}

function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant a local day begins (local midnight), correct on 23 h and 25 h days. */
export function localDayStart(date: string, timeZone: string): Date {
  const wall = Date.parse(`${date}T00:00:00Z`);
  let guess = wall - offsetMs(new Date(wall), timeZone);
  guess = wall - offsetMs(new Date(guess), timeZone);
  return new Date(guess);
}
