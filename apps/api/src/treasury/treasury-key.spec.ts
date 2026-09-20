import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import {
  MINIMUM_FEE_LAMPORTS,
  loadTreasuryKeypair,
  lamportsToTopUp,
} from './treasury-key';

const TREASURY = Keypair.generate();
const BASE58_SECRET = bs58.encode(TREASURY.secretKey);
const JSON_SECRET = JSON.stringify(Array.from(TREASURY.secretKey));

describe('treasury key loading', () => {
  it('loads a base58 secret key', () => {
    const keypair = loadTreasuryKeypair(BASE58_SECRET);
    expect(keypair.publicKey.toBase58()).toBe(TREASURY.publicKey.toBase58());
  });

  it('loads a JSON byte-array secret key', () => {
    const keypair = loadTreasuryKeypair(JSON_SECRET);
    expect(keypair.publicKey.toBase58()).toBe(TREASURY.publicKey.toBase58());
  });

  it('refuses an absent key rather than falling back to a user wallet', () => {
    expect(() => loadTreasuryKeypair(undefined)).toThrow(
      /SOLANA_TREASURY_SECRET_KEY/,
    );
    expect(() => loadTreasuryKeypair('')).toThrow(/SOLANA_TREASURY_SECRET_KEY/);
  });

  it('refuses malformed key material', () => {
    expect(() => loadTreasuryKeypair('not-a-key')).toThrow(/treasury key/i);
    expect(() => loadTreasuryKeypair('[1,2,3]')).toThrow(/treasury key/i);
  });

  it('does not echo the key in its error message', () => {
    try {
      loadTreasuryKeypair('zzzz-invalid-zzzz');
      fail('expected a throw');
    } catch (error) {
      expect((error as Error).message).not.toContain('zzzz-invalid-zzzz');
    }
  });
});

describe('lamportsToTopUp', () => {
  it('tops a wallet up to the minimum when it holds nothing', () => {
    expect(lamportsToTopUp(0)).toBe(MINIMUM_FEE_LAMPORTS);
  });

  it('tops up only the shortfall', () => {
    expect(lamportsToTopUp(MINIMUM_FEE_LAMPORTS - 1000)).toBe(1000);
  });

  it('does nothing when the wallet is already funded', () => {
    expect(lamportsToTopUp(MINIMUM_FEE_LAMPORTS)).toBe(0);
    expect(lamportsToTopUp(MINIMUM_FEE_LAMPORTS * 10)).toBe(0);
  });

  it('never returns a negative top-up', () => {
    expect(lamportsToTopUp(Number.MAX_SAFE_INTEGER)).toBe(0);
  });
});
