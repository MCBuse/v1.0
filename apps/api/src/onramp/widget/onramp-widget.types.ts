export type NormalizedOnrampStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired';

export interface NormalizedOnrampEvent {
  externalTransactionId: string;
  status: NormalizedOnrampStatus;
  cryptoAmount?: string;
  cryptoCurrency?: string;
  fiatAmount?: string;
  fiatCurrency?: string;
  txHash?: string;
  walletAddress: string;
  providerRawStatus: string;
  /** Our internal reference echoed by the provider (MoonPay externalTransactionId field) */
  internalReference?: string;
  /** MoonPay transaction id when applicable */
  moonpayTransactionId?: string;
}

export interface CreateWidgetSessionParams {
  userId: string;
  walletId: string;
  walletAddress: string;
  fiatAmount: string;
  fiatCurrency: string;
  cryptoCurrency: string;
  network: string;
  redirectUrl: string;
  internalReference: string;
}

export interface CreateWidgetSessionResult {
  widgetUrl: string;
  internalReference: string;
}
