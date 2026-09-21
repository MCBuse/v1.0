/**
 * K.11 — devnet credentials must never be reachable from a production
 * environment, and production credentials must never be reachable from a
 * developer's machine.
 *
 * The checks are deliberately about *pairs* of settings rather than single
 * values. Stage 1 of the merchant plan found a hosted API running
 * `TRANSFER_PROVIDER=mock` while every surface reported success; the lesson is
 * that the dangerous states are combinations nobody looks at together.
 */

export const DEVNET_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export const MAINNET_USDC_MINT =
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export type SolanaCluster = 'mainnet-beta' | 'devnet' | 'testnet' | 'unknown';

export interface SeparationInput {
  NODE_ENV?: string;
  SOLANA_RPC_URL?: string;
  SOLANA_CLUSTER?: string;
  SOLANA_USDC_MINT?: string;
  SOLANA_TREASURY_SECRET_KEY?: string;
  TRANSFER_PROVIDER?: string;
  STRIPE_SECRET_KEY?: string;
}

/** What the RPC endpoint actually points at, whatever the config claims. */
export function clusterOfRpcUrl(url: string | undefined): SolanaCluster {
  if (!url) return 'unknown';
  const host = url.toLowerCase();
  if (host.includes('devnet')) return 'devnet';
  if (host.includes('testnet')) return 'testnet';
  if (host.includes('mainnet')) return 'mainnet-beta';
  return 'unknown';
}

export class EnvironmentSeparationError extends Error {
  constructor(public readonly problems: string[]) {
    super(
      `Environment separation check failed:\n${problems
        .map((problem) => `  - ${problem}`)
        .join('\n')}`,
    );
    this.name = 'EnvironmentSeparationError';
  }
}

export function environmentSeparationProblems(
  config: SeparationInput,
): string[] {
  const problems: string[] = [];
  const isProduction = config.NODE_ENV === 'production';
  const actualCluster = clusterOfRpcUrl(config.SOLANA_RPC_URL);
  const stripeKey = config.STRIPE_SECRET_KEY ?? '';
  const isStripeLive = stripeKey.startsWith('sk_live_');
  const isStripeTest = stripeKey.startsWith('sk_test_');

  // A declared cluster that disagrees with the endpoint is the state in which
  // someone reads the config and believes the wrong thing.
  if (
    config.SOLANA_CLUSTER &&
    actualCluster !== 'unknown' &&
    config.SOLANA_CLUSTER !== actualCluster
  ) {
    problems.push(
      `SOLANA_CLUSTER says "${config.SOLANA_CLUSTER}" but SOLANA_RPC_URL points at ${actualCluster}`,
    );
  }

  if (isProduction) {
    if (actualCluster === 'devnet' || actualCluster === 'testnet') {
      problems.push(
        `production must not use a ${actualCluster} RPC endpoint (SOLANA_RPC_URL)`,
      );
    }
    if (config.SOLANA_USDC_MINT === DEVNET_USDC_MINT) {
      problems.push(
        'production must not use the devnet USDC mint (SOLANA_USDC_MINT)',
      );
    }
    if (isStripeTest) {
      problems.push(
        'production must not use a Stripe test key (STRIPE_SECRET_KEY)',
      );
    }
    if ((config.TRANSFER_PROVIDER ?? 'mock') === 'mock') {
      problems.push(
        'production must not run TRANSFER_PROVIDER=mock: no tokens would move while every surface reported success',
      );
    }
    return problems;
  }

  // Outside production, the risk runs the other way: a developer's machine
  // holding credentials that can move real money.
  if (isStripeLive) {
    problems.push(
      `a live Stripe key (STRIPE_SECRET_KEY) must not be used outside production (NODE_ENV=${config.NODE_ENV ?? 'unset'})`,
    );
  }
  if (actualCluster === 'mainnet-beta') {
    problems.push(
      `a mainnet RPC endpoint (SOLANA_RPC_URL) must not be used outside production (NODE_ENV=${config.NODE_ENV ?? 'unset'})`,
    );
  }
  if (config.SOLANA_USDC_MINT === MAINNET_USDC_MINT) {
    problems.push(
      'the mainnet USDC mint (SOLANA_USDC_MINT) must not be used outside production',
    );
  }

  return problems;
}

export function assertEnvironmentSeparation(config: SeparationInput): void {
  const problems = environmentSeparationProblems(config);
  if (problems.length > 0) throw new EnvironmentSeparationError(problems);
}
