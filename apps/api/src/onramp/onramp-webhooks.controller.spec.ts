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

    const controller = new OnrampWebhooksController(
      sessions as never,
      {} as never,
      stripeOnramp as never,
      {} as never,
      {} as never,
      stripeOfframp as never,
    );

    return { controller, sessions, stripeOnramp };
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
});
