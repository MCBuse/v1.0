import { http } from '@/lib/api';
import { moneyIntent } from '@/lib/api/money-intent';
import type { AccountOperation } from '@repo/shared';
import { transferResponse, type TransferInput, type TransferResponse } from './models';

export const transferRepository = {
  async transfer(input: TransferInput): Promise<TransferResponse> {
    const units = BigInt(input.amount);
    if (input.currency !== 'USDC' || units <= 0n || units % 10000n !== 0n) {
      throw new Error('Enter a positive USD amount with at most two decimal places.');
    }
    const body = {
      from: input.fromWalletType === 'savings' ? 'holding' : 'routine',
      to: input.toWalletType === 'savings' ? 'holding' : 'routine',
      amountCents: (units / 10000n).toString(),
    };
    const intent = await moneyIntent('transfer', body);
    const raw = await http.post<{ operationId: string; status: string }>('/accounts/transfers', body, {
      headers: { 'Idempotency-Key': intent.key },
    });
    return transferResponse.parse({ ...raw, from: body.from, to: body.to,
      currency: input.currency, amount: input.amount, idempotencyKey: intent.key });
  },
  operation(id: string) { return http.get<AccountOperation>(`/accounts/operations/${id}`); },
};
