import {
  buildReport,
  expectedDifference,
  reconcileWallet,
  stuckOperations,
  type InFlightOperation,
  type LedgerPosition,
} from './reconciliation';

const HOLDING = 'wallet-holding';
const ROUTINE = 'wallet-routine';

function position(overrides: Partial<LedgerPosition> = {}): LedgerPosition {
  return {
    walletId: HOLDING,
    address: 'HoldingAddress',
    available: 5_000_000n,
    pending: 0n,
    ...overrides,
  };
}

function operation(
  overrides: Partial<InFlightOperation> = {},
): InFlightOperation {
  return {
    id: 'op-1',
    kind: 'internal_transfer',
    status: 'chain_submitted',
    amountBaseUnits: 1_000_000n,
    sourceWalletId: HOLDING,
    destinationWalletId: ROUTINE,
    updatedAt: new Date('2026-09-21T10:00:00Z'),
    ...overrides,
  };
}

describe('ledger and chain reconciliation', () => {
  describe('a settled wallet', () => {
    it('reconciles when the two agree and nothing is in flight', () => {
      const result = reconcileWallet(position(), 5_000_000n, []);
      expect(result.status).toBe('reconciled');
      expect(result.differenceBaseUnits).toBe(0n);
      expect(result.unexplainedBaseUnits).toBe(0n);
    });

    it('counts reserved funds as part of what the wallet holds', () => {
      const result = reconcileWallet(
        position({ available: 4_000_000n, pending: 1_000_000n }),
        5_000_000n,
        [],
      );
      expect(result.ledgerBaseUnits).toBe(5_000_000n);
      expect(result.status).toBe('reconciled');
    });

    it('reports a plain shortfall as unexplained', () => {
      const result = reconcileWallet(position(), 4_000_000n, []);
      expect(result.status).toBe('unexplained');
      expect(result.differenceBaseUnits).toBe(-1_000_000n);
      expect(result.unexplainedBaseUnits).toBe(-1_000_000n);
    });

    it('reports an unexpected surplus too', () => {
      const result = reconcileWallet(position(), 6_000_000n, []);
      expect(result.status).toBe('unexplained');
      expect(result.unexplainedBaseUnits).toBe(1_000_000n);
    });
  });

  describe('a wallet with work in flight', () => {
    it('accounts for tokens already sent but not yet settled', () => {
      // Broadcast: the chain account is 1 USDC lighter, the ledger still holds
      // that 1 USDC reserved.
      const result = reconcileWallet(
        position({ available: 4_000_000n, pending: 1_000_000n }),
        4_000_000n,
        [operation()],
      );

      expect(result.differenceBaseUnits).toBe(-1_000_000n);
      expect(result.explainedBaseUnits).toBe(-1_000_000n);
      expect(result.unexplainedBaseUnits).toBe(0n);
      expect(result.status).toBe('in_flight');
    });

    it('accounts for tokens received but not yet credited', () => {
      const result = reconcileWallet(
        position({ walletId: ROUTINE, address: 'RoutineAddress', available: 0n }),
        1_000_000n,
        [operation({ status: 'chain_confirmed' })],
      );

      expect(result.explainedBaseUnits).toBe(1_000_000n);
      expect(result.unexplainedBaseUnits).toBe(0n);
      expect(result.status).toBe('in_flight');
    });

    it('still finds a real discrepancy hiding behind an in-flight transfer', () => {
      // 1 USDC explained by the transfer, 0.5 USDC that nothing explains.
      const result = reconcileWallet(
        position({ available: 4_000_000n, pending: 1_000_000n }),
        3_500_000n,
        [operation()],
      );

      expect(result.explainedBaseUnits).toBe(-1_000_000n);
      expect(result.unexplainedBaseUnits).toBe(-500_000n);
      expect(result.status).toBe('unexplained');
    });

    it('names the operation that accounts for the difference', () => {
      const result = reconcileWallet(
        position({ available: 4_000_000n, pending: 1_000_000n }),
        4_000_000n,
        [operation()],
      );
      expect(result.explanations[0]).toContain('op-1');
      expect(result.explanations[0]).toContain('internal_transfer');
    });

    it('ignores operations belonging to other wallets', () => {
      const result = reconcileWallet(position(), 5_000_000n, [
        operation({
          sourceWalletId: 'someone-else',
          destinationWalletId: 'someone-else-too',
        }),
      ]);
      expect(result.explainedBaseUnits).toBe(0n);
      expect(result.status).toBe('reconciled');
    });

    it('ignores a reservation that has not been broadcast yet', () => {
      // At `reserved` nothing has left the chain account, so the two should
      // still agree exactly.
      const result = reconcileWallet(
        position({ available: 4_000_000n, pending: 1_000_000n }),
        5_000_000n,
        [operation({ status: 'reserved' })],
      );
      expect(result.explainedBaseUnits).toBe(0n);
      expect(result.status).toBe('reconciled');
    });

    it('nets out a wallet that is both sending and receiving', () => {
      const result = reconcileWallet(
        position({ available: 4_000_000n, pending: 1_000_000n }),
        4_000_000n,
        [
          operation({ id: 'out', status: 'chain_submitted' }),
          operation({
            id: 'in',
            status: 'chain_confirmed',
            sourceWalletId: 'elsewhere',
            destinationWalletId: HOLDING,
            amountBaseUnits: 1_000_000n,
          }),
        ],
      );
      expect(result.explainedBaseUnits).toBe(0n);
      expect(result.unexplainedBaseUnits).toBe(-1_000_000n);
    });
  });

  describe('when the chain cannot be read', () => {
    it('says so instead of reporting a discrepancy', () => {
      const result = reconcileWallet(position(), null, []);
      expect(result.status).toBe('chain_unavailable');
      expect(result.differenceBaseUnits).toBeNull();
      expect(result.unexplainedBaseUnits).toBeNull();
    });

    it('is not counted as healthy', () => {
      const report = buildReport({
        wallets: [reconcileWallet(position(), null, [])],
        stuck: [],
        checkedAt: new Date('2026-09-21T10:00:00Z'),
      });
      expect(report.healthy).toBe(false);
      expect(report.unexplained).toHaveLength(1);
    });
  });

  describe('expectedDifference', () => {
    it('is zero with nothing in flight', () => {
      expect(expectedDifference(HOLDING, []).baseUnits).toBe(0n);
    });

    it('sums several in-flight operations', () => {
      const { baseUnits } = expectedDifference(HOLDING, [
        operation({ id: 'a', amountBaseUnits: 1_000_000n }),
        operation({ id: 'b', amountBaseUnits: 2_500_000n }),
      ]);
      expect(baseUnits).toBe(-3_500_000n);
    });
  });

  describe('stuck operations', () => {
    const now = new Date('2026-09-21T10:30:00Z');

    it('finds an operation that has not moved past the threshold', () => {
      const stuck = stuckOperations(
        [operation({ updatedAt: new Date('2026-09-21T10:00:00Z') })],
        now,
        15 * 60 * 1000,
      );
      expect(stuck).toHaveLength(1);
    });

    it('leaves recent work alone', () => {
      const stuck = stuckOperations(
        [operation({ updatedAt: new Date('2026-09-21T10:29:00Z') })],
        now,
        15 * 60 * 1000,
      );
      expect(stuck).toHaveLength(0);
    });
  });

  describe('the report', () => {
    it('is healthy when everything reconciles and nothing is stuck', () => {
      const report = buildReport({
        wallets: [reconcileWallet(position(), 5_000_000n, [])],
        stuck: [],
        checkedAt: new Date('2026-09-21T10:00:00Z'),
      });
      expect(report.healthy).toBe(true);
      expect(report.checkedAt).toBe('2026-09-21T10:00:00.000Z');
    });

    it('is healthy while transfers are legitimately in flight', () => {
      const report = buildReport({
        wallets: [
          reconcileWallet(
            position({ available: 4_000_000n, pending: 1_000_000n }),
            4_000_000n,
            [operation()],
          ),
        ],
        stuck: [],
        checkedAt: new Date('2026-09-21T10:00:00Z'),
      });
      expect(report.healthy).toBe(true);
    });

    it('is unhealthy when an operation is stuck, even with clean balances', () => {
      const report = buildReport({
        wallets: [reconcileWallet(position(), 5_000_000n, [])],
        stuck: [operation()],
        checkedAt: new Date('2026-09-21T10:00:00Z'),
      });
      expect(report.healthy).toBe(false);
      expect(report.stuck).toHaveLength(1);
    });

    it('lists only the wallets that need attention', () => {
      const report = buildReport({
        wallets: [
          reconcileWallet(position(), 5_000_000n, []),
          reconcileWallet(
            position({ walletId: ROUTINE, address: 'RoutineAddress' }),
            1_000_000n,
            [],
          ),
        ],
        stuck: [],
        checkedAt: new Date('2026-09-21T10:00:00Z'),
      });
      expect(report.wallets).toHaveLength(2);
      expect(report.unexplained.map((w) => w.walletId)).toEqual([ROUTINE]);
    });
  });
});
