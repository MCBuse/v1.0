import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import Stripe from 'stripe';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { StripeClient } from '../stripe/stripe.client';
import type { NormalizedOfframpStatus } from './moonpay-offramp.types';

export interface NormalizedStripeOfframpEvent {
  status: NormalizedOfframpStatus;
  providerRawStatus: string;
  /** Stripe payout id */
  payoutId?: string;
  /** Stripe transfer id (used for transfer-level events) */
  transferId?: string;
  /** internalReference passed in metadata */
  internalReference?: string;
  /** Connect account id (used for `account.updated` events) */
  accountId?: string;
  payoutsEnabled?: boolean;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function asString(x: unknown): string | undefined {
  return typeof x === 'string' ? x : undefined;
}

function asBoolean(x: unknown): boolean | undefined {
  return typeof x === 'boolean' ? x : undefined;
}

function mapPayoutStatus(raw: string): NormalizedOfframpStatus {
  switch (raw) {
    case 'paid':
      return 'completed';
    case 'in_transit':
    case 'pending':
      return 'processing';
    case 'failed':
    case 'canceled':
      return 'failed';
    default:
      return 'processing';
  }
}

function stripeErrorMessage(err: unknown): string {
  if (err instanceof Stripe.errors.StripeError) {
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

type StripeAccount = Awaited<ReturnType<Stripe.Stripe['accounts']['create']>>;
type StripeAccountLink = Awaited<
  ReturnType<Stripe.Stripe['accountLinks']['create']>
>;

@Injectable()
export class StripeOfframpProvider {
  readonly providerName = 'stripe';
  private readonly logger = new Logger(StripeOfframpProvider.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly client: StripeClient,
    private readonly config: ConfigService,
  ) {}

  private get stripe(): Stripe.Stripe {
    return this.client.stripe;
  }

  async getOrCreateConnectedAccount(userId: string): Promise<string> {
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!user) throw new BadRequestException('User not found');
    if (user.stripeAccountId) return user.stripeAccountId;

    const country = (
      this.config.get<string>('STRIPE_CONNECT_COUNTRY') ?? 'US'
    ).toUpperCase();
    let account: StripeAccount;
    try {
      account = await this.stripe.accounts.create({
        type: 'express',
        capabilities: {
          transfers: { requested: true },
        },
        country,
        email: user.email ?? undefined,
        metadata: { userId, app: 'mcbuse' },
      });
    } catch (err) {
      const message = stripeErrorMessage(err);
      this.logger.error(
        `Stripe Connect account creation failed for user ${userId}: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      if (err instanceof Stripe.errors.StripeInvalidRequestError) {
        throw new BadRequestException(
          `Stripe Connect account creation failed: ${message}`,
        );
      }
      throw new BadGatewayException('Stripe Connect account creation failed');
    }

    await this.db
      .update(schema.users)
      .set({ stripeAccountId: account.id, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));

    this.logger.log(
      `Created Stripe Connect account ${account.id} for user ${userId}`,
    );
    return account.id;
  }

  async createOnboardingLink(
    userId: string,
  ): Promise<{ url: string; expiresAt: number }> {
    const accountId = await this.getOrCreateConnectedAccount(userId);
    const refreshUrl =
      this.config.get<string>('STRIPE_CONNECT_REFRESH_URL') ??
      'mcbuse://offramp/connect/refresh';
    const returnUrl =
      this.config.get<string>('STRIPE_CONNECT_RETURN_URL') ??
      'mcbuse://offramp/connect/return';
    let link: StripeAccountLink;
    try {
      link = await this.stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });
    } catch (err) {
      const message = stripeErrorMessage(err);
      this.logger.error(
        `Stripe Connect onboarding link creation failed for account ${accountId}: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      if (err instanceof Stripe.errors.StripeInvalidRequestError) {
        throw new BadRequestException(
          `Stripe Connect onboarding link creation failed: ${message}`,
        );
      }
      throw new BadGatewayException(
        'Stripe Connect onboarding link creation failed',
      );
    }
    return { url: link.url, expiresAt: link.expires_at };
  }

  async getAccountStatus(userId: string): Promise<{
    accountId: string | null;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    requirementsDue: string[];
  }> {
    const [user] = await this.db
      .select({ stripeAccountId: schema.users.stripeAccountId })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!user?.stripeAccountId) {
      return {
        accountId: null,
        payoutsEnabled: false,
        detailsSubmitted: false,
        requirementsDue: [],
      };
    }
    const account = await this.stripe.accounts.retrieve(user.stripeAccountId);
    return {
      accountId: account.id,
      payoutsEnabled: Boolean(account.payouts_enabled),
      detailsSubmitted: Boolean(account.details_submitted),
      requirementsDue: account.requirements?.currently_due ?? [],
    };
  }

  /**
   * Converts USDC base units (6 decimals) to fiat smallest-denomination amount (cents).
   * Uses 1 USDC = 1 USD by default. Override with STRIPE_OFFRAMP_USD_PER_USDC.
   */
  toFiatCents(cryptoBaseUnits: bigint, fiatCurrency: string): number {
    if (fiatCurrency.toUpperCase() !== 'USD') {
      throw new BadRequestException(
        'Stripe off-ramp currently supports USD only',
      );
    }
    const rateString =
      this.config.get<string>('STRIPE_OFFRAMP_USD_PER_USDC') ?? '1';
    const rate = Number(rateString);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new BadRequestException(
        `Invalid STRIPE_OFFRAMP_USD_PER_USDC: ${rateString}`,
      );
    }
    // 6 decimals → divide by 10_000 to scale to cents (10^6 / 10^2 = 10^4).
    const cents = (Number(cryptoBaseUnits) / 10_000) * rate;
    const rounded = Math.round(cents);
    if (!Number.isFinite(rounded) || rounded <= 0) {
      throw new BadRequestException('Computed payout amount is not positive');
    }
    return rounded;
  }

  async executeTransferAndPayout(params: {
    stripeAccountId: string;
    amountCents: number;
    currency: string;
    internalReference: string;
    transferGroup: string;
  }): Promise<{ transferId: string; payoutId: string }> {
    const transfer = await this.stripe.transfers.create({
      amount: params.amountCents,
      currency: params.currency.toLowerCase(),
      destination: params.stripeAccountId,
      transfer_group: params.transferGroup,
      metadata: { internalReference: params.internalReference },
    });

    const payout = await this.stripe.payouts.create(
      {
        amount: params.amountCents,
        currency: params.currency.toLowerCase(),
        metadata: {
          internalReference: params.internalReference,
          transferId: transfer.id,
        },
      },
      { stripeAccount: params.stripeAccountId },
    );

    return { transferId: transfer.id, payoutId: payout.id };
  }

  verifyWebhook(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      this.logger.error(
        'STRIPE_WEBHOOK_SECRET not set — rejecting Stripe webhook',
      );
      return false;
    }
    if (!signatureHeader) return false;
    try {
      this.stripe.webhooks.constructEvent(
        rawBody,
        signatureHeader,
        webhookSecret,
      );
      return true;
    } catch (err) {
      this.logger.warn(
        `Stripe webhook signature verification failed: ${(err as Error).message}`,
      );
      return false;
    }
  }

