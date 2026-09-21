/**
 * X.10 — reconciling what the ledger says a wallet holds against what the
 * chain says it holds.
 *
 * The naive version of this check is useless, because the two numbers are
 * *supposed* to disagree while an operation is in flight: tokens leave the
 * chain account at broadcast, and the ledger only settles once the transfer is
 * finalized. A report that flagged every in-flight transfer would be ignored
 * within a day.
 *
 * So the difference is compared against the difference the in-flight
 * operations actually account for. What is left over — the unexplained part —
 * is the number worth waking someone for.
 */

export interface LedgerPosition {
  walletId: string;
  address: string;
  /** Spendable, in token base units. */
  available: bigint;
  /** Reserved against an in-flight operation, in token base units. */
  pending: bigint;
}

export interface InFlightOperation {
  id: string;
  kind: string;
  status: string;
  amountBaseUnits: bigint;
  sourceWalletId: string | null;
  destinationWalletId: string | null;
  updatedAt: Date;
}

export interface WalletReconciliation {
  walletId: string;
  address: string;
  ledgerBaseUnits: bigint;
  chainBaseUnits: bigint | null;
  /** chain − ledger. Negative means the chain holds less than the books say. */
  differenceBaseUnits: bigint | null;
  /** The part of the difference the in-flight operations account for. */
  explainedBaseUnits: bigint;
  /** What no in-flight operation accounts for. Zero is the healthy state. */
  unexplainedBaseUnits: bigint | null;
  explanations: string[];
  status: 'reconciled' | 'in_flight' | 'unexplained' | 'chain_unavailable';
}

export interface ReconciliationReport {
  checkedAt: string;
  wallets: WalletReconciliation[];
  unexplained: WalletReconciliation[];
  stuck: InFlightOperation[];
  healthy: boolean;
}

/**
 * Statuses at which the tokens have left the source's chain account but the
 * ledger has not yet settled the reservation.
 */
const TOKENS_GONE_LEDGER_PENDING = ['chain_submitted', 'chain_confirmed'];

/**
 * Statuses at which the tokens have arrived at the destination's chain account
 * but the ledger has not yet credited it.
 */
const TOKENS_ARRIVED_LEDGER_UNCREDITED = ['chain_confirmed', 'payout_settled'];

export function expectedDifference(
  walletId: string,
  inFlight: InFlightOperation[],
): { baseUnits: bigint; explanations: string[] } {
  let baseUnits = 0n;
  const explanations: string[] = [];

  for (const operation of inFlight) {
    if (
      operation.sourceWalletId === walletId &&
      TOKENS_GONE_LEDGER_PENDING.includes(operation.status)
    ) {
      baseUnits -= operation.amountBaseUnits;
      explanations.push(
        `${operation.id} (${operation.kind}/${operation.status}) has sent ${operation.amountBaseUnits} that the ledger still holds reserved`,
      );
    }
    if (
      operation.destinationWalletId === walletId &&
      TOKENS_ARRIVED_LEDGER_UNCREDITED.includes(operation.status)
    ) {
      baseUnits += operation.amountBaseUnits;
      explanations.push(
        `${operation.id} (${operation.kind}/${operation.status}) has received ${operation.amountBaseUnits} that the ledger has not yet credited`,
      );
    }
  }

  return { baseUnits, explanations };
}

export function reconcileWallet(
  position: LedgerPosition,
  chainBaseUnits: bigint | null,
  inFlight: InFlightOperation[],
): WalletReconciliation {
  const ledgerBaseUnits = position.available + position.pending;
  const { baseUnits: explained, explanations } = expectedDifference(
    position.walletId,
    inFlight,
  );

  if (chainBaseUnits === null) {
    return {
      walletId: position.walletId,
      address: position.address,
      ledgerBaseUnits,
      chainBaseUnits: null,
      differenceBaseUnits: null,
      explainedBaseUnits: explained,
      unexplainedBaseUnits: null,
      explanations,
      // An unreadable chain is not a clean bill of health, and not a
      // discrepancy either. It is its own state.
      status: 'chain_unavailable',
    };
  }

  const difference = chainBaseUnits - ledgerBaseUnits;
  const unexplained = difference - explained;

  let status: WalletReconciliation['status'];
  if (unexplained !== 0n) status = 'unexplained';
  else if (explained !== 0n) status = 'in_flight';
  else status = 'reconciled';

  return {
    walletId: position.walletId,
    address: position.address,
    ledgerBaseUnits,
    chainBaseUnits,
    differenceBaseUnits: difference,
    explainedBaseUnits: explained,
    unexplainedBaseUnits: unexplained,
    explanations,
    status,
  };
}

/** In-flight operations that have not moved for longer than the threshold. */
export function stuckOperations(
  inFlight: InFlightOperation[],
  now: Date,
  thresholdMs: number,
): InFlightOperation[] {
  return inFlight.filter(
    (operation) => now.getTime() - operation.updatedAt.getTime() > thresholdMs,
  );
}

export function buildReport(params: {
  wallets: WalletReconciliation[];
  stuck: InFlightOperation[];
  checkedAt: Date;
}): ReconciliationReport {
  const unexplained = params.wallets.filter(
    (wallet) =>
      wallet.status === 'unexplained' || wallet.status === 'chain_unavailable',
  );
  return {
    checkedAt: params.checkedAt.toISOString(),
    wallets: params.wallets,
    unexplained,
    stuck: params.stuck,
    healthy: unexplained.length === 0 && params.stuck.length === 0,
  };
}
