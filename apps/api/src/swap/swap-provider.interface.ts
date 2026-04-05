export interface SwapPreviewParams {
  fromCurrency: string;
  toCurrency: string;
  fromAmount: bigint;
}

export interface SwapPreviewResult {
  fromCurrency: string;
  toCurrency: string;
  fromAmount: bigint;
  toAmount: bigint;
  /** Human-readable decimal rate, e.g. "0.92" */
  rate: string;
  fee: bigint;
  feeCurrency: string;
}

export interface SwapExecuteParams extends SwapPreviewParams {
  walletId: string;
  solanaPubkey: string;
  idempotencyKey: string;
}

export interface SwapExecuteResult {
  fromCurrency: string;
  toCurrency: string;
  fromAmount: bigint;
  toAmount: bigint;
  fee: bigint;
  feeCurrency: string;
  externalId: string;
  status: 'completed' | 'pending' | 'failed';
}

export interface SwapProvider {
  preview(params: SwapPreviewParams): Promise<SwapPreviewResult>;
  execute(params: SwapExecuteParams): Promise<SwapExecuteResult>;
}

export const SWAP_PROVIDER = 'SWAP_PROVIDER';
