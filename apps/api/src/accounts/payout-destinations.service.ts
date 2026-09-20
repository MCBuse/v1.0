import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import Stripe from 'stripe';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { StripeClient } from '../stripe/stripe.client';

/** Inferred from the SDK so the shape tracks whichever Stripe version is installed. */
type ExternalAccountEntry = Awaited<
  ReturnType<Stripe.Stripe['accounts']['listExternalAccounts']>
>['data'][number];

export interface PayoutDestination {
  id: string;
  kind: 'bank_account' | 'card';
  label: string;
  last4: string | null;
  currency: string | null;
  /** What Stripe says this destination supports right now. */
  payoutMethods: string[];
  eligible: boolean;
  /** Present when the destination cannot be used, in plain words. */
  ineligibleReason: string | null;
  isDefault: boolean;
}

export interface PayoutCapability {
  connected: boolean;
  accountId: string | null;
  payoutsEnabled: boolean;
  onboardingComplete: boolean;
  /** Stripe requirement ids still outstanding, if any. */
  requirementsDue: string[];
  availableBalanceCents: string | null;
  instantAvailableCents: string | null;
  destinations: PayoutDestination[];
  problems: string[];
}

/**
 * Reads real payout capability from Stripe.
 *
 * Incomplete onboarding, an ineligible destination and an empty provider
 * balance are all genuine states that this reports as they are. None of them is
 * papered over with a simulated success.
 */
@Injectable()
export class PayoutDestinationsService {
  private readonly logger = new Logger(PayoutDestinationsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly stripeClient: StripeClient,
  ) {}

  private get stripe(): Stripe.Stripe {
    return this.stripeClient.stripe;
  }

  async capability(userId: string): Promise<PayoutCapability> {
    const [user] = await this.db
      .select({ stripeAccountId: schema.users.stripeAccountId })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user?.stripeAccountId) {
      return {
        connected: false,
        accountId: null,
        payoutsEnabled: false,
        onboardingComplete: false,
        requirementsDue: [],
        availableBalanceCents: null,
        instantAvailableCents: null,
        destinations: [],
        problems: [
          'No payout account is connected yet. Connect one before withdrawing.',
        ],
      };
    }

    const accountId = user.stripeAccountId;
    const problems: string[] = [];

    const account = await this.stripe.accounts.retrieve(accountId);
    const requirementsDue = account.requirements?.currently_due ?? [];
    const payoutsEnabled = account.payouts_enabled ?? false;
    const onboardingComplete = requirementsDue.length === 0;

    if (!payoutsEnabled) {
      problems.push('Stripe has not enabled payouts for this account yet.');
    }
    if (!onboardingComplete) {
      problems.push(`Stripe still needs: ${requirementsDue.join(', ')}.`);
    }

    const externalAccounts = await this.stripe.accounts.listExternalAccounts(
      accountId,
      { limit: 20 },
    );

    const destinations = externalAccounts.data.map((entry) =>
      this.toDestination(entry, payoutsEnabled),
    );
    if (destinations.length === 0) {
      problems.push('No payout destination has been added to this account.');
    } else if (!destinations.some((d) => d.eligible)) {
      problems.push(
        'No connected destination is currently eligible for payouts.',
      );
    }

    let availableBalanceCents: string | null = null;
    let instantAvailableCents: string | null = null;
    try {
      const balance = await this.stripe.balance.retrieve(undefined, {
        stripeAccount: accountId,
      });
      availableBalanceCents = String(
        balance.available.find((b) => b.currency === 'usd')?.amount ?? 0,
      );
      instantAvailableCents = String(
        balance.instant_available?.find((b) => b.currency === 'usd')?.amount ??
          0,
      );
    } catch (error) {
      this.logger.warn(
        `Could not read Stripe balance for ${accountId}: ${(error as Error).message}`,
      );
      problems.push('The provider balance could not be read.');
    }

    return {
      connected: true,
      accountId,
      payoutsEnabled,
      onboardingComplete,
      requirementsDue,
      availableBalanceCents,
      instantAvailableCents,
      destinations,
      problems,
    };
  }

  /** Resolves a destination and explains precisely why it cannot be used. */
  async requireEligible(
    userId: string,
    destinationId: string,
  ): Promise<{
    accountId: string;
    destination: PayoutDestination;
    method: 'standard' | 'instant';
  }> {
    const capability = await this.capability(userId);
    if (!capability.connected || !capability.accountId) {
      throw new Error('No payout account is connected');
    }

    const destination = capability.destinations.find(
      (entry) => entry.id === destinationId,
    );
    if (!destination) {
      throw new Error('That payout destination does not exist on this account');
    }
    if (!destination.eligible) {
      throw new Error(
        destination.ineligibleReason ??
          'That payout destination is not eligible for payouts',
      );
    }

    // A card destination can only be paid instantly; a bank account uses the
    // standard rail unless instant is explicitly supported.
    const method =
      destination.kind === 'card'
        ? 'instant'
        : destination.payoutMethods.includes('standard')
          ? 'standard'
          : 'instant';

    return { accountId: capability.accountId, destination, method };
  }

  private toDestination(
    entry: ExternalAccountEntry,
    payoutsEnabled: boolean,
  ): PayoutDestination {
    const isCard = entry.object === 'card';
    const bank = entry as Extract<
      ExternalAccountEntry,
      { object: 'bank_account' }
    >;
    const card = entry as Extract<ExternalAccountEntry, { object: 'card' }>;

    const payoutMethods =
      (entry as { available_payout_methods?: string[] })
        .available_payout_methods ?? [];

    let ineligibleReason: string | null = null;
    if (!payoutsEnabled) {
      ineligibleReason = 'Payouts are not enabled on this account yet.';
    } else if (payoutMethods.length === 0) {
      ineligibleReason =
        'Stripe reports no payout method for this destination.';
    } else if (isCard && card.funding !== 'debit') {
      ineligibleReason = 'Only debit cards can receive payouts.';
    }

    return {
      id: entry.id,
      kind: isCard ? 'card' : 'bank_account',
      label: isCard
        ? `${card.brand ?? 'Card'} ${card.funding ?? ''}`.trim()
        : (bank.bank_name ?? 'Bank account'),
      last4: isCard ? (card.last4 ?? null) : (bank.last4 ?? null),
      currency: (entry as { currency?: string }).currency ?? null,
      payoutMethods,
      eligible: ineligibleReason === null,
      ineligibleReason,
      isDefault:
        (entry as { default_for_currency?: boolean }).default_for_currency ??
        false,
    };
  }
}
