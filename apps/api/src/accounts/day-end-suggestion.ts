/**
 * What a merchant should be offered at the end of the day.
 *
 * Two independent limits apply, and the suggestion is the smaller of them:
 *
 *  - Today's digital receipts, less anything already swept today. Sweeping more
 *    than the day actually took would move earlier days' money under today's
 *    business date and make the record misleading.
 *  - The funds actually available in Routine right now.
 *
 * Recorded cash is deliberately not part of the arithmetic. It never became a
 * digital balance, so it cannot be moved between accounts; it is carried here
 * only so the difference can be explained rather than silently ignored.
 */

export type DayEndCap =
  | 'none'
  | 'available_funds'
  | 'already_swept'
  | 'no_receipts';

export interface DayEndInput {
  availableBaseUnits: bigint;
  digitalReceiptsBaseUnits: bigint;
  alreadySweptBaseUnits: bigint;
  cashRecordedBaseUnits?: bigint;
}

export interface DayEndSuggestion extends DayEndInput {
  /** Receipts net of what has already gone across today. */
  sweepableBaseUnits: bigint;
  suggestedBaseUnits: bigint;
  cappedBy: DayEndCap;
  cashRecordedBaseUnits: bigint;
  cashNote: string;
}

const CASH_NOTE =
  'Recorded cash is not part of your digital balance and cannot be moved between accounts.';

export function suggestDayEndAmount(input: DayEndInput): DayEndSuggestion {
  const cashRecordedBaseUnits = input.cashRecordedBaseUnits ?? 0n;

  const sweepable =
    input.digitalReceiptsBaseUnits > input.alreadySweptBaseUnits
      ? input.digitalReceiptsBaseUnits - input.alreadySweptBaseUnits
      : 0n;

  const suggested =
    sweepable < input.availableBaseUnits ? sweepable : input.availableBaseUnits;

  let cappedBy: DayEndCap = 'none';
  if (input.digitalReceiptsBaseUnits === 0n) {
    cappedBy = 'no_receipts';
  } else if (input.availableBaseUnits < sweepable) {
    cappedBy = 'available_funds';
  } else if (sweepable === 0n) {
    cappedBy = 'already_swept';
  }

  return {
    ...input,
    sweepableBaseUnits: sweepable,
    suggestedBaseUnits: suggested,
    cappedBy,
    cashRecordedBaseUnits,
    cashNote: CASH_NOTE,
  };
}
