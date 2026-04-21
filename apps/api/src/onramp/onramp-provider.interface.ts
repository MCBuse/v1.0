export interface OnRampParams {
  walletId: string;
  solanaPubkey: string;
  amount: bigint;
  currency: string;
  idempotencyKey: string;
  cardSourceId?: string; // Circle card ID from POST /onramp/cards
}

export interface OnRampResult {
  externalId: string;
  status: 'pending' | 'completed' | 'failed';
  amount: bigint;
  currency: string;
}

export interface OnRampProvider {
  readonly providerName: string;
  initiateOnRamp(params: OnRampParams): Promise<OnRampResult>;
}

export const ONRAMP_PROVIDER = 'ONRAMP_PROVIDER';
