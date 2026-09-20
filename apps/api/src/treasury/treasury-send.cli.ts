/**
 * Moves test USDC from the devnet treasury to a wallet, and prints the
 * signature so the transfer can be checked on an explorer.
 *
 *   pnpm --filter api treasury:send <destinationAddress> <usdAmount>
 *
 * This is the operator tool behind the plan's requirement that a Stripe test
 * collection is never mistaken for token delivery: the tokens come from here,
 * and the signature is the evidence.
 */
import 'reflect-metadata';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { resolve } from 'node:path';
import * as dotenv from 'dotenv';
import { loadTreasuryKeypair, lamportsToTopUp } from './treasury-key';
import { sendSplTransfer } from '../solana/spl-transfer';
import { usdCentsToUsdcBaseUnits } from '../financial-operations/operation-money';

dotenv.config({ path: resolve(__dirname, '../../.env') });

async function fundFees(
  connection: Connection,
  treasury: Keypair,
  destination: PublicKey,
): Promise<string | null> {
  const current = await connection.getBalance(destination);
  const shortfall = lamportsToTopUp(current);
  if (shortfall === 0) return null;

  const { SystemProgram, Transaction } = await import('@solana/web3.js');
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash('confirmed');
  const transaction = new Transaction({
    feePayer: treasury.publicKey,
    recentBlockhash: blockhash,
  }).add(
    SystemProgram.transfer({
      fromPubkey: treasury.publicKey,
      toPubkey: destination,
      lamports: shortfall,
    }),
  );
  transaction.sign(treasury);
  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    preflightCommitment: 'confirmed',
  });
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    'confirmed',
  );
  return signature;
}

async function main() {
  const [destinationArg, amountArg] = process.argv.slice(2);
  if (!destinationArg || !amountArg) {
    throw new Error(
      'Usage: treasury:send <destinationAddress> <usdAmount>   e.g. treasury:send 9xQe... 2.50',
    );
  }

  const cents = BigInt(Math.round(Number(amountArg) * 100));
  if (!Number.isFinite(Number(amountArg)) || cents <= 0n) {
    throw new Error(`Invalid USD amount: ${amountArg}`);
  }
  const amountBaseUnits = usdCentsToUsdcBaseUnits(cents);

  const rpcUrl = process.env.SOLANA_RPC_URL;
  const mintAddress = process.env.SOLANA_USDC_MINT;
  if (!rpcUrl || !mintAddress) {
    throw new Error('SOLANA_RPC_URL and SOLANA_USDC_MINT must be set');
  }

  const treasury = loadTreasuryKeypair(process.env.SOLANA_TREASURY_SECRET_KEY);
  const connection = new Connection(rpcUrl, 'confirmed');
  const destination = new PublicKey(destinationArg);

  const feeSignature = await fundFees(connection, treasury, destination);

  const preparedSignatures: string[] = [];
  const result = await sendSplTransfer({
    connection,
    owner: treasury,
    mint: new PublicKey(mintAddress),
    destinationOwner: destination,
    amount: amountBaseUnits,
    onSignaturePrepared: async (signature) => {
      preparedSignatures.push(signature);
    },
  });

  const explorer = (signature: string) =>
    `https://explorer.solana.com/tx/${signature}?cluster=devnet`;

  console.log(
    JSON.stringify(
      {
        network: process.env.SOLANA_NETWORK,
        treasury: treasury.publicKey.toBase58(),
        destination: destinationArg,
        usdAmount: amountArg,
        amountBaseUnits: amountBaseUnits.toString(),
        feeFundingSignature: feeSignature,
        preparedSignature: preparedSignatures[0] ?? null,
        status: result.status,
        signature: result.signature,
        explorer: result.signature ? explorer(result.signature) : null,
      },
      null,
      2,
    ),
  );

  if (result.status !== 'completed') process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
