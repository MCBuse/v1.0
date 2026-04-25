/** In-memory widget URL — avoids huge Expo Router query params for signed MoonPay URLs. */
let entry: { transactionId: string; widgetUrl: string; redirectUrl: string } | null = null;

export function setOnrampWidgetSession(
  transactionId: string,
  widgetUrl: string,
  redirectUrl: string,
): void {
  entry = { transactionId, widgetUrl, redirectUrl };
}

export function takeOnrampWidgetSession(
  transactionId: string,
): { widgetUrl: string; redirectUrl: string } | null {
  if (!entry || entry.transactionId !== transactionId) return null;
  const { widgetUrl, redirectUrl } = entry;
  entry = null;
  return { widgetUrl, redirectUrl };
}
