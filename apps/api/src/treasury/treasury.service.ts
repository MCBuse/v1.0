import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { SolanaService } from '../solana/solana.service';
import {
  sendSplTransfer,
  signatureStatus,
  type SplTransferResult,
} from '../solana/spl-transfer';
import {
  MINIMUM_FEE_LAMPORTS,
  lamportsToTopUp,
  loadTreasuryKeypair,
} from './treasury-key';

/**
 * The sandbox treasury.
 *
 * Stripe collecting a test payment does not create USDC. Every funding flow
 * therefore has an explicit treasury transfer behind it, and every withdrawal
 * returns tokens here before the provider payout is attempted. That transfer
 * is the thing the demonstration evidence has to show.
 */
@Injectable()
export class TreasuryService implements OnModuleInit {
  private readonly logger = new Logger(TreasuryService.name);
  private keypair: Keypair | null = null;
  private loadError: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly solana: SolanaService,
  ) {}

  onModuleInit() {
    try {
      this.keypair = loadTreasuryKeypair(
        this.config.get<string>('SOLANA_TREASURY_SECRET_KEY'),
      );
      this.logger.log(`Treasury address: ${this.keypair.publicKey.toBase58()}`);
    } catch (error) {
      // Not fatal at boot: flows that need the treasury refuse individually,
      // with a message that names the missing configuration.
      this.loadError = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Treasury unavailable: ${this.loadError}`);
    }
  }

  get isConfigured(): boolean {
    return this.keypair !== null;
  }

  get address(): string | null {
    return this.keypair?.publicKey.toBase58() ?? null;
  }

  /** Throws with the configuration problem rather than silently doing nothing. */
  requireKeypair(): Keypair {
    if (!this.keypair) {
      throw new Error(this.loadError ?? 'Treasury key is not configured');
    }
    return this.keypair;
  }

  /** The fee payer for user transfers, so users never need to hold SOL. */
  feePayer(): Keypair | undefined {
    return this.keypair ?? undefined;
  }

  private get mint(): PublicKey {
    return new PublicKey(this.config.getOrThrow<string>('SOLANA_USDC_MINT'));
  }

  async solBalanceLamports(): Promise<number> {
    const keypair = this.requireKeypair();
    return this.solana.getConnection().getBalance(keypair.publicKey);
  }

  async usdcBalanceBaseUnits(): Promise<bigint> {
    const keypair = this.requireKeypair();
    return this.solana.getTokenBalance(
      keypair.publicKey.toBase58(),
      this.mint.toBase58(),
    );
  }

  /**
   * Tops a wallet up to the fee minimum. Returns null when no top-up was
   * needed, so callers can tell "already funded" from "just funded".
   */
  async ensureFeeFunding(walletPubkey: string): Promise<string | null> {
    const keypair = this.requireKeypair();
    const connection = this.solana.getConnection();
    const destination = new PublicKey(walletPubkey);

    const current = await connection.getBalance(destination);
    const shortfall = lamportsToTopUp(current);
    if (shortfall === 0) return null;

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash('confirmed');
    const transaction = new Transaction({
      feePayer: keypair.publicKey,
      recentBlockhash: blockhash,
    }).add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: destination,
        lamports: shortfall,
      }),
    );
    transaction.sign(keypair);

    const signature = await connection.sendRawTransaction(
      transaction.serialize(),
      { preflightCommitment: 'confirmed' },
    );
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed',
    );
    this.logger.log(
      `Funded ${shortfall} lamports of network fees to ${walletPubkey.slice(0, 8)}…`,
    );
    return signature;
  }

  /** Treasury → user wallet. Backs a settled Stripe collection with tokens. */
  async sendUsdcTo(
    destinationPubkey: string,
    amountBaseUnits: bigint,
    hooks: {
      onSignaturePrepared?: (signature: string) => Promise<void>;
      onSubmitted?: (signature: string) => Promise<void>;
    } = {},
  ): Promise<SplTransferResult> {
    const keypair = this.requireKeypair();
    return sendSplTransfer({
      connection: this.solana.getConnection(),
      owner: keypair,
      mint: this.mint,
      destinationOwner: new PublicKey(destinationPubkey),
      amount: amountBaseUnits,
      onSignaturePrepared: hooks.onSignaturePrepared,
      onSubmitted: hooks.onSubmitted,
    });
  }

  async statusOf(signature: string) {
    return signatureStatus(this.solana.getConnection(), signature);
  }

  /**
   * Whether the treasury can back a given amount right now. Returning a real
   * shortfall is the point: an unfunded treasury must surface as an explicit
   * state, never as a simulated success.
   */
  async readiness(requiredBaseUnits = 0n): Promise<{
    configured: boolean;
    address: string | null;
    solLamports: number | null;
    usdcBaseUnits: string | null;
    canPayFees: boolean;
    canCover: boolean;
    problems: string[];
  }> {
    if (!this.keypair) {
      return {
        configured: false,
        address: null,
        solLamports: null,
        usdcBaseUnits: null,
        canPayFees: false,
        canCover: false,
        problems: [this.loadError ?? 'Treasury key is not configured'],
      };
    }

    const [solLamports, usdcBaseUnits] = await Promise.all([
      this.solBalanceLamports(),
      this.usdcBalanceBaseUnits(),
    ]);
    const problems: string[] = [];
    const canPayFees = solLamports >= MINIMUM_FEE_LAMPORTS;
    if (!canPayFees) {
      problems.push(
        `Treasury holds ${solLamports} lamports; at least ${MINIMUM_FEE_LAMPORTS} are needed for network fees`,
      );
    }
    const canCover = usdcBaseUnits >= requiredBaseUnits;
    if (!canCover) {
      problems.push(
        `Treasury holds ${usdcBaseUnits} USDC base units; ${requiredBaseUnits} are required`,
      );
    }

    return {
      configured: true,
      address: this.keypair.publicKey.toBase58(),
      solLamports,
      usdcBaseUnits: usdcBaseUnits.toString(),
      canPayFees,
      canCover,
      problems,
    };
  }
}
