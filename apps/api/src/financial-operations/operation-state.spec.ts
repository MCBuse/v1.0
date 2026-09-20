import {
  OPERATION_KINDS,
  OperationKind,
  OperationStatus,
  canTransition,
  isTerminal,
  movesValueIrreversibly,
  nextStatus,
  resumeAction,
  stepSequence,
} from './operation-state';

describe('financial operation state machine', () => {
  describe('stepSequence', () => {
    it('collects from the provider before moving tokens when funding', () => {
      expect(stepSequence('funding_card')).toEqual([
        'created',
        'collection_pending',
        'collection_settled',
        'chain_submitted',
        'chain_confirmed',
        'finalized',
      ]);
    });

    it('treats bank funding as the same asynchronous collection sequence', () => {
      expect(stepSequence('funding_bank')).toEqual(
        stepSequence('funding_card'),
      );
    });

    it('reserves before moving tokens on an internal transfer', () => {
      expect(stepSequence('internal_transfer')).toEqual([
        'created',
        'reserved',
        'chain_submitted',
        'chain_confirmed',
        'finalized',
      ]);
    });

    it('treats a day-end sweep as an internal transfer sequence', () => {
      expect(stepSequence('merchant_dayend')).toEqual(
        stepSequence('internal_transfer'),
      );
    });

    it('returns tokens to the treasury before paying out on a withdrawal', () => {
      expect(stepSequence('withdrawal_bank')).toEqual([
        'created',
        'reserved',
        'chain_submitted',
        'chain_confirmed',
        'payout_submitted',
        'payout_settled',
        'finalized',
      ]);
    });

    it('uses the same sequence for a debit-card withdrawal', () => {
      expect(stepSequence('withdrawal_card')).toEqual(
        stepSequence('withdrawal_bank'),
      );
    });

    it('defines a sequence for every kind', () => {
      for (const kind of OPERATION_KINDS) {
        expect(stepSequence(kind).length).toBeGreaterThan(1);
        expect(stepSequence(kind)[0]).toBe('created');
        expect(stepSequence(kind).at(-1)).toBe('finalized');
      }
    });
  });

  describe('nextStatus', () => {
    it('advances one step along the kind sequence', () => {
      expect(nextStatus('withdrawal_bank', 'chain_confirmed')).toBe(
        'payout_submitted',
      );
    });

    it('has no next step past finalization', () => {
      expect(nextStatus('internal_transfer', 'finalized')).toBeNull();
    });

    it('has no next step for a status outside the kind sequence', () => {
      expect(nextStatus('internal_transfer', 'payout_submitted')).toBeNull();
    });
  });

  describe('canTransition', () => {
    it('allows the next step in sequence', () => {
      expect(
        canTransition('funding_card', 'collection_settled', 'chain_submitted'),
      ).toBe(true);
    });

    it('refuses to skip a step', () => {
      expect(
        canTransition('funding_card', 'collection_pending', 'finalized'),
      ).toBe(false);
    });

    it('refuses to move backwards', () => {
      expect(
        canTransition('funding_card', 'chain_confirmed', 'chain_submitted'),
      ).toBe(false);
    });

    it('allows failure while nothing has moved yet', () => {
      for (const from of [
        'created',
        'collection_pending',
      ] as OperationStatus[]) {
        expect(canTransition('funding_card', from, 'failed')).toBe(true);
      }
    });

    it('allows failure from a reservation, which is released locally', () => {
      expect(canTransition('internal_transfer', 'reserved', 'failed')).toBe(
        true,
      );
    });

    it('allows failure from a submitted chain transfer that the chain rejected', () => {
      expect(
        canTransition('internal_transfer', 'chain_submitted', 'failed'),
      ).toBe(true);
    });

    it('refuses plain failure once tokens have actually moved', () => {
      expect(
        canTransition('withdrawal_bank', 'chain_confirmed', 'failed'),
      ).toBe(false);
      expect(
        canTransition('withdrawal_bank', 'payout_submitted', 'failed'),
      ).toBe(false);
      expect(canTransition('withdrawal_bank', 'payout_settled', 'failed')).toBe(
        false,
      );
    });

    it('routes a post-movement failure through compensation', () => {
      expect(
        canTransition('withdrawal_bank', 'chain_confirmed', 'compensating'),
      ).toBe(true);
      expect(
        canTransition('withdrawal_bank', 'payout_submitted', 'compensating'),
      ).toBe(true);
      expect(canTransition('withdrawal_bank', 'compensating', 'reversed')).toBe(
        true,
      );
    });

    it('refuses to reverse straight from compensation to finalized', () => {
      expect(
        canTransition('withdrawal_bank', 'compensating', 'finalized'),
      ).toBe(false);
    });

    it('refuses any transition out of a terminal status', () => {
      for (const terminal of [
        'finalized',
        'failed',
        'reversed',
      ] as OperationStatus[]) {
        expect(canTransition('withdrawal_bank', terminal, 'compensating')).toBe(
          false,
        );
        expect(canTransition('withdrawal_bank', terminal, 'finalized')).toBe(
          false,
        );
        expect(canTransition('withdrawal_bank', terminal, 'failed')).toBe(
          false,
        );
      }
    });
  });

  describe('isTerminal', () => {
    it('treats finalized, failed and reversed as terminal', () => {
      expect(isTerminal('finalized')).toBe(true);
      expect(isTerminal('failed')).toBe(true);
      expect(isTerminal('reversed')).toBe(true);
    });

    it('treats every in-flight status as non-terminal', () => {
      for (const status of [
        'created',
        'reserved',
        'collection_pending',
        'collection_settled',
        'chain_submitted',
        'chain_confirmed',
        'payout_submitted',
        'payout_settled',
        'compensating',
      ] as OperationStatus[]) {
        expect(isTerminal(status)).toBe(false);
      }
    });
  });

  describe('movesValueIrreversibly', () => {
    it('is false before the chain confirms', () => {
      expect(movesValueIrreversibly('created')).toBe(false);
      expect(movesValueIrreversibly('reserved')).toBe(false);
      expect(movesValueIrreversibly('chain_submitted')).toBe(false);
    });

    it('is true once the chain has confirmed or a payout exists', () => {
      expect(movesValueIrreversibly('chain_confirmed')).toBe(true);
      expect(movesValueIrreversibly('payout_submitted')).toBe(true);
      expect(movesValueIrreversibly('payout_settled')).toBe(true);
    });
  });

  describe('resumeAction', () => {
    it('starts an operation that never got going', () => {
      expect(resumeAction('funding_card', 'created')).toBe('start');
    });

    it('polls the provider while a collection is outstanding', () => {
      expect(resumeAction('funding_bank', 'collection_pending')).toBe(
        'poll_collection',
      );
    });

    it('submits the treasury transfer once the collection settled', () => {
      expect(resumeAction('funding_bank', 'collection_settled')).toBe(
        'submit_chain',
      );
    });

    it('submits the chain transfer once funds are reserved', () => {
      expect(resumeAction('internal_transfer', 'reserved')).toBe(
        'submit_chain',
      );
    });

    it('checks an uncertain chain transfer instead of resending it', () => {
      expect(resumeAction('internal_transfer', 'chain_submitted')).toBe(
        'check_chain',
      );
      expect(resumeAction('withdrawal_card', 'chain_submitted')).toBe(
        'check_chain',
      );
      expect(resumeAction('funding_card', 'chain_submitted')).toBe(
        'check_chain',
      );
    });

    it('never resends a chain transfer from any status', () => {
      for (const kind of OPERATION_KINDS) {
        for (const status of stepSequence(kind)) {
          expect(resumeAction(kind, status)).not.toBe('resend_chain');
        }
      }
    });

    it('moves a confirmed withdrawal on to the payout', () => {
      expect(resumeAction('withdrawal_bank', 'chain_confirmed')).toBe(
        'submit_payout',
      );
    });

    it('finalizes a confirmed funding or transfer directly', () => {
      expect(resumeAction('funding_card', 'chain_confirmed')).toBe('finalize');
      expect(resumeAction('internal_transfer', 'chain_confirmed')).toBe(
        'finalize',
      );
    });

    it('polls an outstanding payout', () => {
      expect(resumeAction('withdrawal_card', 'payout_submitted')).toBe(
        'poll_payout',
      );
    });

    it('finalizes a settled payout', () => {
      expect(resumeAction('withdrawal_card', 'payout_settled')).toBe(
        'finalize',
      );
    });

    it('completes an interrupted compensation', () => {
      expect(resumeAction('withdrawal_bank', 'compensating')).toBe(
        'complete_compensation',
      );
    });

    it('does nothing for a terminal operation', () => {
      for (const status of [
        'finalized',
        'failed',
        'reversed',
      ] as OperationStatus[]) {
        expect(resumeAction('withdrawal_bank', status)).toBe('none');
      }
    });

    it('has an action for every reachable status of every kind', () => {
      for (const kind of OPERATION_KINDS) {
        for (const status of stepSequence(kind)) {
          expect(resumeAction(kind, status)).toBeDefined();
        }
      }
    });
  });

  it('exposes every kind the platform can run', () => {
    const expected: OperationKind[] = [
      'funding_card',
      'funding_bank',
      'internal_transfer',
      'merchant_dayend',
      'withdrawal_bank',
      'withdrawal_card',
      'reversal',
    ];
    expect([...OPERATION_KINDS].sort()).toEqual(expected.sort());
  });
});
