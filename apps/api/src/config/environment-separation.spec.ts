import { assertEnvironmentSeparation, environmentSeparationProblems, DEVNET_USDC_MINT, MAINNET_USDC_MINT, type SeparationInput } from './environment-separation';
const sandbox: SeparationInput = { NODE_ENV: 'production', FINANCIAL_MODE: 'sandbox', TRANSFER_PROVIDER: 'solana', SOLANA_NETWORK: 'devnet', SOLANA_RPC_URL: 'https://api.devnet.solana.com', SOLANA_USDC_MINT: DEVNET_USDC_MINT, STRIPE_SECRET_KEY: 'sk_test_fixture' };
describe('runtime and financial environment separation', () => {
  it('permits production runtime with sandbox financial providers', () => expect(() => assertEnvironmentSeparation(sandbox)).not.toThrow());
  it('permits a local mock runtime', () => expect(environmentSeparationProblems({ NODE_ENV: 'test', FINANCIAL_MODE: 'mock', TRANSFER_PROVIDER: 'mock' })).toEqual([]));
  it.each([
    { FINANCIAL_MODE: 'live' }, { FINANCIAL_MODE: 'other' },
    { STRIPE_SECRET_KEY: 'sk_live_fixture' }, { SOLANA_NETWORK: 'mainnet-beta' },
    { SOLANA_RPC_URL: 'https://api.mainnet-beta.solana.com' }, { SOLANA_USDC_MINT: MAINNET_USDC_MINT },
    { TRANSFER_PROVIDER: 'mock' }, { SOLANA_CLUSTER: 'testnet' }, { FINANCIAL_MODE: undefined },
  ])('rejects mismatched or live settings %j', override => expect(() => assertEnvironmentSeparation({ ...sandbox, ...override })).toThrow());
  it('accepts the existing cluster alias during migration', () => expect(() => assertEnvironmentSeparation({ ...sandbox, SOLANA_NETWORK: undefined, SOLANA_CLUSTER: 'devnet' })).not.toThrow());
  it('still rejects live credentials in mock mode', () => expect(() => assertEnvironmentSeparation({ FINANCIAL_MODE: 'mock', STRIPE_SECRET_KEY: 'sk_live_fixture' })).toThrow());
});
