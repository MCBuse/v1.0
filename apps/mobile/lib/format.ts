const DECIMALS = 6;
const DIVISOR = 10 ** DECIMALS;

/** Convert API base-unit string to a JS float. "5000000" → 5.0 */
export function fromBaseUnits(amount: string | bigint): number {
  return Number(BigInt(String(amount))) / DIVISOR;
}

/** Convert a user-entered display string to base-unit string. "5.50" → "5500000" */
export function toBaseUnits(displayAmount: string): string {
  const cleaned = displayAmount.replace(/[^0-9.]/g, '');
  if (!cleaned || cleaned === '0' || cleaned === '') return '0';
  const [whole = '0', frac = ''] = cleaned.split('.');
  const fracPadded = frac.padEnd(DECIMALS, '0').slice(0, DECIMALS);
  return (BigInt(whole) * BigInt(DIVISOR) + BigInt(fracPadded)).toString();
}

/** Format a base-unit string as a display dollar amount. Optional currency suffix. */
export function formatAmount(baseUnits: string | bigint, currency?: string): string {
  const amount = fromBaseUnits(baseUnits);
  const n = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return currency ? `${n} ${currency}` : `$${n}`;
}

/** "2m ago" / "3h ago" / "Yesterday" / "Mar 15" */
export function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "Good morning" / "Good afternoon" / "Good evening" */
export function greetingForTime(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
