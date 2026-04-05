export interface OnRampParams {
  walletId: string;
  solanaPubkey: string;
  amount: bigint;
  currency: string;
  idempotencyKey: string;
}

export interface OnRampResult {
  externalId: string;
  status: 'pending' | 'completed' | 'failed';
  amount: bigint;
  currency: string;
}

export interface OnRampProvider {
  initiateOnRamp(params: OnRampParams): Promise<OnRampResult>;
}

export const ONRAMP_PROVIDER = 'ONRAMP_PROVIDER';
