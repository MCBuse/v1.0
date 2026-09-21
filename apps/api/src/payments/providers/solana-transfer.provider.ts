import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { PublicKey } from '@solana/web3.js';
import { SolanaService } from '../../solana/solana.service';
import { TreasuryService } from '../../treasury/treasury.service';
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

/**
 * Customer-to-merchant transfers on chain.
 *
 * The treasury pays the network fee and any rent for a missing destination
 * token account. That is not an optimisation: this platform's custody model
 * says users never hold SOL, so a transfer that asked the payer to cover its
 * own fee could not execute at all — and a merchant being paid for the first
 * time has no token account for the rent to come from either. This delegates
 * to the same `sendSplTransfer` the account flows use, so both chain paths
 * behave identically, including deriving and persisting the signature before
 * anything is broadcast.
 */
@Injectable()
export class SolanaTransferProvider implements TransferProvider {
  private readonly logger = new Logger(SolanaTransferProvider.name);

  constructor(
    private readonly solanaService: SolanaService,
    private readonly treasury: TreasuryService,
  ) {}

  async execute(params: TransferParams): Promise<TransferResult> {
    const mintAddress = params.currency === 'USDC' ? DEVNET_MINTS.USDC : undefined;
    if (!mintAddress) {
      throw new InternalServerErrorException(
        `No mint address for currency: ${params.currency}`,
      );
    }

    const payerKeypair = this.solanaService.decryptKeypair(
      params.payerEncryptedKeypair,
    );
    if (payerKeypair.publicKey.toBase58() !== params.payerPubkey) {
      this.logger.error(
        '[SolanaTransfer] Payer key mismatch: params.payerPubkey does not match decrypted keypair public key',
      );
      throw new InternalServerErrorException(
        'Payer public key does not match decrypted payer keypair',
      );
    }

    const feePayer = this.treasury.feePayer();
    if (!feePayer) {
      // Refused rather than attempted: without the treasury the payer would
      // have to cover the fee, and they hold no SOL by design.
      throw new InternalServerErrorException(
        'The treasury is not configured, so no network fee can be paid',
      );
    }

    this.logger.log(
      `[SolanaTransfer] Initiating ${params.amount} ${params.currency}: ` +
        `${params.payerPubkey.slice(0, 8)}… → ${params.payeePubkey.slice(0, 8)}…`,
    );

    const result = await this.solanaService.sendTransfer({
      intentKey: `payment:${params.payerWalletId}:${params.idempotencyKey}`,
      connection: this.solanaService.getConnection(),
      owner: payerKeypair,
      feePayer,
      mint: new PublicKey(mintAddress),
      destinationOwner: new PublicKey(params.payeePubkey),
      amount: params.amount,
      onSignaturePrepared: params.onSignaturePrepared,
      onSubmitted: params.onSubmitted,
    });

    if (result.status === 'completed')
      this.logger.log(`[SolanaTransfer] Finalized: ${result.signature}`);

    return { txSignature: result.signature, status: result.status };
  }

  async getStatus(
    txSignature: string,
  ): Promise<'finalized' | 'pending' | 'failed'> {
    return this.solanaService.recoverTransfer(txSignature);
  }
}
