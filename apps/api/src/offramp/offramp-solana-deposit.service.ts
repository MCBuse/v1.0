import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import {
  createTransferCheckedInstruction,
  getAccount,
  getMint,
  getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token';
import { SolanaService } from '../solana/solana.service';

const DEVNET_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

@Injectable()
export class OfframpSolanaDepositService {
  private readonly logger = new Logger(OfframpSolanaDepositService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly solana: SolanaService,
  ) {}

  async sendUsdcDeposit(params: {
    payerPubkey: string;
    payerEncryptedKeypair: string;
    destinationAddress: string;
    amount: bigint;
  }): Promise<string> {
    const connection = this.solana.getConnection();
    const payerKeypair = this.solana.decryptKeypair(params.payerEncryptedKeypair);
    const payerPubkey = new PublicKey(params.payerPubkey);
    if (!payerKeypair.publicKey.equals(payerPubkey)) {
      throw new InternalServerErrorException('Payer public key does not match decrypted keypair');
    }

    const mint = new PublicKey(this.config.get<string>('SOLANA_USDC_MINT') ?? DEVNET_USDC_MINT);
    const destination = new PublicKey(params.destinationAddress);
    const [payerAta, destinationAta, mintInfo] = await Promise.all([
      getOrCreateAssociatedTokenAccount(connection, payerKeypair, mint, payerPubkey),
      this.resolveDestinationTokenAccount(destination, mint, payerKeypair),
      getMint(connection, mint),
    ]);

    const ix = createTransferCheckedInstruction(
      payerAta.address,
      mint,
      destinationAta,
      payerPubkey,
      params.amount,
      mintInfo.decimals,
    );
    const tx = new Transaction().add(ix);
    const signature = await sendAndConfirmTransaction(connection, tx, [payerKeypair], {
      commitment: 'confirmed',
    });
    this.logger.log(
      `MoonPay off-ramp USDC deposit confirmed: ${signature} -> ${params.destinationAddress}`,
    );
    return signature;
  }

  private async resolveDestinationTokenAccount(
    destination: PublicKey,
    mint: PublicKey,
    payerKeypair: ReturnType<SolanaService['decryptKeypair']>,
  ): Promise<PublicKey> {
    const connection = this.solana.getConnection();
    try {
      const account = await getAccount(connection, destination);
      if (!account.mint.equals(mint)) {
        throw new InternalServerErrorException('MoonPay deposit token account mint mismatch');
      }
      return destination;
    } catch (err) {
      if (err instanceof InternalServerErrorException) throw err;
      const ata = await getOrCreateAssociatedTokenAccount(
        connection,
        payerKeypair,
        mint,
        destination,
      );
      return ata.address;
    }
  }
}
