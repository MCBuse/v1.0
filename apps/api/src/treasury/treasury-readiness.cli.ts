/**
 * Reports whether the devnet treasury can actually back the demonstration.
 *
 *   pnpm --filter api treasury:status
 *
 * This exists because an unfunded treasury must be a visible, named state. A
 * funding or withdrawal flow that cannot move tokens has to say so rather than
 * report a success the chain never saw.
 */
import 'reflect-metadata';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { resolve } from 'node:path';
import * as dotenv from 'dotenv';
import { loadTreasuryKeypair, MINIMUM_FEE_LAMPORTS } from './treasury-key';

dotenv.config({ path: resolve(__dirname, '../../.env') });

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  const mintAddress = process.env.SOLANA_USDC_MINT;
  if (!rpcUrl) throw new Error('SOLANA_RPC_URL is not set');
  if (!mintAddress) throw new Error('SOLANA_USDC_MINT is not set');

  const keypair = loadTreasuryKeypair(process.env.SOLANA_TREASURY_SECRET_KEY);
  const connection = new Connection(rpcUrl, 'confirmed');
  const mint = new PublicKey(mintAddress);

  const lamports = await connection.getBalance(keypair.publicKey);

  let usdcBaseUnits = 0n;
  let tokenAccount: string | null = null;
  try {
    const ata = getAssociatedTokenAddressSync(mint, keypair.publicKey);
    tokenAccount = ata.toBase58();
    const balance = await connection.getTokenAccountBalance(ata);
    usdcBaseUnits = BigInt(balance.value.amount);
  } catch {
    usdcBaseUnits = 0n;
  }

  const problems: string[] = [];
  if (lamports < MINIMUM_FEE_LAMPORTS) {
    problems.push(
      `SOL balance ${lamports} lamports is below the ${MINIMUM_FEE_LAMPORTS} needed for fees and account rent`,
    );
  }
  if (usdcBaseUnits === 0n) {
    problems.push(
      'Treasury holds no test USDC; funding, transfers and withdrawals cannot settle on devnet',
    );
  }

  const report = {
    network: process.env.SOLANA_NETWORK ?? 'unknown',
    rpcUrl,
    treasuryAddress: keypair.publicKey.toBase58(),
    mint: mintAddress,
    tokenAccount,
    solLamports: lamports,
    solDisplay: `${(lamports / 1_000_000_000).toFixed(9)} SOL`,
    usdcBaseUnits: usdcBaseUnits.toString(),
    usdcDisplay: `${(Number(usdcBaseUnits) / 1_000_000).toFixed(6)} USDC`,
    ready: problems.length === 0,
    problems,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
