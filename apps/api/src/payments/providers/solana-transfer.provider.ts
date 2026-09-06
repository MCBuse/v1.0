import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { PublicKey, Transaction } from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  createTransferCheckedInstruction,
  getMint,
} from '@solana/spl-token';
import { SolanaService } from '../../solana/solana.service';
import type {
  TransferProvider,
  TransferParams,
  TransferResult,
} from '../transfer-provider.interface';

/**
 * USDC/EURC mint addresses on Solana devnet.
 * Switch to mainnet addresses when SOLANA_NETWORK=mainnet-beta.
 */
const DEVNET_MINTS: Record<string, string> = {
  USDC: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  EURC: 'HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr', // devnet placeholder
};

@Injectable()
export class SolanaTransferProvider implements TransferProvider {
  private readonly logger = new Logger(SolanaTransferProvider.name);

  constructor(private readonly solanaService: SolanaService) {}

  async execute(params: TransferParams): Promise<TransferResult> {
    const mintAddress = DEVNET_MINTS[params.currency];
    if (!mintAddress) {
      throw new InternalServerErrorException(
        `No mint address for currency: ${params.currency}`,
      );
    }

    const connection = this.solanaService.getConnection();
    const payerKeypair = this.solanaService.decryptKeypair(
      params.payerEncryptedKeypair,
    );
    const payerPubkey = new PublicKey(params.payerPubkey);
    const payeePubkey = new PublicKey(params.payeePubkey);
    const mint = new PublicKey(mintAddress);

    if (!payerKeypair.publicKey.equals(payerPubkey)) {
      this.logger.error(
        `[SolanaTransfer] Payer key mismatch: params.payerPubkey does not match decrypted keypair public key`,
      );
      throw new InternalServerErrorException(
        'Payer public key does not match decrypted payer keypair',
      );
    }

    this.logger.log(
      `[SolanaTransfer] Initiating ${params.amount} ${params.currency}: ` +
        `${params.payerPubkey.slice(0, 8)}… → ${params.payeePubkey.slice(0, 8)}…`,
    );

    let submittedSignature: string | null = null;
    try {
      // Get or create ATAs for both wallets (payer pays for ATA creation)
      const [payerAta, payeeAta] = await Promise.all([
        getOrCreateAssociatedTokenAccount(
          connection,
          payerKeypair,
          mint,
          payerPubkey,
        ),
        getOrCreateAssociatedTokenAccount(
          connection,
          payerKeypair,
          mint,
          payeePubkey,
        ),
      ]);

      const mintInfo = await getMint(connection, mint);

      const ix = createTransferCheckedInstruction(
        payerAta.address,
        mint,
        payeeAta.address,
        payerPubkey,
        params.amount,
        mintInfo.decimals,
      );

      const tx = new Transaction().add(ix);
      const txSignature = await connection.sendTransaction(tx, [payerKeypair], {
        preflightCommitment: 'confirmed',
      });
      submittedSignature = txSignature;
      await params.onSubmitted?.(txSignature);
      const confirmation = await connection.confirmTransaction(
        txSignature,
        'finalized',
      );
      if (confirmation.value.err)
        throw new Error('Transaction failed before finalization');

      this.logger.log(`[SolanaTransfer] Finalized: ${txSignature}`);
      return { txSignature, status: 'completed' };
    } catch (err) {
      this.logger.error(
        '[SolanaTransfer] Failed',
        err instanceof Error ? err.stack : err,
      );
      if (submittedSignature) {
        const status = await this.getStatus(submittedSignature).catch(
          () => 'pending' as const,
        );
        if (status !== 'failed')
          return { txSignature: submittedSignature, status: 'pending' };
      }
      return { txSignature: null, status: 'failed' };
    }
  }

  async getStatus(
    txSignature: string,
  ): Promise<'finalized' | 'pending' | 'failed'> {
    const response = await this.solanaService
      .getConnection()
      .getSignatureStatuses([txSignature], {
        searchTransactionHistory: true,
      });
    const status = response.value[0];
    if (!status) return 'pending';
    if (status.err) return 'failed';
    return status.confirmationStatus === 'finalized' ? 'finalized' : 'pending';
  }
}
