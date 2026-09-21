import { AccountFundingService } from './account-funding.service';
function setup(chain = 'failed', refundStatus = 'pending') {
  const op = {
    id: 'op',
    status: 'compensating',
    kind: 'funding_card',
    paymentIntentId: 'pi_original',
    chainSignature: 'sig',
    displayAmountMinor: 500n,
    refundId: null,
  };
  const ops = {
    require: jest.fn().mockResolvedValue(op),
    note: jest.fn(),
    deferNextAttempt: jest.fn(),
    patchProvider: jest.fn(),
    completeCompensation: jest.fn(),
  };
  const stripe = {
    paymentIntents: {
      retrieve: jest
        .fn()
        .mockResolvedValue({
          id: 'pi_original',
          latest_charge: { disputed: false, amount_refunded: 0 },
        }),
    },
    refunds: {
      list: jest.fn().mockResolvedValue({ data: [] }),
      retrieve: jest
        .fn()
        .mockResolvedValue({ id: 're_1', status: refundStatus }),
      create: jest.fn().mockResolvedValue({ id: 're_1', status: refundStatus }),
    },
  };
  const service = new AccountFundingService(
    { stripe } as never,
    null as never,
    { statusOf: jest.fn().mockResolvedValue(chain) } as never,
    ops as never,
    null as never,
    null as never,
    null as never,
  );
  return { service, op, ops, stripe };
}
describe('collected funding refund safety', () => {
  it.each(['pending', 'finalized'])(
    'does not refund when chain status is %s',
    async (status) => {
      const { service, op, stripe } = setup(status);
      await service.refundFunding(op as never);
      expect(stripe.refunds.create).not.toHaveBeenCalled();
    },
  );
  it('refunds only the original PaymentIntent with a stable key', async () => {
    const { service, op, ops, stripe } = setup();
    await service.refundFunding(op as never);
    expect(stripe.refunds.create).toHaveBeenCalledWith(
      {
        payment_intent: 'pi_original',
        amount: 500,
        metadata: { operationId: 'op' },
      },
      { idempotencyKey: 'funding-refund:op' },
    );
    expect(ops.completeCompensation).not.toHaveBeenCalled();
    expect(ops.patchProvider).toHaveBeenCalledWith('op', {
      refundId: 're_1',
      refundStatus: 'pending',
    });
  });
  it('only confirms reversal after provider success', async () => {
    const { service, op, ops } = setup('failed', 'succeeded');
    await service.refundFunding(op as never);
    expect(ops.completeCompensation).toHaveBeenCalledTimes(1);
  });
  it.each(['failed', 'requires_action', 'canceled'])(
    'keeps %s refunds visible and unresolved',
    async (status) => {
      const { service, op, ops } = setup('failed', status);
      await service.refundFunding(op as never);
      expect(ops.completeCompensation).not.toHaveBeenCalled();
      expect(ops.patchProvider).toHaveBeenCalledWith(
        'op',
        expect.objectContaining({ refundStatus: status }),
      );
    },
  );
  it('does not refund disputed or already refunded charges', async () => {
    for (const charge of [
      { disputed: true, amount_refunded: 0 },
      { disputed: false, amount_refunded: 500 },
    ]) {
      const { service, op, stripe } = setup();
      stripe.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_original',
        latest_charge: charge,
      });
      await service.refundFunding(op as never);
      expect(stripe.refunds.create).not.toHaveBeenCalled();
    }
  });
  it('recovers a refund whose response was lost', async () => {
    const { service, op, stripe, ops } = setup();
    stripe.refunds.list.mockResolvedValue({
      data: [
        { id: 're_old', status: 'succeeded', metadata: { operationId: 'op' } },
      ],
    } as never);
    await service.refundFunding(op as never);
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(ops.completeCompensation).toHaveBeenCalledWith(
      'op',
      expect.objectContaining({ refundId: 're_old' }),
    );
  });
});
