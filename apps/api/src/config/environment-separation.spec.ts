import {
  DEVNET_USDC_MINT,
  EnvironmentSeparationError,
  MAINNET_USDC_MINT,
  assertEnvironmentSeparation,
  clusterOfRpcUrl,
  environmentSeparationProblems,
} from './environment-separation';

const DEVNET_RPC = 'https://api.devnet.solana.com';
const MAINNET_RPC = 'https://api.mainnet-beta.solana.com';

const devnetConfig = {
  NODE_ENV: 'development',
  SOLANA_RPC_URL: DEVNET_RPC,
  SOLANA_CLUSTER: 'devnet',
  SOLANA_USDC_MINT: DEVNET_USDC_MINT,
  TRANSFER_PROVIDER: 'solana',
  STRIPE_SECRET_KEY: 'sk_test_abc',
};

const productionConfig = {
  NODE_ENV: 'production',
  SOLANA_RPC_URL: MAINNET_RPC,
  SOLANA_CLUSTER: 'mainnet-beta',
  SOLANA_USDC_MINT: MAINNET_USDC_MINT,
  TRANSFER_PROVIDER: 'solana',
  STRIPE_SECRET_KEY: 'sk_live_abc',
};

describe('environment separation', () => {
  describe('cluster detection', () => {
    it.each([
      [DEVNET_RPC, 'devnet'],
      [MAINNET_RPC, 'mainnet-beta'],
      ['https://api.testnet.solana.com', 'testnet'],
      ['https://my-private-rpc.example.com', 'unknown'],
      [undefined, 'unknown'],
    ])('reads %s as %s', (url, expected) => {
      expect(clusterOfRpcUrl(url as string | undefined)).toBe(expected);
    });
  });

  it('accepts a consistent development environment', () => {
    expect(environmentSeparationProblems(devnetConfig)).toEqual([]);
  });

  it('accepts a consistent production environment', () => {
    expect(environmentSeparationProblems(productionConfig)).toEqual([]);
  });

  describe('protecting production from devnet credentials', () => {
    it('refuses a devnet RPC in production', () => {
      const problems = environmentSeparationProblems({
        ...productionConfig,
        SOLANA_CLUSTER: undefined,
        SOLANA_RPC_URL: DEVNET_RPC,
      });
      expect(problems).toContainEqual(
        expect.stringContaining('must not use a devnet RPC endpoint'),
      );
    });

    it('refuses the devnet USDC mint in production', () => {
      expect(
        environmentSeparationProblems({
          ...productionConfig,
          SOLANA_USDC_MINT: DEVNET_USDC_MINT,
        }),
      ).toContainEqual(expect.stringContaining('devnet USDC mint'));
    });

    it('refuses a Stripe test key in production', () => {
      expect(
        environmentSeparationProblems({
          ...productionConfig,
          STRIPE_SECRET_KEY: 'sk_test_abc',
        }),
      ).toContainEqual(expect.stringContaining('Stripe test key'));
    });

    it('refuses the mock transfer provider in production', () => {
      expect(
        environmentSeparationProblems({
          ...productionConfig,
          TRANSFER_PROVIDER: 'mock',
        }),
      ).toContainEqual(expect.stringContaining('TRANSFER_PROVIDER=mock'));
    });

    it('treats an unset transfer provider as mock, because that is the default', () => {
      expect(
        environmentSeparationProblems({
          ...productionConfig,
          TRANSFER_PROVIDER: undefined,
        }),
      ).toContainEqual(expect.stringContaining('TRANSFER_PROVIDER=mock'));
    });
  });

  describe('protecting production credentials from everywhere else', () => {
    it('refuses a live Stripe key outside production', () => {
      expect(
        environmentSeparationProblems({
          ...devnetConfig,
          STRIPE_SECRET_KEY: 'sk_live_abc',
        }),
      ).toContainEqual(expect.stringContaining('live Stripe key'));
    });

    it('refuses a mainnet RPC outside production', () => {
      expect(
        environmentSeparationProblems({
          ...devnetConfig,
          SOLANA_CLUSTER: undefined,
          SOLANA_RPC_URL: MAINNET_RPC,
        }),
      ).toContainEqual(expect.stringContaining('mainnet RPC endpoint'));
    });

    it('refuses the mainnet USDC mint outside production', () => {
      expect(
        environmentSeparationProblems({
          ...devnetConfig,
          SOLANA_USDC_MINT: MAINNET_USDC_MINT,
        }),
      ).toContainEqual(expect.stringContaining('mainnet USDC mint'));
    });

    it('applies to the test environment too', () => {
      expect(
        environmentSeparationProblems({
          ...devnetConfig,
          NODE_ENV: 'test',
          STRIPE_SECRET_KEY: 'sk_live_abc',
        }),
      ).toContainEqual(expect.stringContaining('live Stripe key'));
    });
  });

  it('catches a declared cluster that disagrees with the endpoint', () => {
    expect(
      environmentSeparationProblems({
        ...devnetConfig,
        SOLANA_CLUSTER: 'mainnet-beta',
        SOLANA_RPC_URL: DEVNET_RPC,
      }),
    ).toContainEqual(
      expect.stringContaining('SOLANA_CLUSTER says "mainnet-beta"'),
    );
  });

  it('reports every problem at once rather than one at a time', () => {
    const problems = environmentSeparationProblems({
      NODE_ENV: 'production',
      SOLANA_RPC_URL: DEVNET_RPC,
      SOLANA_USDC_MINT: DEVNET_USDC_MINT,
      TRANSFER_PROVIDER: 'mock',
      STRIPE_SECRET_KEY: 'sk_test_abc',
    });
    expect(problems).toHaveLength(4);
  });

  it('throws with every problem named', () => {
    expect(() =>
      assertEnvironmentSeparation({
        ...productionConfig,
        TRANSFER_PROVIDER: 'mock',
      }),
    ).toThrow(EnvironmentSeparationError);

    try {
      assertEnvironmentSeparation({
        ...productionConfig,
        TRANSFER_PROVIDER: 'mock',
      });
    } catch (error) {
      expect((error as EnvironmentSeparationError).problems).toHaveLength(1);
      expect((error as Error).message).toContain('TRANSFER_PROVIDER=mock');
    }
  });

  it('passes a consistent configuration through silently', () => {
    expect(() => assertEnvironmentSeparation(productionConfig)).not.toThrow();
  });
});
