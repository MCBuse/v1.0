import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { WalletKeyRegistry } from './wallet-key-registry';

@Injectable()
export class SolanaService implements OnModuleInit {
  private readonly logger = new Logger(SolanaService.name);
  private keys!: WalletKeyRegistry;
  private connection!: Connection;

  constructor(private readonly config: ConfigService) {}

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

  getConnection(): Connection {
    return this.connection;
  }
}
