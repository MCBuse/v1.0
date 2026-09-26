import {
  CREDIT_EVIDENCE_WINDOW_DAYS,
  CreditEvidenceService,
} from './credit-evidence.service';

type Built = Awaited<ReturnType<CreditEvidenceService['build']>>;

describe('CreditEvidenceService.preview', () => {
  const service = new CreditEvidenceService({} as never, {} as never);

  it('returns only activity-derived inputs, with reasons for missing ones, over the run window', async () => {
    const build = jest.spyOn(service, 'build').mockResolvedValue({
      values: {
        finalized_payments: 12,
        avg_txn_value_eur: 7.5,
        estimated_margin_pct: null,
        loan_amount_eur: 5000,
        collateral_value_eur: null,
      },
      asOfDate: '2026-09-26',
      provenance: {
        finalized_payments: 'mcbuse_live_payments',
        avg_txn_value_eur: 'mcbuse_live_payments',
        estimated_margin_pct: 'unavailable',
        loan_amount_eur: 'merchant_declared',
        collateral_value_eur: 'unavailable',
      },
      missingReasons: {
        estimated_margin_pct: 'Verified supplier spending is not connected.',
        collateral_value_eur: 'Not provided in the business credit profile.',
      },
      integritySummary: ['12 live verified payments.'],
      profile: {},
      evidenceWindow: { from: 'a', to: 'b' },
    } as unknown as Built);

    const to = new Date('2026-09-26T12:00:00.000Z');
    const preview = await service.preview('merchant-1', to);

    const [, calledTo, calledFrom] = build.mock.calls[0]!;
    expect(calledTo).toBe(to);
    expect((to.getTime() - (calledFrom as Date).getTime()) / 86_400_000).toBe(
      CREDIT_EVIDENCE_WINDOW_DAYS,
    );
    // Declared inputs belong to the Additional Information form, not here.
    expect(preview.inputs.map((input) => input.key)).toEqual([
      'finalized_payments',
      'avg_txn_value_eur',
      'estimated_margin_pct',
    ]);
    expect(preview.inputs[1]).toEqual({
      key: 'avg_txn_value_eur',
      value: 7.5,
      provenance: 'mcbuse_live_payments',
      missingReason: null,
    });
    // Missing stays missing and says why; it is never imputed.
    expect(preview.inputs[2]).toEqual({
      key: 'estimated_margin_pct',
      value: null,
      provenance: 'unavailable',
      missingReason: 'Verified supplier spending is not connected.',
    });
    expect(preview.integritySummary).toEqual(['12 live verified payments.']);
  });
});
