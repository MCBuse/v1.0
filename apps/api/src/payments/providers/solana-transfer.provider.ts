import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import {
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  createTransferCheckedInstruction,
  getMint,
} from '@solana/spl-token';
import { SolanaService } from '../../solana/solana.service';
import type { TransferProvider, TransferParams, TransferResult } from '../transfer-provider.interface';

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
      throw new InternalServerErrorException(`No mint address for currency: ${params.currency}`);
    }

    const connection = this.solanaService.getConnection();
    const payerKeypair = this.solanaService.decryptKeypair(params.payerEncryptedKeypair);
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

    try {
      // Get or create ATAs for both wallets (payer pays for ATA creation)
      const [payerAta, payeeAta] = await Promise.all([
        getOrCreateAssociatedTokenAccount(connection, payerKeypair, mint, payerPubkey),
        getOrCreateAssociatedTokenAccount(connection, payerKeypair, mint, payeePubkey),
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
      const txSignature = await sendAndConfirmTransaction(connection, tx, [payerKeypair], {
        commitment: 'confirmed',
      });

      this.logger.log(`[SolanaTransfer] Confirmed: ${txSignature}`);
      return { txSignature, status: 'completed' };
    } catch (err) {
      this.logger.error('[SolanaTransfer] Failed', err instanceof Error ? err.stack : err);
      return { txSignature: null, status: 'failed' };
    }
  }
}
