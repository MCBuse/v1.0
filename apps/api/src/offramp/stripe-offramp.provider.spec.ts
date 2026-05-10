import { ConfigService } from '@nestjs/config';
import { StripeOfframpProvider } from './stripe-offramp.provider';
import type { StripeClient } from '../stripe/stripe.client';

describe('StripeOfframpProvider', () => {
  const mkConfig = (overrides: Record<string, string> = {}) =>
    ({
      get: (k: string) => overrides[k],
      getOrThrow: (k: string) => {
        const v = overrides[k];
        if (v === undefined) throw new Error(`missing ${k}`);
        return v;
      },
    }) as unknown as ConfigService;

  function dbMock(user: {
    id: string;
    email: string | null;
    stripeAccountId: string | null;
  }) {
    const where = jest.fn().mockResolvedValue(undefined);
    return {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            limit: jest.fn().mockResolvedValue([user]),
          })),
        })),
      })),
      update: jest.fn(() => ({
        set: jest.fn(() => ({ where })),
      })),
    };
  }

  it('creates Express connected accounts for hosted onboarding', async () => {
    const db = dbMock({
      id: 'user-1',
      email: 'user@example.test',
      stripeAccountId: null,
    });
    const accountsCreate = jest.fn().mockResolvedValue({ id: 'acct_123' });
    const provider = new StripeOfframpProvider(
      db as never,
      {
        stripe: { accounts: { create: accountsCreate } },
      } as unknown as StripeClient,
      mkConfig({ STRIPE_CONNECT_COUNTRY: 'US' }),
    );

    await expect(provider.getOrCreateConnectedAccount('user-1')).resolves.toBe(
      'acct_123',
    );
    expect(accountsCreate).toHaveBeenCalledWith({
      type: 'express',
      capabilities: {
        transfers: { requested: true },
      },
      country: 'US',
      email: 'user@example.test',
      metadata: { userId: 'user-1', app: 'mcbuse' },
    });
  });

  it('creates onboarding links for existing accounts', async () => {
    const accountLinksCreate = jest.fn().mockResolvedValue({
      url: 'https://connect.stripe.com/setup/s/acct_123',
      expires_at: 123456,
    });
    const provider = new StripeOfframpProvider(
      dbMock({
        id: 'user-1',
        email: 'user@example.test',
        stripeAccountId: 'acct_123',
      }) as never,
      {
        stripe: { accountLinks: { create: accountLinksCreate } },
      } as unknown as StripeClient,
      mkConfig({
        STRIPE_CONNECT_REFRESH_URL: 'mcbuse://offramp/connect/refresh',
        STRIPE_CONNECT_RETURN_URL: 'mcbuse://offramp/connect/return',
      }),
    );

    await expect(provider.createOnboardingLink('user-1')).resolves.toEqual({
      url: 'https://connect.stripe.com/setup/s/acct_123',
      expiresAt: 123456,
    });
    expect(accountLinksCreate).toHaveBeenCalledWith({
      account: 'acct_123',
      refresh_url: 'mcbuse://offramp/connect/refresh',
      return_url: 'mcbuse://offramp/connect/return',
      type: 'account_onboarding',
    });
  });
});
