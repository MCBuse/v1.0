import { execFileSync } from 'node:child_process';
import { createDecipheriv } from 'node:crypto';
import process from 'node:process';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import pg from 'pg';

const DEVNET_RPC_URL = 'https://api.devnet.solana.com';
const DEVNET_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

function readSecret(projectId, name) {
  return execFileSync(
    'gcloud',
    [
      'secrets',
      'versions',
      'access',
      'latest',
      `--secret=${name}`,
      `--project=${projectId}`,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}

function databaseConfig(connectionString) {
  const value = new URL(connectionString);
  return {
    host: value.hostname,
    port: Number(value.port || 5432),
    user: decodeURIComponent(value.username),
    password: decodeURIComponent(value.password),
    database: decodeURIComponent(value.pathname.slice(1)),
    ssl: { rejectUnauthorized: false },
  };
}

function decryptKeypair(encrypted, hexKey) {
  const parts = encrypted.split(':');
  if (parts.length !== 3) throw new Error('Stored keypair format is invalid');
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(hexKey, 'hex'),
    Buffer.from(ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const secretKey = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]);
  return Keypair.fromSecretKey(secretKey);
}

async function tokenBalance(connection, owner) {
  const mint = new PublicKey(DEVNET_USDC_MINT);
  const ata = getAssociatedTokenAddressSync(mint, owner);
  try {
    const balance = await connection.getTokenAccountBalance(ata, 'confirmed');
    return BigInt(balance.value.amount);
  } catch {
    return 0n;
  }
}

async function inspectPayer(row, encryptionKey, connection) {
  let keyDecrypts = false;
  let keyMatchesAddress = false;
  let solLamports = 0n;
  let usdcMinor = 0n;

  if (row?.encrypted_keypair && row?.solana_pubkey) {
    try {
      const keypair = decryptKeypair(row.encrypted_keypair, encryptionKey);
      keyDecrypts = true;
      keyMatchesAddress = keypair.publicKey.toBase58() === row.solana_pubkey;
      if (keyMatchesAddress) {
        [solLamports, usdcMinor] = await Promise.all([
          connection
            .getBalance(keypair.publicKey, 'confirmed')
            .then((value) => BigInt(value)),
          tokenBalance(connection, keypair.publicKey),
        ]);
      }
    } catch {
      keyDecrypts = false;
    }
  }

  return { keyDecrypts, keyMatchesAddress, solLamports, usdcMinor };
}

async function main() {
  const projectId = process.env.MCBUSE_GCP_PROJECT_ID?.trim();
  const payerEmail = argument('payer-email')?.toLowerCase();
  const merchantEmail = argument('merchant-email')?.toLowerCase();
  const requiredUsdcMinor = BigInt(
    argument('required-usdc-minor') ?? '5000000',
  );
  const requiredSolLamports = BigInt(
    argument('required-sol-lamports') ??
      String(Math.ceil(0.01 * LAMPORTS_PER_SOL)),
  );

  if (!projectId || !payerEmail || !merchantEmail) {
    throw new Error(
      'Usage: MCBUSE_GCP_PROJECT_ID=... pnpm --filter api merchant:devnet-readiness -- --payer-email payer@example.com --merchant-email merchant@example.com',
    );
  }
  if (requiredUsdcMinor <= 0n || requiredSolLamports <= 0n) {
    throw new Error('Funding thresholds must be positive integers');
  }

  const databaseUrl = readSecret(projectId, 'DATABASE_URL');
  const encryptionKey = readSecret(projectId, 'SOLANA_KEYPAIR_ENCRYPTION_KEY');
  if (!/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
    throw new Error(
      'The deployed Solana encryption key is not a 32-byte hex key',
    );
  }

  const database = new pg.Client(databaseConfig(databaseUrl));
  const connection = new Connection(DEVNET_RPC_URL, 'confirmed');
  await database.connect();
  try {
    const payerResult = await database.query(
      `select u.id as user_id,
              u.is_active,
              u.deleted_at,
              w.id as wallet_id,
              w.solana_pubkey,
              w.encrypted_keypair,
              w.is_active as wallet_active,
              coalesce(pb.available, 0)::text as internal_usdc_minor
         from users u
         left join wallets w
           on w.user_id = u.id
          and w.type = 'routine'
         left join balances pb
           on pb.wallet_id = w.id
          and pb.currency = 'USDC'
        where lower(u.email) = $1
        limit 1`,
      [payerEmail],
    );
    const merchantResult = await database.query(
      `select u.id as user_id,
              m.id as merchant_id,
              m.receiving_wallet_id,
              rw.is_active as wallet_active,
              rb.id as receiving_balance_id
         from users u
         join merchant_memberships mm on mm.user_id = u.id
         join merchants m on m.id = mm.merchant_id
         join wallets rw on rw.id = m.receiving_wallet_id
         left join balances rb
           on rb.wallet_id = rw.id
          and rb.currency = 'USDC'
        where lower(u.email) = $1
          and mm.role = 'owner'
        limit 1`,
      [merchantEmail],
    );

    const payer = payerResult.rows[0];
    const merchant = merchantResult.rows[0];
    const inspected = await inspectPayer(payer, encryptionKey, connection);
    const { keyDecrypts, keyMatchesAddress, solLamports, usdcMinor } =
      inspected;

    const activePayer = Boolean(
      payer?.is_active &&
      !payer?.deleted_at &&
      payer?.wallet_active &&
      payer?.wallet_id,
    );
    const activeMerchant = Boolean(
      merchant?.merchant_id &&
      merchant?.receiving_wallet_id &&
      merchant?.wallet_active,
    );
    const separateAccounts = Boolean(
      payer?.user_id && merchant?.user_id && payer.user_id !== merchant.user_id,
    );
    const sufficientSol = solLamports >= requiredSolLamports;
    const sufficientUsdc = usdcMinor >= requiredUsdcMinor;
    const internalUsdcMinor = BigInt(payer?.internal_usdc_minor ?? '0');
    const sufficientInternalUsdc = internalUsdcMinor >= requiredUsdcMinor;
    const receivingBalancePresent = Boolean(merchant?.receiving_balance_id);
    const ready =
      activePayer &&
      activeMerchant &&
      receivingBalancePresent &&
      separateAccounts &&
      keyDecrypts &&
      keyMatchesAddress &&
      sufficientSol &&
      sufficientUsdc &&
      sufficientInternalUsdc;

    process.stdout.write(
      `${JSON.stringify(
        {
          projectId,
          network: 'devnet',
          payer: {
            activeRoutineWallet: activePayer,
            keyDecrypts,
            keyMatchesStoredAddress: keyMatchesAddress,
            separateFromMerchant: separateAccounts,
          },
          merchant: {
            activeReceivingWallet: activeMerchant,
            receivingBalancePresent,
          },
          funding: {
            solLamports: solLamports.toString(),
            requiredSolLamports: requiredSolLamports.toString(),
            sufficientSol,
            usdcMinor: usdcMinor.toString(),
            requiredUsdcMinor: requiredUsdcMinor.toString(),
            sufficientUsdc,
            internalUsdcMinor: internalUsdcMinor.toString(),
            sufficientInternalUsdc,
          },
          ready,
        },
        null,
        2,
      )}\n`,
    );
    if (!ready) process.exitCode = 2;
  } finally {
    await database.end();
  }
}

void main().catch((error) => {
  const message =
    error instanceof Error ? error.message : 'Readiness check failed';
  process.stderr.write(
    `${message.replaceAll(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database-url-redacted]')}\n`,
  );
  process.exitCode = 1;
});
