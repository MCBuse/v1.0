/**
 * Mobile-side hooks for provider-specific WebView behaviour (redirect schemes, close events).
 * MoonPay is the first implementation; Transak/Ramp can add matching clients later.
 */
export interface OnrampWebClient {
  readonly providerName: string;
  /** Return true when navigation to this URL should close the widget and continue in-app. */
  isCompletionUrl(url: string, redirectBase: string): boolean;
}
