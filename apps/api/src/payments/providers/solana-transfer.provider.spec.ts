import { getMint, getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import { Keypair, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { SolanaService } from '../../solana/solana.service';
import type { TransferParams } from '../transfer-provider.interface';
import { SolanaTransferProvider } from './solana-transfer.provider';

jest.mock('@solana/spl-token', () => {
  const actual =
    jest.requireActual<typeof import('@solana/spl-token')>('@solana/spl-token');
  return {
    ...actual,
    getMint: jest.fn(),
    getOrCreateAssociatedTokenAccount: jest.fn(),
  };
});

const mockedGetMint = getMint as jest.MockedFunction<typeof getMint>;
const mockedGetOrCreateAssociatedTokenAccount =
  getOrCreateAssociatedTokenAccount as jest.MockedFunction<
    typeof getOrCreateAssociatedTokenAccount
  >;

function setup() {
  const payer = Keypair.generate();
  const payee = Keypair.generate();
  const blockhash = Keypair.generate().publicKey.toBase58();
  const events: string[] = [];
  const connection = {
    getLatestBlockhash: jest.fn().mockResolvedValue({
      blockhash,
      lastValidBlockHeight: 123,
    }),
    sendRawTransaction: jest.fn((wireTransaction: Buffer) => {
      events.push('broadcast');
      const signature = Transaction.from(wireTransaction).signature;
      if (!signature) throw new Error('Test transaction was not signed');
      return Promise.resolve(bs58.encode(signature));
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
  const provider = new SolanaTransferProvider(solana);

  mockedGetOrCreateAssociatedTokenAccount
    .mockResolvedValueOnce({
      address: Keypair.generate().publicKey,
    } as never)
    .mockResolvedValueOnce({
      address: Keypair.generate().publicKey,
    } as never);
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

  return { connection, events, params, provider };
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
});
