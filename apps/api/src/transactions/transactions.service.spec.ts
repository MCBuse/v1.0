import { resolveLedgerDirection } from './transactions.service';

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
