import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StripeClient } from '../stripe/stripe.client';
import { TreasuryService } from '../treasury/treasury.service';
import {
  FinancialOperationsService,
  type FinancialOperation,
} from '../financial-operations/financial-operations.service';
import { OperationLedgerService } from '../financial-operations/operation-ledger.service';
import { usdCentsToUsdcBaseUnits } from '../financial-operations/operation-money';
import { AccountWalletsService } from './account-wallets.service';

export type FundingMethod = 'card' | 'bank';

const STRIPE_PAYMENT_METHOD: Record<FundingMethod, string> = {
  card: 'card',
  bank: 'us_bank_account',
};

const OPERATION_KIND: Record<FundingMethod, 'funding_card' | 'funding_bank'> = {
  card: 'funding_card',
  bank: 'funding_bank',
};

/**
 * Adds money to the Holding account.
 *
 * Two things happen, and the plan is explicit that they must not be conflated:
 * Stripe collects fiat in its sandbox, and *separately* the devnet treasury
 * delivers the matching test USDC. A completed Checkout is not settlement. The
 * balance only moves once the treasury transfer is confirmed on chain.
 *
 * Bank funding is asynchronous. A browser redirect proves the customer finished
 * the form, nothing more; ACH can still fail days later.
 */
@Injectable()
export class AccountFundingService {
  private readonly logger = new Logger(AccountFundingService.name);

  constructor(
    private readonly stripeClient: StripeClient,
    private readonly config: ConfigService,
    private readonly treasury: TreasuryService,
    private readonly operations: FinancialOperationsService,
    private readonly ledger: OperationLedgerService,
    private readonly wallets: AccountWalletsService,
  ) {}

  private get stripe() {
    return this.stripeClient.stripe;
  }

