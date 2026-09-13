import { toMerchantProblem } from './merchant-problem';

describe('merchant payment problems', () => {
  it('turns internal failure reasons into safe merchant actions', () => {
    expect(
      toMerchantProblem({
        id: 'problem-1',
        reasonCode: 'transfer_failed',
        severity: 'warning',
        createdAt: new Date('2026-09-12T08:30:00.000Z'),
      }),
    ).toEqual({
      id: 'problem-1',
      code: 'payment_failed',
      severity: 'warning',
      title: 'Payment could not be completed',
      action: 'Create a new payment request and ask the customer to try again.',
      occurredAt: '2026-09-12T08:30:00.000Z',
    });
  });

  it('does not expose an unknown internal reason code', () => {
    const result = toMerchantProblem({
      id: 'problem-2',
      reasonCode: 'rpc_payload_customer_wallet_ABC123',
      severity: 'critical',
      createdAt: new Date('2026-09-12T08:31:00.000Z'),
    });

    expect(result.code).toBe('payment_issue');
    expect(JSON.stringify(result)).not.toContain('ABC123');
  });

  it('keeps a delayed on-chain confirmation actionable without calling it failed', () => {
    expect(
      toMerchantProblem({
        id: 'problem-3',
        reasonCode: 'reconciliation_delayed',
        severity: 'warning',
        createdAt: new Date('2026-09-12T08:32:00.000Z'),
      }),
    ).toEqual({
      id: 'problem-3',
      code: 'payment_delayed',
      severity: 'warning',
      title: 'Payment confirmation is delayed',
      action: 'Keep this request open while MCBuse checks the payment again.',
      occurredAt: '2026-09-12T08:32:00.000Z',
    });
  });
});
