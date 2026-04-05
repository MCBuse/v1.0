export interface OffRampParams {
  walletId: string;
  solanaPubkey: string;
  amount: bigint;
  currency: string;
  /** Opaque reference for the destination (bank account ID, IBAN, etc.) */
  bankAccountRef?: string;
  idempotencyKey: string;
}

export interface OffRampResult {
  externalId: string;
  status: 'pending' | 'completed' | 'failed';
  amount: bigint;
  currency: string;
  /** Estimated settlement time as an ISO 8601 string, if known */
  estimatedSettlement?: string;
}

export interface OffRampProvider {
  readonly providerName: string;
  initiateOffRamp(params: OffRampParams): Promise<OffRampResult>;
}

export const OFFRAMP_PROVIDER = 'OFFRAMP_PROVIDER';
