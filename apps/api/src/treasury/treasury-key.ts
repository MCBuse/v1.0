import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

/**
 * Enough SOL for associated-token-account rent plus a healthy margin of
 * transaction fees. Users never obtain this themselves — the treasury tops
 * wallets up so that network mechanics stay invisible in the product.
 */
export const MINIMUM_FEE_LAMPORTS = 5_000_000; // 0.005 SOL

/**
 * The treasury key is deliberately separate from the wallet-encryption key: it
 * signs value movements rather than protecting records, and is held as its own
 * secret so the two can be rotated and restricted independently.
 */
export function loadTreasuryKeypair(raw: string | undefined): Keypair {
  if (!raw) {
    throw new Error(
      'SOLANA_TREASURY_SECRET_KEY is required to move test USDC; ' +
        'no user wallet may be used as a substitute treasury',
    );
  }

  const trimmed = raw.trim();
  try {
    const bytes = trimmed.startsWith('[')
      ? Uint8Array.from(JSON.parse(trimmed) as number[])
      : bs58.decode(trimmed);
    return Keypair.fromSecretKey(bytes);
  } catch {
    // Deliberately does not include the supplied value.
    throw new Error(
      'SOLANA_TREASURY_SECRET_KEY is not a valid treasury key; expected a ' +
        'base58 or JSON byte-array encoded 64-byte Solana secret key',
    );
  }
}

/** The shortfall between a wallet's SOL balance and the fee minimum. */
export function lamportsToTopUp(currentLamports: number): number {
  return Math.max(0, MINIMUM_FEE_LAMPORTS - currentLamports);
}
