import { Keypair, PublicKey } from '@solana/web3.js';
import { SolanaService } from '../../solana/solana.service';
import { TreasuryService } from '../../treasury/treasury.service';
import { sendSplTransfer } from '../../solana/spl-transfer';

/**
 * Returns whatever test USDC a throwaway devnet wallet is holding back to the
 * treasury, so the devnet suites can be run repeatedly without draining it.
 *
 * Failures are reported, not thrown: losing a fraction of a test token must
 * never turn a passing suite red.
 */
export async function sweepBackToTreasury(
  solana: SolanaService,
  treasury: TreasuryService,
  keypairs: Keypair[],
): Promise<
  Array<{ address: string; amount: string; signature: string | null }>
> {
  const mintAddress = process.env.SOLANA_USDC_MINT;
  const treasuryAddress = treasury.address;
  if (!mintAddress || !treasuryAddress) return [];

  const swept: Array<{
    address: string;
    amount: string;
    signature: string | null;
  }> = [];

  for (const keypair of keypairs) {
    const address = keypair.publicKey.toBase58();
    try {
      const balance = await solana.getTokenBalance(address, mintAddress);
      if (balance <= 0n) continue;

      const result = await solana.sendTransfer({
        connection: solana.getConnection(),
        owner: keypair,
        feePayer: treasury.feePayer(),
        mint: new PublicKey(mintAddress),
        destinationOwner: new PublicKey(treasuryAddress),
        amount: balance,
      });
      swept.push({
        address,
        amount: balance.toString(),
        signature: result.signature,
      });
    } catch (error) {
      console.warn(
        `[devnet-sweep] could not return tokens from ${address}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return swept;
}
