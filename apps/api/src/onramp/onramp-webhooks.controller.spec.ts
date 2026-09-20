import { OnrampWebhooksController } from './onramp-webhooks.controller';

describe('OnrampWebhooksController', () => {
  const rawBody = Buffer.from(
    JSON.stringify({
      type: 'payment_intent.succeeded',
      data: {
        object: { id: 'pi_w04', metadata: { internalReference: 'ref-w04' } },
      },
    }),
  );

  function buildController() {
    const sessions = {
      applyStripeWebhook: jest.fn().mockResolvedValue(undefined),
    };
    const stripeOnramp = {
      verifyWebhook: jest.fn().mockReturnValue(true),
      isOnrampEvent: jest.fn().mockReturnValue(true),
      parseWebhook: jest.fn().mockReturnValue({
        externalTransactionId: 'pi_w04',
        internalReference: 'ref-w04',
        status: 'completed',
      }),
    };
    const stripeOfframp = { isOfframpEvent: jest.fn().mockReturnValue(false) };
    // This event is not an account funding or payout event, so the account
    // handler declines it and the legacy on-ramp routing still applies.
    const accountsWebhooks = {
      handles: jest.fn().mockReturnValue(false),
      handleStripeEvent: jest.fn(),
    };

    const controller = new OnrampWebhooksController(
      sessions as never,
      {} as never,
      stripeOnramp as never,
      {} as never,
      {} as never,
      stripeOfframp as never,
      accountsWebhooks as never,
    );

    return { controller, sessions, stripeOnramp, accountsWebhooks };
  }

  it('accepts a verified Stripe event through the generic webhook alias', async () => {
    const { controller, sessions, stripeOnramp } = buildController();

    await expect(
      controller.handleGeneric('stripe', { rawBody }, undefined, 'sig', {
        'stripe-signature': 'sig',
      }),
    ).resolves.toEqual({ received: true });

    expect(stripeOnramp.verifyWebhook).toHaveBeenCalledWith(rawBody, 'sig');
    expect(sessions.applyStripeWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ externalTransactionId: 'pi_w04' }),
      expect.objectContaining({ type: 'payment_intent.succeeded' }),
    );
  });

  it('delegates the offramp webhook alias to the same verified handler', async () => {
    const { controller, sessions } = buildController();

    await expect(
      controller.handleOfframp('stripe', { rawBody }, undefined, 'sig', {
        'stripe-signature': 'sig',
      }),
    ).resolves.toEqual({ received: true });

    expect(sessions.applyStripeWebhook).toHaveBeenCalledTimes(1);
  });

  it('routes an account funding event to the account handler, not the legacy ramps', async () => {
    const checkoutBody = Buffer.from(
      JSON.stringify({
        id: 'evt_checkout_1',
        type: 'checkout.session.completed',
        created: 1_700_000_000,
        data: { object: { id: 'cs_test_1', payment_status: 'paid' } },
      }),
    );
    const { controller, sessions, accountsWebhooks } = buildController();
    accountsWebhooks.handles.mockReturnValue(true);
    accountsWebhooks.handleStripeEvent.mockResolvedValue({ handled: true });

    await expect(
      controller.handleGeneric(
        'stripe',
        { rawBody: checkoutBody },
        undefined,
        'sig',
        { 'stripe-signature': 'sig' },
      ),
    ).resolves.toEqual({ received: true });

    expect(accountsWebhooks.handleStripeEvent).toHaveBeenCalledTimes(1);
    // The legacy on-ramp path must not also process the same event.
    expect(sessions.applyStripeWebhook).not.toHaveBeenCalled();
  });

  it('still rejects an account event with an invalid signature', async () => {
    const { controller, stripeOnramp, accountsWebhooks } = buildController();
    stripeOnramp.verifyWebhook.mockReturnValue(false);
    accountsWebhooks.handles.mockReturnValue(true);

    await expect(
      controller.handleGeneric('stripe', { rawBody }, undefined, 'bad', {
        'stripe-signature': 'bad',
      }),
    ).rejects.toThrow(/Invalid Stripe signature/);

    expect(accountsWebhooks.handleStripeEvent).not.toHaveBeenCalled();
  });
});
