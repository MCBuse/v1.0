import * as shared from '@repo/shared';
import * as local from './credit-labels';

describe('API credit labels', () => {
  it('match the shared labels the portal uses', () => {
    expect(local.CREDIT_STAGE_LABELS).toEqual(shared.CREDIT_STAGE_LABELS);
    expect(local.CREDIT_INPUT_LABELS).toEqual(shared.CREDIT_INPUT_LABELS);
    expect(local.MERCHANT_CATEGORY_LABELS).toEqual(
      shared.MERCHANT_CATEGORY_LABELS,
    );
    expect(local.CREDIT_GRADE_BANDS).toEqual(shared.CREDIT_GRADE_BANDS);
    for (const reason of [
      'Not provided in the business credit profile.',
      'Not enough recorded sales in the evidence period.',
      'Insufficient compatible verified records in the evidence period.',
      'Verified supplier spending is not connected.',
      null,
    ])
      expect(local.missingInputKind(reason)).toBe(
        shared.missingInputKind(reason),
      );
  });
});
