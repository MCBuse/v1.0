/** Formatters are expensive to build; one per timezone and purpose is reused. */
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string, kind: 'date' | 'offset') {
  const key = `${kind}:${timeZone}`;
  let found = formatters.get(key);
  if (!found) {
    found = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...(kind === 'offset'
        ? { hour: 'numeric', minute: 'numeric', second: 'numeric' }
        : {}),
    });
    formatters.set(key, found);
  }
  return found;
}

const HOUR_MS = 3_600_000;
/** `${timeZone}|${utc hour}` → local date, for hours that lie within one local date. */
const hourDates = new Map<string, string>();

/**
 * Local calendar date (YYYY-MM-DD) of an instant in an IANA timezone.
 * Memoized per UTC hour (a run formats every sale line, §9.6): an hour whose
 * first and last millisecond share a local date is cached; an hour containing
 * a local midnight (any offset, e.g. +05:45) is computed exactly every time.
 * Assumes no clock change jumps back across local midnight and returns to the
 * same date within one hour (none in current tz data; a DST end at midnight,
 * e.g. America/Santiago, is covered by the spec).
 */
export function localDate(instant: Date, timeZone: string): string {
  const hour = Math.floor(instant.getTime() / HOUR_MS);
  const key = `${timeZone}|${hour}`;
  const cached = hourDates.get(key);
  if (cached) return cached;
  const date = formatLocalDate(instant, timeZone);
  if (
    formatLocalDate(new Date(hour * HOUR_MS), timeZone) === date &&
    formatLocalDate(new Date((hour + 1) * HOUR_MS - 1), timeZone) === date
  ) {
    // ponytail: bounded by clearing; an LRU is not worth it for ~2k hours per run.
    if (hourDates.size >= 100_000) hourDates.clear();
    hourDates.set(key, date);
  }
  return date;
}

function formatLocalDate(instant: Date, timeZone: string): string {
  const parts = formatter(timeZone, 'date').formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year').padStart(4, '0')}-${get('month')}-${get('day')}`;
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
  const parts = formatter(timeZone, 'offset').formatToParts(instant);
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
