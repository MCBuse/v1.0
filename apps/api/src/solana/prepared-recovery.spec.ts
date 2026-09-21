import { ConfigService } from '@nestjs/config';
import { SolanaService } from './solana.service';
function setup(mode?: string) {
  const attempt = {
    signature: 'sig',
    signedTransaction: Buffer.from('identical signed bytes').toString('base64'),
    blockhash: 'block',
    lastValidBlockHeight: 100,
    network: 'devnet',
    createdAt: new Date('2026-09-21T00:00:00Z'),
  };
  const connection = {
    getSignatureStatuses: jest.fn().mockResolvedValue({ value: [null] }),
    getBlockHeight: jest.fn().mockResolvedValue(99),
    getTransaction: jest.fn().mockResolvedValue(null),
    getFirstAvailableBlock: jest.fn().mockResolvedValue(1),
    getBlockTime: jest.fn().mockResolvedValue(0),
    sendRawTransaction: jest.fn().mockResolvedValue('sig'),
  };
  const db = {
    select: () => ({ from: () => ({ where: async () => [attempt] }) }),
    update: () => ({ set: () => ({ where: jest.fn() }) }),
  };
  const service = new SolanaService(
    new ConfigService({ SOLANA_NETWORK: 'devnet', FINANCIAL_MODE: mode }),
    db as never,
  );
  jest.spyOn(service, 'getConnection').mockReturnValue(connection as never);
  return { service, connection, attempt };
}
describe('durable prepared transaction recovery', () => {
  it('refuses rebroadcast in mock financial mode', async () => {
    const { service, connection } = setup('mock');
    await expect(service.recoverTransfer('sig')).rejects.toThrow(
      'disabled in mock financial mode',
    );
    expect(connection.sendRawTransaction).not.toHaveBeenCalled();
  });
  it('does not treat pruned history as proof of non-delivery', async () => {
    const { service, connection, attempt } = setup();
    connection.getBlockHeight.mockResolvedValue(101);
    connection.getBlockTime.mockResolvedValue(
      attempt.createdAt.getTime() / 1000 + 1,
    );
    expect(await service.recoverTransfer('sig')).toBe('pending');
    expect(connection.sendRawTransaction).not.toHaveBeenCalled();
  });
  it('refuses chain submission in mock financial mode', async () => {
    const service = new SolanaService(
      new ConfigService({ FINANCIAL_MODE: 'mock' }),
    );
    await expect(service.sendTransfer({} as never)).rejects.toThrow(
      'disabled in mock financial mode',
    );
  });
  it('broadcasts exactly the stored bytes after a crash before broadcast', async () => {
    const { service, connection } = setup();
    expect(await service.recoverTransfer('sig')).toBe('pending');
    expect(connection.sendRawTransaction).toHaveBeenCalledWith(
      Buffer.from('identical signed bytes'),
      expect.anything(),
    );
  });
  it('reconciles after finalized expiry before concluding unlanded', async () => {
    const { service, connection } = setup();
    connection.getBlockHeight.mockResolvedValue(101);
    expect(await service.recoverTransfer('sig')).toBe('failed');
    expect(connection.getTransaction).toHaveBeenCalled();
    expect(connection.sendRawTransaction).not.toHaveBeenCalled();
  });
  it('retains uncertainty when chain history cannot be read', async () => {
    const { service, connection } = setup();
    connection.getBlockHeight.mockResolvedValue(101);
    connection.getTransaction.mockRejectedValue(new Error('RPC outage'));
    await expect(service.recoverTransfer('sig')).rejects.toThrow('RPC outage');
    expect(connection.sendRawTransaction).not.toHaveBeenCalled();
  });
  it('recognizes finalized delivery without resubmission', async () => {
    const { service, connection } = setup();
    connection.getSignatureStatuses.mockResolvedValue({
      value: [{ err: null, confirmationStatus: 'finalized' }],
    } as never);
    expect(await service.recoverTransfer('sig')).toBe('finalized');
    expect(connection.sendRawTransaction).not.toHaveBeenCalled();
  });
  it('never replaces an expired but confirmed transaction', async () => {
    const { service, connection } = setup();
    connection.getBlockHeight.mockResolvedValue(101);
    connection.getSignatureStatuses.mockResolvedValue({
      value: [{ err: null, confirmationStatus: 'confirmed' }],
    } as never);
    expect(await service.recoverTransfer('sig')).toBe('pending');
    expect(connection.sendRawTransaction).not.toHaveBeenCalled();
  });
});

import { Keypair } from '@solana/web3.js';
import * as transfers from './spl-transfer';

describe('chain intent recovery before operation signature persistence', () => {
  afterEach(() => jest.restoreAllMocks());
  it('reattaches the saved attempt after a crash without signing a replacement', async () => {
    let stored: Record<string, unknown> | undefined;
    const db = {
      select: () => ({
        from: () => ({ where: async () => (stored ? [stored] : []) }),
      }),
      insert: () => ({
        values: async (row: Record<string, unknown>) => {
          stored = row;
        },
      }),
    };
    const service = new SolanaService(
      new ConfigService({ SOLANA_NETWORK: 'devnet' }),
      db as never,
    );
    const helper = jest
      .spyOn(transfers, 'sendSplTransfer')
      .mockImplementation(async (params) => {
        await params.persistPrepared!({
          signature: 'saved-signature',
          signedTransaction: 'private-bytes',
          blockhash: 'block',
          lastValidBlockHeight: 100,
        });
        throw new Error('process stopped before operation signature callback');
      });
    const params = {
      connection: {} as never,
      owner: Keypair.generate(),
      mint: Keypair.generate().publicKey,
      destinationOwner: Keypair.generate().publicKey,
      amount: 12345n,
      intentKey: 'operation:durable',
      onSignaturePrepared: jest.fn(),
    };
    await expect(service.sendTransfer(params)).rejects.toThrow(
      'process stopped',
    );
    expect(params.onSignaturePrepared).not.toHaveBeenCalled();
    const recover = jest
      .spyOn(service, 'recoverTransfer')
      .mockResolvedValue('pending');
    await expect(service.sendTransfer(params)).resolves.toEqual({
      signature: 'saved-signature',
      status: 'pending',
    });
    expect(helper).toHaveBeenCalledTimes(1);
    expect(params.onSignaturePrepared).toHaveBeenCalledWith('saved-signature');
    expect(recover).toHaveBeenCalledWith('saved-signature');
    await expect(
      service.sendTransfer({ ...params, amount: 12346n }),
    ).rejects.toThrow('different transfer inputs');
  });
});
