/** In-memory cache of the active MoonPay widget URL keyed by transactionId.
 * Avoids stuffing large signed URLs through Expo Router query params. */
let entry: { transactionId: string; widgetUrl: string } | null = null;

export function setOnrampWidgetSession(transactionId: string, widgetUrl: string): void {
  entry = { transactionId, widgetUrl };
}

export function takeOnrampWidgetSession(transactionId: string): { widgetUrl: string } | null {
  if (!entry || entry.transactionId !== transactionId) return null;
  const { widgetUrl } = entry;
  entry = null;
  return { widgetUrl };
}
