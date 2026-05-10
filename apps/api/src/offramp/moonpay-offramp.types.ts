export type NormalizedOfframpStatus =
  | 'pending'
  | 'waiting_for_deposit'
  | 'deposit_submitted'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'requote_required'
  | 'refund_pending';

export type NormalizedMoonpaySellEvent = {
  externalTransactionId: string;
  internalReference?: string;
  status: NormalizedOfframpStatus;
  providerRawStatus: string;
  cryptoAmount?: string;
  cryptoCurrency?: string;
  fiatAmount?: string;
  fiatCurrency?: string;
  depositWalletAddress?: string;
  depositWalletAddressTag?: string | null;
  depositTxHash?: string;
  refundTxHash?: string;
  trackerUrl?: string;
};

export type MoonpaySellTransaction = {
  id?: string;
  externalTransactionId?: string | null;
  status?: string;
  baseCurrencyAmount?: number | string | null;
  quoteCurrencyAmount?: number | string | null;
  baseCurrency?: { code?: string; metadata?: { networkCode?: string | null } } | string | null;
  quoteCurrency?: { code?: string } | string | null;
  depositWallet?: {
    walletAddress?: string | null;
    walletAddressTag?: string | null;
  } | null;
  depositHash?: string | null;
  refundHash?: string | null;
  returnUrl?: string | null;
};
