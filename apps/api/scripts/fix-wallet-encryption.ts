import { Pool } from 'pg';
import { createCipheriv, randomBytes } from 'crypto';
import { Keypair } from '@solana/web3.js';

const pool = new Pool({
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'mcbuse_dev',
});

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function encryptKeypair(secretKey: Uint8Array, encryptionKey: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey, iv);
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

async function fixWallets() {
  const hexKey = process.env.SOLANA_KEYPAIR_ENCRYPTION_KEY || '0000000000000000000000000000000000000000000000000000000000000000';

  if (hexKey.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(hexKey)) {
    console.error('❌ SOLANA_KEYPAIR_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
    process.exit(1);
  }

  const encryptionKey = Buffer.from(hexKey, 'hex');

  // Find all wallets with invalid encryption format
  const result = await pool.query(`
    SELECT
      w.id,
      w.user_id,
      u.username,
      w.type,
      w.encrypted_keypair,
      w.solana_pubkey
    FROM wallets w
    JOIN users u ON u.id = w.user_id
    WHERE w.encrypted_keypair NOT LIKE '%:%:%'
      AND w.is_active = true
  `);

  console.log(`Found ${result.rows.length} wallets with invalid encryption format:\n`);

  if (result.rows.length === 0) {
    console.log('✅ All wallets have valid encryption format!');
    await pool.end();
    return;
  }

  for (const wallet of result.rows) {
    console.log(`\n📦 Wallet: ${wallet.type} for @${wallet.username}`);
    console.log(`   Current: ${wallet.encrypted_keypair.substring(0, 50)}...`);
    console.log(`   Pubkey: ${wallet.solana_pubkey}`);

    // Generate a new keypair (we can't decrypt the old one)
    const newKeypair = Keypair.generate();
    const newPubkey = newKeypair.publicKey.toBase58();
    const newEncryptedKeypair = encryptKeypair(newKeypair.secretKey, encryptionKey);

    console.log(`   New pubkey: ${newPubkey}`);
    console.log(`   ⚠️  WARNING: This will replace the wallet's Solana keypair!`);
    console.log(`   ⚠️  Any funds at ${wallet.solana_pubkey} will need to be transferred to ${newPubkey}`);
  }

  console.log(`\n\n⚠️  IMPORTANT:`);
  console.log(`This script found ${result.rows.length} wallets that need to be fixed.`);
  console.log(`Each wallet will get a NEW Solana keypair, which means a NEW on-chain address.`);
  console.log(`\nTo proceed with the fix, run:`);
  console.log(`  npx tsx scripts/fix-wallet-encryption.ts --confirm\n`);

  if (process.argv.includes('--confirm')) {
    console.log(`\n🔧 Fixing wallets...\n`);

    for (const wallet of result.rows) {
      const newKeypair = Keypair.generate();
      const newPubkey = newKeypair.publicKey.toBase58();
      const newEncryptedKeypair = encryptKeypair(newKeypair.secretKey, encryptionKey);

      await pool.query(
        'UPDATE wallets SET solana_pubkey = $1, encrypted_keypair = $2, updated_at = NOW() WHERE id = $3',
        [newPubkey, newEncryptedKeypair, wallet.id]
      );

      console.log(`✅ Fixed ${wallet.type} wallet for @${wallet.username}`);
      console.log(`   Old: ${wallet.solana_pubkey}`);
      console.log(`   New: ${newPubkey}\n`);
    }

    console.log('✅ All wallets fixed!');
  }

  await pool.end();
}

fixWallets().catch(error => {
  console.error('Error:', error);
  pool.end();
  process.exit(1);
});
