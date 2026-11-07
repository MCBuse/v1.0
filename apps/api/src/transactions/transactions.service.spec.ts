import {
  pendingOperationEntry,
  resolveLedgerDirection,
} from './transactions.service';

const USER_WALLET = '11111111-1111-1111-1111-111111111111';
const OTHER_WALLET = '22222222-2222-2222-2222-222222222222';
const SAVINGS_WALLET = '33333333-3333-3333-3333-333333333333';

function row(overrides: {
  debitWalletId: string;
  creditWalletId: string;
  type: string;
  currency?: string;
  metadata?: string | null;
}) {
  return {
    currency: 'USDC',
    metadata: null,
    ...overrides,
  };
}

describe('resolveLedgerDirection', () => {
  it('marks recipient-side p2p entries as credits', () => {
    expect(
      resolveLedgerDirection(
        row({
          debitWalletId: OTHER_WALLET,
          creditWalletId: USER_WALLET,
          type: 'p2p',
        }),
        new Set([USER_WALLET]),
      ),
    ).toBe('credit');
  });

  it('marks sender-side p2p entries as debits', () => {
    expect(
      resolveLedgerDirection(
        row({
          debitWalletId: USER_WALLET,
          creditWalletId: OTHER_WALLET,
          type: 'p2p',
        }),
        new Set([USER_WALLET]),
      ),
    ).toBe('debit');
  });

  it('treats all-wallet internal transfers as neutral', () => {
    expect(
      resolveLedgerDirection(
        row({
          debitWalletId: USER_WALLET,
          creditWalletId: SAVINGS_WALLET,
          type: 'internal',
        }),
        new Set([USER_WALLET, SAVINGS_WALLET]),
      ),
    ).toBe('neutral');
  });

  it('resolves internal transfer direction when filtered to one wallet', () => {
    const entry = row({
      debitWalletId: USER_WALLET,
      creditWalletId: SAVINGS_WALLET,
      type: 'internal',
    });

    expect(resolveLedgerDirection(entry, new Set([USER_WALLET]))).toBe('debit');
    expect(resolveLedgerDirection(entry, new Set([SAVINGS_WALLET]))).toBe(
      'credit',
    );
  });

  it('uses transaction type for self-referential on-ramp and off-ramp rows', () => {
    expect(
      resolveLedgerDirection(
        row({
          debitWalletId: USER_WALLET,
          creditWalletId: USER_WALLET,
          type: 'on_ramp',
        }),
        new Set([USER_WALLET]),
      ),
    ).toBe('credit');

    expect(
      resolveLedgerDirection(
        row({
          debitWalletId: USER_WALLET,
          creditWalletId: USER_WALLET,
          type: 'off_ramp',
        }),
        new Set([USER_WALLET]),
      ),
    ).toBe('debit');
  });

  it('uses swap metadata to distinguish debit and credit legs', () => {
    const metadata = JSON.stringify({
      fromCurrency: 'USDC',
      toCurrency: 'EURC',
    });

    expect(
      resolveLedgerDirection(
        row({
          debitWalletId: USER_WALLET,
          creditWalletId: USER_WALLET,
          currency: 'USDC',
          type: 'swap',
          metadata,
        }),
        new Set([USER_WALLET]),
      ),
    ).toBe('debit');

    expect(
      resolveLedgerDirection(
        row({
          debitWalletId: USER_WALLET,
          creditWalletId: USER_WALLET,
          currency: 'EURC',
          type: 'swap',
          metadata,
        }),
        new Set([USER_WALLET]),
      ),
    ).toBe('credit');
  });
});

describe('pendingOperationEntry', () => {
  const op = (
    overrides: Partial<Parameters<typeof pendingOperationEntry>[0]>,
  ) => ({
    id: '44444444-4444-4444-4444-444444444444',
    kind: 'internal_transfer',
    status: 'reserved',
    sourceWalletId: SAVINGS_WALLET,
    destinationWalletId: USER_WALLET,
    amountBaseUnits: 5_000_000n,
    currency: 'USDC',
    chainSignature: null,
    metadata: { from: 'savings', to: 'routine' },
    createdAt: new Date('2026-11-07T09:30:00Z'),
    ...overrides,
  });

  it('shows a reserved holding-to-routine move as a pending internal entry', () => {
    expect(pendingOperationEntry(op({}))).toMatchObject({
      id: '44444444-4444-4444-4444-444444444444',
      type: 'internal',
      direction: 'neutral',
      status: 'pending',
      amount: '5000000',
      debitWalletId: SAVINGS_WALLET,
      creditWalletId: USER_WALLET,
    });
  });

  it.each(['chain_submitted', 'chain_confirmed', 'compensating'])(
    'keeps showing it while %s',
    (status) => {
      expect(pendingOperationEntry(op({ status }))?.status).toBe('pending');
    },
  );

  it.each(['created', 'collection_pending', 'finalized', 'failed', 'reversed'])(
    'hides it when %s',
    (status) => {
      expect(pendingOperationEntry(op({ status }))).toBeNull();
    },
  );

  it('maps funding to an on-ramp credit using the destination for both wallets', () => {
    expect(
      pendingOperationEntry(
        op({
          kind: 'funding_card',
          status: 'collection_settled',
          sourceWalletId: null,
        }),
      ),
    ).toMatchObject({
      type: 'on_ramp',
      direction: 'credit',
      debitWalletId: USER_WALLET,
      creditWalletId: USER_WALLET,
    });
  });

  it('maps withdrawals to an off-ramp debit', () => {
    expect(
      pendingOperationEntry(
        op({ kind: 'withdrawal_bank', destinationWalletId: null }),
      ),
    ).toMatchObject({
      type: 'off_ramp',
      direction: 'debit',
      creditWalletId: SAVINGS_WALLET,
    });
  });

  it('ignores reversals', () => {
    expect(pendingOperationEntry(op({ kind: 'reversal' }))).toBeNull();
  });
});
