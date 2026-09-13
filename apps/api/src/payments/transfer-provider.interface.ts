export interface TransferParams {
  payerWalletId: string;
  payerPubkey: string;
  payerEncryptedKeypair: string;
  payeeWalletId: string;
  payeePubkey: string;
  amount: bigint;
  currency: string;
  idempotencyKey: string;
  onSignaturePrepared?: (txSignature: string) => Promise<void>;
  onSubmitted?: (txSignature: string) => Promise<void>;
}

export interface TransferResult {
  txSignature: string | null;
  status: 'completed' | 'pending' | 'failed';
}

export interface TransferProvider {
  execute(params: TransferParams): Promise<TransferResult>;
  getStatus(txSignature: string): Promise<'finalized' | 'pending' | 'failed'>;
}

export const TRANSFER_PROVIDER = 'TRANSFER_PROVIDER';
