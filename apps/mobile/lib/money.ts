const DEFAULT_DECIMALS = 6;

export interface MoneyAmount {
  baseUnits: string;
  currency: string;
  decimals: number;
}

export function createMoney(
  baseUnits: string,
  currency: string,
  decimals = DEFAULT_DECIMALS,
): MoneyAmount {
  return { baseUnits, currency, decimals };
}

export function displayUnitsToBaseUnits(
  display: string,
  decimals = DEFAULT_DECIMALS,
): string {
  const parts = display.split('.');
  const whole = parts[0] ?? '0';
  const frac = (parts[1] ?? '').padEnd(decimals, '0').slice(0, decimals);
  const combined = whole + frac;
  const stripped = combined.replace(/^0+/, '') || '0';
  return stripped;
}

export function baseUnitsToDisplay(
  baseUnits: string,
  decimals = DEFAULT_DECIMALS,
): string {
  const padded = baseUnits.padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals);
  const frac = padded.slice(padded.length - decimals);
  const trimmedFrac = frac.replace(/0+$/, '');
  return trimmedFrac.length > 0
    ? `${whole}.${trimmedFrac}`
    : whole;
}

export function addBaseUnits(a: string, b: string): string {
  const bigA = BigInt(a);
  const bigB = BigInt(b);
  return (bigA + bigB).toString();
}

export function subtractBaseUnits(a: string, b: string): string {
  const bigA = BigInt(a);
  const bigB = BigInt(b);
  const result = bigA - bigB;
  if (result < 0n) throw new Error('Insufficient balance');
  return result.toString();
}

export function compareBaseUnits(a: string, b: string): -1 | 0 | 1 {
  const bigA = BigInt(a);
  const bigB = BigInt(b);
  if (bigA < bigB) return -1;
  if (bigA > bigB) return 1;
  return 0;
}

export function isValidBaseUnits(value: string): boolean {
  return /^\d+$/.test(value) && value.length > 0;
}

export function isPositive(baseUnits: string): boolean {
  return BigInt(baseUnits) > 0n;
}

export function formatMoneyDisplay(
  baseUnits: string,
  currencySymbol: string,
  decimals = DEFAULT_DECIMALS,
): string {
  const display = baseUnitsToDisplay(baseUnits, decimals);
  const parts = display.split('.');
  const whole = parts[0] ?? '0';
  const frac = (parts[1] ?? '').padEnd(2, '0').slice(0, 2);
  return `${currencySymbol}${whole}.${frac}`;
}
