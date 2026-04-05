import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { TransferProvider, TransferParams, TransferResult } from '../transfer-provider.interface';

/**
 * Mock P2P transfer provider — DB-only, no Solana interaction.
 * Returns a fake txSignature prefixed with "mock_" so it's identifiable in logs.
 * Use TRANSFER_PROVIDER=mock for local dev and hackathon demos without devnet.
 */
@Injectable()
export class MockTransferProvider implements TransferProvider {
  private readonly logger = new Logger(MockTransferProvider.name);

  async execute(params: TransferParams): Promise<TransferResult> {
    const txSignature = `mock_${randomUUID().replace(/-/g, '')}`;
    this.logger.log(
      `[MockTransfer] ${params.amount} ${params.currency}: ` +
      `${params.payerPubkey.slice(0, 8)}… → ${params.payeePubkey.slice(0, 8)}… (${txSignature})`,
    );
    return { txSignature, status: 'completed' };
  }
}