  isOfframpEvent(eventType: string): boolean {
    return (
      eventType.startsWith('payout.') ||
      eventType.startsWith('transfer.') ||
      eventType === 'account.updated'
    );
  }

  parseWebhook(payload: unknown): NormalizedStripeOfframpEvent {
    if (!isRecord(payload)) throw new Error('Invalid webhook payload');
    const eventType = asString(payload['type']) ?? 'unknown';
    const data = isRecord(payload['data'])
      ? payload['data']['object']
      : undefined;
    if (!isRecord(data))
      throw new Error('Invalid webhook payload: missing data.object');
    const id = asString(data['id']) ?? '';
    const metadata = isRecord(data['metadata']) ? data['metadata'] : undefined;
    const internalReference = metadata
      ? asString(metadata['internalReference'])
      : undefined;

    if (eventType.startsWith('payout.')) {
      const rawStatus =
        asString(data['status']) ?? eventType.split('.').pop() ?? 'unknown';
      return {
        status: mapPayoutStatus(rawStatus),
        providerRawStatus: rawStatus,
        payoutId: id,
        internalReference,
      };
    }

    if (eventType.startsWith('transfer.')) {
      const rawStatus =
        eventType === 'transfer.failed'
          ? 'failed'
          : (eventType.split('.').pop() ?? 'unknown');
      return {
        status: rawStatus === 'failed' ? 'failed' : 'processing',
        providerRawStatus: rawStatus,
        transferId: id,
        internalReference,
      };
    }

    if (eventType === 'account.updated') {
      return {
        status: 'processing',
        providerRawStatus: 'account_updated',
        accountId: id,
        payoutsEnabled: asBoolean(data['payouts_enabled']),
      };
    }

    throw new Error(`Unsupported Stripe offramp event type: ${eventType}`);
  }
}
