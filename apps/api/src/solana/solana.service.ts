import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

@Injectable()
export class SolanaService implements OnModuleInit {
  private readonly logger = new Logger(SolanaService.name);
  private encryptionKey!: Buffer;
  private connection!: Connection;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const hexKey = this.config.get<string>('SOLANA_KEYPAIR_ENCRYPTION_KEY') ?? '';
    if (hexKey.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(hexKey)) {
      throw new Error(
        'SOLANA_KEYPAIR_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). ' +
          'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      );
    }
    this.encryptionKey = Buffer.from(hexKey, 'hex');

    const rpcUrl = this.config.getOrThrow<string>('SOLANA_RPC_URL');
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.logger.log(`Solana connection: ${rpcUrl}`);
  }

  /** Generate a new Solana keypair and return pubkey + encrypted secret key. */
  generateKeypair(): { publicKey: string; encryptedKeypair: string } {
    const keypair = Keypair.generate();
    return {
      publicKey: keypair.publicKey.toBase58(),
      encryptedKeypair: this.encryptKeypair(keypair.secretKey),
    };
  }

  /** AES-256-GCM encrypt. Returns "iv:authTag:ciphertext" (all hex). */
  encryptKeypair(secretKey: Uint8Array): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.encryptionKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(secretKey)),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [
      iv.toString('hex'),
      authTag.toString('hex'),
      ciphertext.toString('hex'),
    ].join(':');
  }

  /** Decrypt an encrypted keypair string back to a Solana Keypair. */
  decryptKeypair(encrypted: string): Keypair {
    const parts = encrypted.split(':');
    if (parts.length !== 3) throw new Error('Invalid encrypted keypair format');
    const [ivHex, authTagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');

    const decipher = createDecipheriv(ALGORITHM, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    const secretKey = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return Keypair.fromSecretKey(secretKey);
  }

  /**
   * Get SPL token balance for a wallet pubkey and mint address.
   * Returns balance in base units (bigint). Returns 0n if token account doesn't exist.
   */
  async getTokenBalance(walletPubkey: string, mintAddress: string): Promise<bigint> {
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
