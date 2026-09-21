/**
 * The lifecycle every durable money movement follows.
 *
 * Two rules shape this machine:
 *
 * 1. A transfer whose outcome is unknown is never resent. Once a chain
 *    signature exists the only legal recovery action is to check it.
 * 2. Once value has actually moved, failure is not a state you can jump to.
 *    The operation has to pass through compensation so the reversal is a
 *    recorded movement rather than an edit of what already happened.
 */

export const OPERATION_KINDS = [
  'funding_card',
  'funding_bank',
  'internal_transfer',
  'merchant_dayend',
  'withdrawal_bank',
  'withdrawal_card',
  'reversal',
] as const;

export type OperationKind = (typeof OPERATION_KINDS)[number];

export const OPERATION_STATUSES = [
  'created',
  'reserved',
  'collection_pending',
  'collection_settled',
  'chain_submitted',
  'chain_confirmed',
  'payout_submitted',
  'payout_settled',
  'compensating',
  'finalized',
  'failed',
  'reversed',
] as const;

export type OperationStatus = (typeof OPERATION_STATUSES)[number];

export type ResumeAction =
  | 'start'
  | 'poll_collection'
  | 'submit_chain'
  | 'check_chain'
  | 'submit_payout'
  | 'poll_payout'
  | 'finalize'
  | 'complete_compensation'
  | 'none';

const TERMINAL: readonly OperationStatus[] = [
  'finalized',
  'failed',
  'reversed',
];

/**
 * Statuses at which tokens or provider funds have genuinely moved. Reaching
 * one of these means a failure has to be compensated rather than declared.
 */
const IRREVERSIBLE: readonly OperationStatus[] = [
  'chain_confirmed',
  'payout_submitted',
  'payout_settled',
];

const FUNDING_SEQUENCE: readonly OperationStatus[] = [
  'created',
  'collection_pending',
  'collection_settled',
  'chain_submitted',
  'chain_confirmed',
  'finalized',
];

const TRANSFER_SEQUENCE: readonly OperationStatus[] = [
  'created',
  'reserved',
  'chain_submitted',
  'chain_confirmed',
  'finalized',
];

const WITHDRAWAL_SEQUENCE: readonly OperationStatus[] = [
  'created',
  'reserved',
  'chain_submitted',
  'chain_confirmed',
  'payout_submitted',
  'payout_settled',
  'finalized',
];

const REVERSAL_SEQUENCE: readonly OperationStatus[] = [
  'created',
  'chain_submitted',
  'chain_confirmed',
  'finalized',
];

const SEQUENCES: Record<OperationKind, readonly OperationStatus[]> = {
  funding_card: FUNDING_SEQUENCE,
  funding_bank: FUNDING_SEQUENCE,
  internal_transfer: TRANSFER_SEQUENCE,
  merchant_dayend: TRANSFER_SEQUENCE,
  withdrawal_bank: WITHDRAWAL_SEQUENCE,
  withdrawal_card: WITHDRAWAL_SEQUENCE,
  reversal: REVERSAL_SEQUENCE,
};

export function stepSequence(kind: OperationKind): OperationStatus[] {
  return [...SEQUENCES[kind]];
}

export function isTerminal(status: OperationStatus): boolean {
  return TERMINAL.includes(status);
}

export function movesValueIrreversibly(status: OperationStatus): boolean {
  return IRREVERSIBLE.includes(status);
}

export function nextStatus(
  kind: OperationKind,
  status: OperationStatus,
): OperationStatus | null {
  const sequence = SEQUENCES[kind];
  const index = sequence.indexOf(status);
  if (index < 0 || index === sequence.length - 1) return null;
  return sequence[index + 1];
}

export function canTransition(
  kind: OperationKind,
  from: OperationStatus,
  to: OperationStatus,
): boolean {
  if (isTerminal(from)) return false;
  // Compensation is checked first and on its own. By the time an operation is
  // compensating, value has definitively moved: the only way out is a
  // completed reversal. Letting it be declared "failed" here would leave the
  // reservation stranded with nothing left to return it.
  if (from === 'compensating') return to === 'reversed';
  const collectedFunding = (kind === 'funding_card' || kind === 'funding_bank') && ['collection_settled', 'chain_submitted', 'chain_confirmed'].includes(from);
  if (to === 'failed') return !collectedFunding && !movesValueIrreversibly(from);
  if (to === 'compensating' && collectedFunding) return from !== 'chain_confirmed';
  if (to === 'compensating') return movesValueIrreversibly(from);
  if (to === 'reversed') return false;
  return nextStatus(kind, from) === to;
}

export function resumeAction(
  kind: OperationKind,
  status: OperationStatus,
): ResumeAction {
  if (isTerminal(status)) return 'none';
  switch (status) {
    case 'created':
      return 'start';
    case 'collection_pending':
      return 'poll_collection';
    case 'collection_settled':
    case 'reserved':
      return 'submit_chain';
    case 'chain_submitted':
      return 'check_chain';
    case 'chain_confirmed':
      return kind === 'withdrawal_bank' || kind === 'withdrawal_card'
        ? 'submit_payout'
        : 'finalize';
    case 'payout_submitted':
      return 'poll_payout';
    case 'payout_settled':
      return 'finalize';
    case 'compensating':
      return 'complete_compensation';
    default:
      return 'none';
  }
}
