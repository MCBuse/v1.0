const DECIMALS = 6;
const SCALE = Math.pow(10, DECIMALS);

/** "1000000" → "1.00" */
export function formatAmount(baseUnits: string, decimals = DECIMALS): string {
  const scale = Math.pow(10, decimals);
  const num = parseInt(baseUnits, 10) / scale;
  return num.toFixed(2);
}

/** "1.50" (user display) → "1500000" (API base units) */
export function toBaseUnits(display: string, decimals = DECIMALS): string {
  const scale = Math.pow(10, decimals);
  const num = parseFloat(display) * scale;
  return Math.round(num).toString();
}

/** "1000000" + "USDC" → "$1.00 USDC" */
export function formatCurrency(baseUnits: string, currency: 'USDC' | 'EURC'): string {
  const symbol = currency === 'EURC' ? '€' : '$';
  return `${symbol}${formatAmount(baseUnits)} ${currency}`;
}

/** Shorten a Solana address for display: "AbCd…XyZw" */
export function truncateAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

export { SCALE, DECIMALS };
