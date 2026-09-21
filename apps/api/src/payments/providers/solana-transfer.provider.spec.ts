import { getAccount, getMint } from '@solana/spl-token';
import { Keypair, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { SolanaService } from '../../solana/solana.service';
import type { TreasuryService } from '../../treasury/treasury.service';
import type { TransferParams } from '../transfer-provider.interface';
import { SolanaTransferProvider } from './solana-transfer.provider';

jest.mock('@solana/spl-token', () => {
  const actual =
    jest.requireActual<typeof import('@solana/spl-token')>('@solana/spl-token');
  return {
    ...actual,
    getMint: jest.fn(),
    getAccount: jest.fn(),
  };
});

const mockedGetMint = getMint as jest.MockedFunction<typeof getMint>;
const mockedGetAccount = getAccount as jest.MockedFunction<typeof getAccount>;

function setup({
  destinationExists = true,
  treasuryConfigured = true,
}: { destinationExists?: boolean; treasuryConfigured?: boolean } = {}) {
  const payer = Keypair.generate();
  const payee = Keypair.generate();
  const treasuryKeypair = Keypair.generate();
  const blockhash = Keypair.generate().publicKey.toBase58();
  const events: string[] = [];
  const broadcast: Transaction[] = [];

  const connection = {
    getLatestBlockhash: jest.fn().mockResolvedValue({
      blockhash,
      lastValidBlockHeight: 123,
    }),
    sendRawTransaction: jest.fn((wireTransaction: Buffer) => {
      events.push('broadcast');
      const transaction = Transaction.from(wireTransaction);
      broadcast.push(transaction);
      if (!transaction.signature)
        throw new Error('Test transaction was not signed');
      return Promise.resolve(bs58.encode(transaction.signature));
    }),
    confirmTransaction: jest.fn().mockResolvedValue({ value: { err: null } }),
    getSignatureStatuses: jest.fn().mockResolvedValue({
      value: [{ err: null, confirmationStatus: 'finalized' }],
    }),
  };

  const solana = {
    getConnection: jest.fn(() => connection),
    decryptKeypair: jest.fn(() => payer),
  } as unknown as SolanaService;

  const treasury = {
    feePayer: () => (treasuryConfigured ? treasuryKeypair : undefined),
  } as unknown as TreasuryService;

  const provider = new SolanaTransferProvider(solana, treasury);

  if (destinationExists) mockedGetAccount.mockResolvedValue({} as never);
  else mockedGetAccount.mockRejectedValue(new Error('not found'));
  mockedGetMint.mockResolvedValue({ decimals: 6 } as never);

  const params: TransferParams = {
    payerWalletId: 'payer-wallet',
    payerPubkey: payer.publicKey.toBase58(),
    payerEncryptedKeypair: 'encrypted',
    payeeWalletId: 'payee-wallet',
    payeePubkey: payee.publicKey.toBase58(),
    amount: 4_500_000n,
    currency: 'USDC',
    idempotencyKey: 'payment-attempt',
  };

  return { broadcast, connection, events, params, payer, provider, treasuryKeypair };
}

describe('SolanaTransferProvider', () => {
  beforeEach(() => jest.clearAllMocks());

  it('persists the deterministic signature before broadcasting', async () => {
    const { connection, events, params, provider } = setup();
    let preparedSignature = '';

    const result = await provider.execute({
      ...params,
      onSignaturePrepared: (signature) => {
        preparedSignature = signature;
        events.push('prepared');
        return Promise.resolve();
      },
      onSubmitted: (signature) => {
        expect(signature).toBe(preparedSignature);
        events.push('submitted');
        return Promise.resolve();
      },
    });

    expect(events).toEqual(['prepared', 'broadcast', 'submitted']);
    expect(connection.confirmTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ signature: preparedSignature }),
      'finalized',
    );
    expect(result).toEqual({
      txSignature: preparedSignature,
      status: 'completed',
    });
  });

  it('does not broadcast when durable signature persistence fails', async () => {
    const { connection, params, provider } = setup();

    const result = await provider.execute({
      ...params,
      onSignaturePrepared: () =>
        Promise.reject(new Error('database unavailable')),
    });

    expect(connection.sendRawTransaction).not.toHaveBeenCalled();
    expect(result).toEqual({ txSignature: null, status: 'failed' });
  });

  it('returns a recoverable signature when persistence fails after broadcast', async () => {
    const { connection, params, provider } = setup();
    let preparedSignature = '';

    const result = await provider.execute({
      ...params,
      onSignaturePrepared: (signature) => {
        preparedSignature = signature;
        return Promise.resolve();
      },
      onSubmitted: () =>
        Promise.reject(new Error('database unavailable after broadcast')),
    });

    expect(connection.sendRawTransaction).toHaveBeenCalledTimes(1);
    expect(connection.getSignatureStatuses).toHaveBeenCalledWith(
      [preparedSignature],
      { searchTransactionHistory: true },
    );
    expect(result).toEqual({
      txSignature: preparedSignature,
      status: 'pending',
    });
  });

  describe('who pays', () => {
    it('makes the treasury the fee payer, never the customer', async () => {
      // The customer holds no SOL by design, so a transaction that asked them
      // to pay the fee could not execute at all.
      const { broadcast, params, provider, treasuryKeypair } = setup();

      await provider.execute(params);

      expect(broadcast).toHaveLength(1);
      expect(broadcast[0]!.feePayer?.toBase58()).toBe(
        treasuryKeypair.publicKey.toBase58(),
      );
    });

    it('creates the merchant’s token account when they have never been paid', async () => {
      const { broadcast, params, provider, treasuryKeypair } = setup({
        destinationExists: false,
      });

      await provider.execute(params);

      const instructions = broadcast[0]!.instructions;
      // Two instructions: create the destination account, then transfer.
      expect(instructions).toHaveLength(2);
      // The treasury funds the rent, not the payer.
      expect(instructions[0]!.keys[0]!.pubkey.toBase58()).toBe(
        treasuryKeypair.publicKey.toBase58(),
      );
    });

    it('sends only the transfer when the merchant already has an account', async () => {
      const { broadcast, params, provider } = setup({
        destinationExists: true,
      });

      await provider.execute(params);

      expect(broadcast[0]!.instructions).toHaveLength(1);
    });

    it('refuses rather than asking the customer to cover the fee', async () => {
      const { connection, params, provider } = setup({
        treasuryConfigured: false,
      });

      await expect(provider.execute(params)).rejects.toThrow(
        /treasury is not configured/i,
      );
      expect(connection.sendRawTransaction).not.toHaveBeenCalled();
    });
  });
});