  /**
   * Creates the operation and the hosted Checkout session that funds it.
   * Returns the existing session on a replay rather than charging twice.
   */
  async startFunding(params: {
    userId: string;
    method: FundingMethod;
    amountCents: bigint;
    idempotencyKey: string;
    successUrl?: string;
    cancelUrl?: string;
  }): Promise<{
    operationId: string;
    status: string;
    checkoutUrl: string | null;
    amountCents: string;
    method: FundingMethod;
    replayed: boolean;
  }> {
    if (params.amountCents <= 0n) {
      throw new BadRequestException('Amount must be positive');
    }

    const holding = await this.wallets.forUser(params.userId, 'holding');
    const amountBaseUnits = usdCentsToUsdcBaseUnits(params.amountCents);

    // Refuse up front when the treasury cannot deliver the tokens. Taking a
    // test payment we cannot back would be exactly the simulated success the
    // plan forbids.
    const readiness = await this.treasury.readiness(amountBaseUnits);
    if (!readiness.configured || !readiness.canPayFees || !readiness.canCover) {
      throw new ServiceUnavailableException(
        `Funding is unavailable: ${readiness.problems.join('; ')}`,
      );
    }

    const { operation, replayed } = await this.operations.begin({
      userId: params.userId,
      kind: OPERATION_KIND[params.method],
      idempotencyKey: params.idempotencyKey,
      amountBaseUnits,
      currency: 'USDC',
      destinationWalletId: holding.id,
      displayAmountMinor: params.amountCents,
      displayCurrency: 'USD',
      provider: 'stripe',
      metadata: { method: params.method },
    });

    if (replayed) {
      return {
        operationId: operation.id,
        status: operation.status,
        checkoutUrl:
          (operation.metadata as { checkoutUrl?: string } | null)
            ?.checkoutUrl ?? null,
        amountCents: params.amountCents.toString(),
        method: params.method,
        replayed: true,
      };
    }

    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: [STRIPE_PAYMENT_METHOD[params.method]] as Array<
          'card' | 'us_bank_account'
        >,
        success_url:
          params.successUrl ??
          this.config.get<string>('STRIPE_CHECKOUT_SUCCESS_URL') ??
          'https://merchant.mcbuse.com/payment?funded=1',
        cancel_url:
          params.cancelUrl ??
          this.config.get<string>('STRIPE_CHECKOUT_CANCEL_URL') ??
          'https://merchant.mcbuse.com/payment?cancelled=1',
        client_reference_id: operation.id,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: Number(params.amountCents),
              product_data: { name: 'MCBuse Holding account top-up' },
            },
          },
        ],
        metadata: {
          operationId: operation.id,
          userId: params.userId,
          walletId: holding.id,
        },
      },
      // Stripe's own idempotency, so a retried create returns the same session.
      { idempotencyKey: `funding:${operation.id}` },
    );

    await this.operations.advance(
      operation.id,
      'collection_pending',
      {
        providerRef: session.id,
        providerStatus: session.status ?? 'open',
        metadata: {
          method: params.method,
          checkoutUrl: session.url,
          paymentMethod: STRIPE_PAYMENT_METHOD[params.method],
        },
      },
      { checkoutSessionId: session.id },
    );

    return {
      operationId: operation.id,
      status: 'collection_pending',
      checkoutUrl: session.url,
      amountCents: params.amountCents.toString(),
      method: params.method,
      replayed: false,
    };
  }

  /**
   * Applies a Stripe Checkout event. Only a genuinely paid session advances the
   * operation; `checkout.session.completed` for an ACH payment means the debit
   * was submitted, not that it succeeded.
   */
  async applyCheckoutEvent(params: {
    sessionId: string;
    eventType: string;
    paymentStatus: string | null;
  }): Promise<{ handled: boolean; operationId?: string }> {
    const operation = await this.operations.findByProviderRef(params.sessionId);
    if (!operation) return { handled: false };

    if (params.eventType === 'checkout.session.async_payment_failed') {
      if (operation.status === 'collection_pending') {
        await this.operations.fail(
          operation.id,
          'collection_failed',
          'Stripe reported the bank debit failed',
        );
      }
      return { handled: true, operationId: operation.id };
    }

    if (params.eventType === 'checkout.session.expired') {
      if (operation.status === 'collection_pending') {
        await this.operations.fail(operation.id, 'collection_expired');
      }
      return { handled: true, operationId: operation.id };
    }

    const paid = params.paymentStatus === 'paid';
    if (!paid) {
      // Submitted but not settled: record it and keep waiting.
      await this.operations.note(operation.id, 'collection_update', {
        eventType: params.eventType,
        paymentStatus: params.paymentStatus,
      });
      return { handled: true, operationId: operation.id };
    }

    if (operation.status === 'collection_pending') {
      await this.operations.advance(
        operation.id,
        'collection_settled',
        {
          providerStatus: params.paymentStatus,
          collectionSettledAt: new Date(),
          nextAttemptAt: new Date(),
        },
        { eventType: params.eventType },
      );
    }

    return { handled: true, operationId: operation.id };
  }

  /**
   * Delivers the tokens a settled collection is owed. Safe to call repeatedly:
   * it only acts on the step the operation is actually at.
   */
  async deliverTokens(stale: FinancialOperation): Promise<void> {
    // Always work from the stored status: a caller may be holding a snapshot
    // taken before another worker moved this operation on.
    const operation = await this.operations.require(stale.id);
    if (operation.status !== 'collection_settled') return;
    if (!operation.destinationWalletId) {
      throw new Error(`Funding operation ${operation.id} has no destination`);
    }

    const destination = await this.wallets.addressOf(
      operation.destinationWalletId,
    );

    const result = await this.treasury.sendUsdcTo(
      destination,
      operation.amountBaseUnits,
      {
        // Persist the signature before the transaction is broadcast, so an
        // interrupted process looks it up instead of sending a second one.
        onSignaturePrepared: async (signature) => {
          await this.operations.advance(
            operation.id,
            'chain_submitted',
            {
              chainSignature: signature,
              chainStatus: 'prepared',
              chainSubmittedAt: new Date(),
            },
            { signature },
          );
        },
        onSubmitted: async (signature) => {
          await this.operations.note(operation.id, 'chain_broadcast', {
            signature,
          });
        },
      },
    );

    if (result.status === 'failed') {
      const current = await this.operations.require(operation.id);
      if (current.status === 'chain_submitted') {
        await this.operations.fail(
          operation.id,
          'treasury_transfer_failed',
          'The treasury transfer did not reach the chain',
        );
      }
      return;
    }

    if (result.status === 'pending') {
      // Outcome unknown. Leave it for recovery to check the signature.
      await this.operations.deferNextAttempt(operation.id, 15_000);
      return;
    }

    await this.operations.advance(
      operation.id,
      'chain_confirmed',
      { chainStatus: 'finalized', chainConfirmedAt: new Date() },
      { signature: result.signature },
    );
  }

  /** Credits the Holding balance, exactly once, after the chain confirmed. */
  async finalize(stale: FinancialOperation): Promise<void> {
    const operation = await this.operations.require(stale.id);
    if (operation.status !== 'chain_confirmed') return;
    if (!operation.destinationWalletId) {
      throw new Error(`Funding operation ${operation.id} has no destination`);
    }

    const ledgerEntryId = await this.ledger.transaction(async (tx) => {
      const recorded = await this.ledger.recordOnce(tx, {
        operationId: operation.id,
        // A top-up has no internal counterparty: the tokens arrive from the
        // treasury, so both sides reference the funded wallet and the entry is
        // typed as an on-ramp rather than a transfer between accounts.
        debitWalletId: operation.destinationWalletId!,
        creditWalletId: operation.destinationWalletId!,
        amount: operation.amountBaseUnits,
        currency: operation.currency,
        type: 'on_ramp',
        chainSignature: operation.chainSignature,
        metadata: {
          source: 'stripe_funding',
          method: (operation.metadata as { method?: string } | null)?.method,
          providerRef: operation.providerRef,
        },
      });

      if (recorded.created) {
        await this.ledger.credit(
          tx,
          operation.destinationWalletId!,
          operation.currency,
          operation.amountBaseUnits,
        );
      }
      return recorded.ledgerEntryId;
    });

    await this.operations.advance(
      operation.id,
      'finalized',
      { ledgerEntryId, finalizedAt: new Date(), nextAttemptAt: null },
      { ledgerEntryId },
    );

    this.logger.log(
      `Funding ${operation.id} finalized: ${operation.amountBaseUnits} base units credited`,
    );
  }

  /** Re-reads a pending Checkout session when a webhook never arrived. */
  async pollCollection(operation: FinancialOperation): Promise<void> {
    if (!operation.providerRef) return;
    const session = await this.stripe.checkout.sessions.retrieve(
      operation.providerRef,
    );
    await this.applyCheckoutEvent({
      sessionId: session.id,
      eventType: 'polled',
      paymentStatus: session.payment_status ?? null,
    });
  }
}
