import { eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import {
  sendSplTransfer,
  type SplTransferParams,
  signatureStatus,
} from './spl-transfer';
import {
  Injectable,
  OnModuleInit,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { WalletKeyRegistry } from './wallet-key-registry';

@Injectable()
export class SolanaService implements OnModuleInit {
  private readonly logger = new Logger(SolanaService.name);
  private keys!: WalletKeyRegistry;
  private connection!: Connection;

  constructor(
    private readonly config: ConfigService,
    @Optional()
    @Inject(DRIZZLE)
    private readonly db?: NodePgDatabase<typeof schema>,
  ) {}

  async sendTransfer(params: SplTransferParams) {
    if (this.config.get<string>('FINANCIAL_MODE') === 'mock')
      throw new Error('Chain transfers are disabled in mock financial mode');
    if (!this.db) throw new Error('Durable chain storage is unavailable');
    const inputFingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          owner: params.owner.publicKey.toBase58(),
          destination: params.destinationOwner.toBase58(),
          mint: params.mint.toBase58(),
          amount: params.amount.toString(),
          feePayer: (params.feePayer ?? params.owner).publicKey.toBase58(),
        }),
      )
      .digest('hex');
    if (params.intentKey) {
      const [existing] = await this.db
        .select()
        .from(schema.chainAttempts)
        .where(eq(schema.chainAttempts.intentKey, params.intentKey));
      if (existing) {
        if (existing.inputFingerprint !== inputFingerprint)
          throw new Error(
            'Chain intent was reused with different transfer inputs',
          );
        await params.onSignaturePrepared?.(existing.signature);
        const status = await this.recoverTransfer(existing.signature);
        return {
          signature: existing.signature,
          status: status === 'finalized' ? ('completed' as const) : status,
        };
      }
    }
    const result = await sendSplTransfer({
      ...params,
      onSubmitted: async (signature) => {
        await this.db!.update(schema.chainAttempts)
          .set({ status: 'submitted' })
          .where(eq(schema.chainAttempts.signature, signature));
        await params.onSubmitted?.(signature);
      },
      persistPrepared: async (attempt) => {
        await this.db!.insert(schema.chainAttempts).values({
          ...attempt,
          intentKey: params.intentKey,
          inputFingerprint,
          network:
            this.config.get<string>('SOLANA_NETWORK') ??
            this.config.get<string>('SOLANA_CLUSTER') ??
            'devnet',
        });
      },
    });
    if (result.status === 'failed' && params.intentKey) {
      const [saved] = await this.db
        .select()
        .from(schema.chainAttempts)
        .where(eq(schema.chainAttempts.intentKey, params.intentKey));
      // A lease overlap may lose the unique insert while the winner broadcasts.
      // Never release the reservation merely because this sender lost that race.
      if (saved) {
        if (saved.inputFingerprint !== inputFingerprint)
          throw new Error(
            'Chain intent was reused with different transfer inputs',
          );
        return { signature: saved.signature, status: 'pending' as const };
      }
    }
    return result;
  }

  async recoverTransfer(
    signature: string,
  ): Promise<'finalized' | 'pending' | 'failed'> {
    const connection = this.getConnection();
    const attempt = this.db
      ? (
          await this.db
            .select()
            .from(schema.chainAttempts)
            .where(eq(schema.chainAttempts.signature, signature))
        )[0]
      : undefined;
    const network =
      this.config.get<string>('SOLANA_NETWORK') ??
      this.config.get<string>('SOLANA_CLUSTER') ??
      'devnet';
    if (attempt && attempt.network !== network)
      throw new Error('Chain attempt belongs to another network');
    const status = await signatureStatus(connection, signature);
    if (status !== 'pending') {
      if (this.db)
        await this.db
          .update(schema.chainAttempts)
          .set({ status })
          .where(eq(schema.chainAttempts.signature, signature));
      return status;
    }
    if (!this.db) return 'pending';
    if (!attempt) return 'pending'; // Old attempts require reconciliation, never a fresh send.
    const height = await connection.getBlockHeight('finalized');
    if (height > attempt.lastValidBlockHeight) {
      // Query after observing finalized expiry; a merely confirmed transaction stays pending.
      const lookup = await connection.getSignatureStatuses([signature], {
        searchTransactionHistory: true,
      });
      const seen = lookup.value[0];
      if (seen)
        return seen.confirmationStatus === 'finalized'
          ? seen.err
            ? 'failed'
            : 'finalized'
          : 'pending';
      const transaction = await connection.getTransaction(signature, {
        commitment: 'finalized',
        maxSupportedTransactionVersion: 0,
      });
      if (transaction)
        return !transaction.meta
          ? 'pending'
          : transaction.meta.err
            ? 'failed'
            : 'finalized';
      // A missing signature is not proof of non-delivery if this RPC has pruned
      // the relevant history. Keep the operation pending in that case.
      const firstSlot = await connection.getFirstAvailableBlock();
      const firstTime = await connection.getBlockTime(firstSlot);
      if (
        firstTime === null ||
        firstTime * 1000 > attempt.createdAt.getTime() - 300_000
      )
        return 'pending';
      await this.db
        .update(schema.chainAttempts)
        .set({ status: 'expired' })
        .where(eq(schema.chainAttempts.signature, signature));
      return 'failed';
    }
    if (this.config.get<string>('FINANCIAL_MODE') === 'mock')
      throw new Error('Chain rebroadcast is disabled in mock financial mode');
    await connection.sendRawTransaction(
      Buffer.from(attempt.signedTransaction, 'base64'),
      { preflightCommitment: 'confirmed' },
    );
    return 'pending';
  }

  onModuleInit() {
    this.keys = new WalletKeyRegistry((name) => this.config.get<string>(name));
    this.logger.log(
      `Wallet encryption key versions: ${this.keys.versions().join(', ')} (current ${this.keys.currentVersion})`,
    );

    const rpcUrl = this.config.getOrThrow<string>('SOLANA_RPC_URL');
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.logger.log(`Solana connection: ${rpcUrl}`);
  }

  /** Generate a new Solana keypair and return pubkey + encrypted secret key. */
  generateKeypair(): {
    publicKey: string;
    encryptedKeypair: string;
    encryptionKeyVersion: string;
  } {
    const keypair = Keypair.generate();
    return {
      publicKey: keypair.publicKey.toBase58(),
      encryptedKeypair: this.encryptKeypair(keypair.secretKey),
      encryptionKeyVersion: this.keys.currentVersion,
    };
  }

  /** The key version new wallet records are sealed with. */
  get currentKeyVersion(): string {
    return this.keys.currentVersion;
  }

  get keyRegistry(): WalletKeyRegistry {
    return this.keys;
  }

  /** AES-256-GCM encrypt under the current key version. */
  encryptKeypair(secretKey: Uint8Array): string {
    return this.keys.encrypt(secretKey);
  }

  /** Decrypt a stored keypair, using whichever key version sealed it. */
  decryptKeypair(encrypted: string): Keypair {
    return Keypair.fromSecretKey(this.keys.decrypt(encrypted));
  }

  /**
   * Get SPL token balance for a wallet pubkey and mint address.
   * Returns balance in base units (bigint). Returns 0n if token account doesn't exist.
   */
  async getTokenBalance(
    walletPubkey: string,
    mintAddress: string,
  ): Promise<bigint> {
    try {
      const wallet = new PublicKey(walletPubkey);
      const mint = new PublicKey(mintAddress);
      const ata = getAssociatedTokenAddressSync(mint, wallet);
      const info = await this.connection.getTokenAccountBalance(ata);
      return BigInt(info.value.amount);
    } catch {
      return 0n;
    }
  }

  /**
   * The same read, but able to say "I could not tell".
   *
   * `getTokenBalance` answers 0 for a missing token account *and* for an RPC
   * that did not respond, which is the right trade for a balance display and
   * exactly the wrong one for reconciliation: a report that treated an
   * unreachable RPC as an empty wallet would declare a discrepancy against
   * every funded wallet at once.
   */
  async readTokenBalance(
    walletPubkey: string,
    mintAddress: string,
  ): Promise<{ baseUnits: bigint | null; reason?: string }> {
    let ata: PublicKey;
    try {
      const wallet = new PublicKey(walletPubkey);
      const mint = new PublicKey(mintAddress);
      ata = getAssociatedTokenAddressSync(mint, wallet);
    } catch (error) {
      return {
        baseUnits: null,
        reason: error instanceof Error ? error.message : 'invalid address',
      };
    }

    try {
      const info = await this.connection.getTokenAccountBalance(ata);
      return { baseUnits: BigInt(info.value.amount) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A wallet that has never received the token has no account, and that
      // genuinely is a zero balance.
      if (/could not find account|account does not exist/i.test(message)) {
        return { baseUnits: 0n };
      }
      return { baseUnits: null, reason: message };
    }
  }

  getConnection(): Connection {
    return this.connection;
  }
}
