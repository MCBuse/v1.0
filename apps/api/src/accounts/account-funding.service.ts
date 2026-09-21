import { randomUUID } from 'crypto';
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
import { MoneyAuditService } from '../financial-operations/money-audit.service';
import { usdCentsToUsdcBaseUnits } from '../financial-operations/operation-money';
import { AccountWalletsService } from './account-wallets.service';

export type FundingMethod = 'card' | 'bank';

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
    private readonly audit: MoneyAuditService,
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
    if (params.amountCents <= 0n || params.amountCents > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new BadRequestException('Amount must be positive');
    }

    const holding = await this.wallets.forUser(params.userId, 'holding');
    const amountBaseUnits = usdCentsToUsdcBaseUnits(params.amountCents);

    const prior = await this.operations.findByKey(params.userId, params.idempotencyKey);
    if (!prior) {
      const readiness = await this.treasury.readiness(amountBaseUnits);
      if (!readiness.configured || !readiness.canPayFees || !readiness.canCover) throw new ServiceUnavailableException('Funding is temporarily unavailable');
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
      metadata: { method: params.method, paymentConfiguration: this.config.get<string>(params.method === 'card' ? 'STRIPE_CARD_PAYMENT_CONFIGURATION' : 'STRIPE_BANK_PAYMENT_CONFIGURATION'), successUrl: params.successUrl ?? this.config.get<string>('STRIPE_CHECKOUT_SUCCESS_URL') ?? 'https://merchant.mcbuse.com/payment?funded=1', cancelUrl: params.cancelUrl ?? this.config.get<string>('STRIPE_CHECKOUT_CANCEL_URL') ?? 'https://merchant.mcbuse.com/payment?cancelled=1' },
    });

    if (!replayed) await this.audit.authorization({ userId: params.userId, operationKind: operation.kind, decision: 'granted', subjectType: 'wallet', subjectId: holding.id, operationId: operation.id, amountBaseUnits, currency: 'USDC' });
    // Only the lease owner may create/recover the provider session.
    const worker = `checkout:${randomUUID()}`;
    const claimed = await this.operations.claim(operation.id, worker, 120_000);
    if (claimed) {
      const heartbeat = setInterval(() => void this.operations.renew(operation.id, worker, 120_000).catch(() => undefined), 30_000);
      try { await this.ensureCheckout(claimed); }
      finally { clearInterval(heartbeat); await this.operations.release(operation.id, worker); }
    }
    const current = await this.operations.require(operation.id);
    return {
      operationId: current.id, status: current.status,
      checkoutUrl: (current.metadata as { checkoutUrl?: string } | null)?.checkoutUrl ?? null,
      amountCents: params.amountCents.toString(), method: params.method, replayed,
    };
  }

  async ensureCheckout(operation: FinancialOperation): Promise<void> {
    if (operation.status !== 'created') return;
    const metadata = operation.metadata as { method: FundingMethod; paymentConfiguration?: string; successUrl: string; cancelUrl: string };
    // Stripe can prune idempotency results after 24h. Never guess whether an old create succeeded.
    if (Date.now() - operation.createdAt.getTime() >= 23 * 60 * 60 * 1000) {
      await this.operations.note(operation.id, 'operator_attention', { reason: 'checkout_recovery_window_expired' });
      await this.operations.deferNextAttempt(operation.id, 300_000);
      return;
    }
    const params = { method: metadata.method, userId: operation.userId, amountCents: operation.displayAmountMinor!, successUrl: metadata.successUrl, cancelUrl: metadata.cancelUrl };
    const holding = { id: operation.destinationWalletId! };
    if (!metadata.paymentConfiguration) throw new ServiceUnavailableException('Funding payment configuration is unavailable');
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_configuration: metadata.paymentConfiguration,
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
          ...(operation.metadata as Record<string, unknown>),
          method: params.method,
          checkoutUrl: session.url,
          paymentMethod: params.method === 'card' ? 'card' : 'us_bank_account',
        },
      },
      { checkoutSessionId: session.id },
    );

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
    const session = await this.stripe.checkout.sessions.retrieve(params.sessionId);
    let operation = await this.operations.findByProviderRef(params.sessionId);
    if (!operation && session.metadata?.operationId) {
      operation = await this.operations.require(session.metadata.operationId);
    }
    if (!operation) return { handled: false };
    if (!['funding_card', 'funding_bank'].includes(operation.kind) || session.metadata?.operationId !== operation.id || session.metadata?.userId !== operation.userId || session.metadata?.walletId !== operation.destinationWalletId || session.amount_total !== Number(operation.displayAmountMinor) || session.currency !== 'usd' || session.livemode)
      throw new BadRequestException('Checkout does not match the sandbox funding operation');
    if (operation.providerRef && operation.providerRef !== session.id) throw new BadRequestException('Checkout reference mismatch');
    if (operation.status === 'created') {
      await this.operations.advance(operation.id, 'collection_pending', { providerRef: session.id, metadata: { ...(operation.metadata as Record<string, unknown>), checkoutUrl: session.url } });
      operation = await this.operations.require(operation.id);
    }
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    if (paymentIntentId) await this.operations.patchProvider(operation.id, { paymentIntentId });
    params.paymentStatus = session.payment_status;
    if (params.eventType === 'checkout.session.async_payment_failed' && session.payment_status !== 'paid') {
      if (operation.status === 'collection_pending') {
        await this.operations.fail(
          operation.id,
          'collection_failed',
          'Stripe reported the bank debit failed',
        );
      }
      return { handled: true, operationId: operation.id };
    }

    if (params.eventType === 'checkout.session.expired' && session.status === 'expired' && session.payment_status !== 'paid') {
      if (operation.status === 'collection_pending') {
        await this.operations.fail(operation.id, 'collection_expired');
      }
      return { handled: true, operationId: operation.id };
    }

    const paid = params.paymentStatus === 'paid';
    if (!paid) {
      // Submitted but not settled. Record it only when the provider status has
      // actually changed: polling every few seconds while a customer fills in
      // a card form must not fill the audit log with identical rows.
      if (params.paymentStatus !== operation.providerStatus) {
        await this.operations.note(operation.id, 'collection_update', {
          eventType: params.eventType,
          paymentStatus: params.paymentStatus,
        });
        await this.operations.updateProviderStatus(
          operation.id,
          params.paymentStatus,
        );
      }
      // Back off while we wait; a webhook will wake this up sooner if it lands.
      await this.operations.deferNextAttempt(operation.id, 30_000);
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
        intentKey: `operation:${operation.id}`,
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
          await this.audit.signature({
            userId: operation.userId,
            operationId: operation.id,
            operationKind: operation.kind,
            // The treasury signs the delivery; the user's wallet only receives.
            walletId: operation.destinationWalletId!,
            walletAddress: destination,
            keyVersion: 'treasury',
            chainSignature: signature,
            amountBaseUnits: operation.amountBaseUnits,
            currency: operation.currency,
            feePayerAddress: this.treasury.address,
          });
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
        await this.operations.beginCompensation(operation.id, 'treasury_transfer_failed');
      } else {
        await this.operations.deferNextAttempt(operation.id, Math.min(300_000, 15_000 * 2 ** Math.min(operation.attempts, 5)));
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

  async refundFunding(stale: FinancialOperation): Promise<void> {
    const operation = await this.operations.require(stale.id);
    if (operation.status !== 'compensating') return;
    if (!operation.paymentIntentId) {
      await this.pollCollection(operation);
      await this.operations.deferNextAttempt(operation.id, 30_000);
      return;
    }
    // A compensation is legal only after definitive non-delivery. Recheck the saved signature.
    if (operation.chainSignature && await this.treasury.statusOf(operation.chainSignature) !== 'failed') {
      await this.operations.note(operation.id, 'operator_attention', { reason: 'refund_waiting_for_chain_resolution' });
      await this.operations.deferNextAttempt(operation.id, 60_000);
      return;
    }
    const intent = await this.stripe.paymentIntents.retrieve(operation.paymentIntentId, { expand: ['latest_charge'] });
    const charge = intent.latest_charge;
    if (!charge || typeof charge === 'string') throw new Error('Original charge unavailable');
    if (charge.disputed) {
      await this.operations.patchProvider(operation.id, { refundStatus: 'disputed' });
      await this.operations.deferNextAttempt(operation.id, 300_000);
      return;
    }
    let refund: Awaited<ReturnType<typeof this.stripe.refunds.list>>['data'][number] | null = operation.refundId ? await this.stripe.refunds.retrieve(operation.refundId) : null;
    if (!refund) {
      const existing = await this.stripe.refunds.list({ payment_intent: intent.id, limit: 100 });
      refund = existing.data.find(r => r.metadata?.operationId === operation.id) ?? null;
      if (!refund && (existing.data.length || charge.amount_refunded > 0)) {
        await this.operations.patchProvider(operation.id, { refundStatus: 'requires_reconciliation' });
        await this.operations.deferNextAttempt(operation.id, 300_000);
        return;
      }
      refund ??= await this.stripe.refunds.create({ payment_intent: intent.id, amount: Number(operation.displayAmountMinor), metadata: { operationId: operation.id } }, { idempotencyKey: `funding-refund:${operation.id}` });
    }
    await this.operations.patchProvider(operation.id, { refundId: refund.id, refundStatus: refund.status ?? 'pending' });
    if (refund.status === 'succeeded') await this.operations.completeCompensation(operation.id, { refundId: refund.id, reason: 'funding_refunded' });
    else await this.operations.deferNextAttempt(operation.id, 60_000);
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
