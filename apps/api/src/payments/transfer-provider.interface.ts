export interface TransferParams {
  payerWalletId: string;
  payerPubkey: string;
  payerEncryptedKeypair: string;
  payeeWalletId: string;
  payeePubkey: string;
  amount: bigint;
  currency: string;
  idempotencyKey: string;
}

export interface TransferResult {
  txSignature: string | null;
  status: 'completed' | 'failed';
}

export interface TransferProvider {
  execute(params: TransferParams): Promise<TransferResult>;
}

export const TRANSFER_PROVIDER = 'TRANSFER_PROVIDER';
