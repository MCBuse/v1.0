import { z } from 'zod';

export type ConnectivityMode = 'online' | 'poor' | 'offline';

export const PaymentInstruction = z.object({
  version: z.literal(1),
  paymentId: z.string(),
  payerWalletId: z.string(),
  payeeId: z.string(),
  stablecoinTicker: z.string(),
  amount: z.string(),
  offlineAllowanceId: z.string().nullable(),
  nonce: z.number().int(),
  timestamp: z.number().int(),
  expiresAt: z.number().int(),
  signature: z.string(),
});
export type PaymentInstruction = z.infer<typeof PaymentInstruction>;

export type OutboxStatus =
  | 'queued'
  | 'signed'
  | 'sending'
  | 'sent'
  | 'synced'
  | 'failed';

export interface OutboxEntry {
  id: string;
  instruction: PaymentInstruction;
  status: OutboxStatus;
  transport: 'internet' | 'sms' | 'local';
  attempts: number;
  lastAttemptAt: number | null;
  createdAt: number;
  syncedAt: number | null;
  errorMessage: string | null;
}

export interface OfflineAllowance {
  id: string;
  walletId: string;
  maxBalance: string;
  maxTransactionAmount: string;
  maxCumulativeSpending: string;
  spent: string;
  expiresAt: number;
  transactionCounter: number;
}

export function createPaymentInstructionPayload(
  params: Omit<PaymentInstruction, 'version' | 'signature'>,
): Uint8Array {
  const message = [
    '1',
    params.paymentId,
    params.payerWalletId,
    params.payeeId,
    params.stablecoinTicker,
    params.amount,
    params.offlineAllowanceId ?? '',
    params.nonce.toString(),
    params.timestamp.toString(),
    params.expiresAt.toString(),
  ].join('|');
  return new TextEncoder().encode(message);
}

export function isInstructionExpired(instruction: PaymentInstruction): boolean {
  return Date.now() > instruction.expiresAt;
}

export function validateInstructionFields(
  instruction: PaymentInstruction,
): string | null {
  if (!instruction.paymentId) return 'Missing payment ID';
  if (!instruction.payerWalletId) return 'Missing payer wallet ID';
  if (!instruction.payeeId) return 'Missing payee ID';
  if (!instruction.stablecoinTicker) return 'Missing stablecoin ticker';
  if (!instruction.amount || BigInt(instruction.amount) <= 0n)
    return 'Invalid amount';
  if (instruction.nonce < 0) return 'Invalid nonce';
  if (isInstructionExpired(instruction)) return 'Instruction expired';
  return null;
}
