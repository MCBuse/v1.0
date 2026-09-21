/**
 * Runtime optimization and financial environment are separate: hosted production
 * runtime uses sandbox financial credentials. Live money is disabled this release.
 *
 * The checks are deliberately about *pairs* of settings rather than single
 * values. Stage 1 of the merchant plan found a hosted API running
 * `TRANSFER_PROVIDER=mock` while every surface reported success; the lesson is
 * that the dangerous states are combinations nobody looks at together.
 */

export const DEVNET_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export const MAINNET_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export type SolanaCluster = 'mainnet-beta' | 'devnet' | 'testnet' | 'unknown';

export interface SeparationInput {
  NODE_ENV?: string;
  FINANCIAL_MODE?: string;
  SOLANA_NETWORK?: string;
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
  const mode =
    config.FINANCIAL_MODE ??
    (config.TRANSFER_PROVIDER === 'solana' ? 'sandbox' : 'mock');
  const actual = clusterOfRpcUrl(config.SOLANA_RPC_URL);
  const network = config.SOLANA_NETWORK ?? config.SOLANA_CLUSTER;
  const key = config.STRIPE_SECRET_KEY ?? '';
  if (!['mock', 'sandbox', 'live'].includes(mode))
    problems.push('Invalid FINANCIAL_MODE');
  if (mode === 'live')
    problems.push('Live financial operations are not enabled in this release');
  if (
    config.SOLANA_NETWORK &&
    config.SOLANA_CLUSTER &&
    config.SOLANA_NETWORK !== config.SOLANA_CLUSTER
  )
    problems.push('SOLANA_NETWORK and legacy SOLANA_CLUSTER disagree');
  if (network && actual !== 'unknown' && network !== actual)
    problems.push('SOLANA_NETWORK disagrees with SOLANA_RPC_URL');
  if (
    key.startsWith('sk_live_') ||
    actual === 'mainnet-beta' ||
    network === 'mainnet-beta' ||
    config.SOLANA_USDC_MINT === MAINNET_USDC_MINT
  )
    problems.push('Live credentials and mainnet are forbidden in this release');
  if (mode === 'sandbox') {
    if (config.TRANSFER_PROVIDER !== 'solana')
      problems.push('Sandbox requires TRANSFER_PROVIDER=solana');
    if ((actual !== 'devnet' && network !== 'devnet') || actual === 'testnet')
      problems.push('Sandbox requires a devnet RPC/network');
    if (config.SOLANA_USDC_MINT !== DEVNET_USDC_MINT)
      problems.push('Sandbox requires the devnet USDC mint');
    if (!key.startsWith('sk_test_'))
      problems.push('Sandbox requires a Stripe test key');
  }
  if (mode === 'mock' && config.TRANSFER_PROVIDER === 'solana')
    problems.push('Mock mode must not submit chain transfers');
  if (config.NODE_ENV === 'production' && !config.FINANCIAL_MODE)
    problems.push('Hosted runtime requires explicit FINANCIAL_MODE');
  return problems;
}

export function assertEnvironmentSeparation(config: SeparationInput): void {
  const problems = environmentSeparationProblems(config);
  if (problems.length > 0) throw new EnvironmentSeparationError(problems);
}
