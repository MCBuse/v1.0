import { Injectable, Logger } from '@nestjs/common';
import { ProviderWebhookService } from '../financial-operations/provider-webhook.service';
import { FinancialOperationsService } from '../financial-operations/financial-operations.service';
import { AccountFundingService } from './account-funding.service';
import { AccountWithdrawalService } from './account-withdrawal.service';
import { OperationRunnerService } from './operation-runner.service';

const CHECKOUT_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
]);

const PAYOUT_EVENTS = new Set([
  'payout.paid',
  'payout.failed',
  'payout.canceled',
  'payout.updated',
]);

interface StripeEventShape {
  id?: unknown;
  type?: unknown;
  created?: unknown;
  data?: { object?: Record<string, unknown> };
}

/**
 * Routes Stripe events to the account flows.
 *
 * Every event is persisted before it is acted on, so a redelivery is
 * recognised rather than replayed. After a state change the runner is nudged
 * immediately, which is what makes funding feel instant without the operation
 * ever depending on a webhook arriving.
 */
@Injectable()
export class AccountsWebhookService {
  private readonly logger = new Logger(AccountsWebhookService.name);

  constructor(
    private readonly webhooks: ProviderWebhookService,
    private readonly funding: AccountFundingService,
    private readonly withdrawals: AccountWithdrawalService,
    private readonly operations: FinancialOperationsService,
    private readonly runner: OperationRunnerService,
  ) {}

  /** True when this event belongs to an account flow rather than the legacy ramps. */
  handles(eventType: string): boolean {
    return CHECKOUT_EVENTS.has(eventType) || PAYOUT_EVENTS.has(eventType);
  }

  async handleStripeEvent(
    payload: unknown,
    rawBody: string,
  ): Promise<{ handled: boolean; reason?: string }> {
    const event = payload as StripeEventShape;
    const id = typeof event.id === 'string' ? event.id : null;
    const type = typeof event.type === 'string' ? event.type : null;
    if (!id || !type) return { handled: false, reason: 'malformed_event' };
    if (!this.handles(type))
      return { handled: false, reason: 'not_an_account_event' };

    const createdAt =
      typeof event.created === 'number' ? new Date(event.created * 1000) : null;

    const claim = await this.webhooks.claim({
      id,
      provider: 'stripe',
      type,
      payload: rawBody,
      createdAt,
    });

    if (!claim.shouldProcess) {
      return {
        handled: true,
        reason: claim.conflicting ? 'conflicting_redelivery' : 'duplicate',
      };
    }

    try {
      const object = event.data?.object ?? {};
      const operationId = CHECKOUT_EVENTS.has(type)
        ? await this.applyCheckout(type, object)
        : await this.applyPayout(type, object);

      await this.webhooks.markProcessed(id);

      // Drive the operation forward now rather than waiting for the next sweep.
      if (operationId) {
        const operation = await this.operations.require(operationId);
        await this.runner.step(operation).catch((error: unknown) => {
          this.logger.warn(
            `Post-webhook step for ${operationId} deferred: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
      }

      return { handled: true };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.webhooks.markFailed(id, detail);
      throw error;
    }
  }

  private async applyCheckout(
    type: string,
    object: Record<string, unknown>,
  ): Promise<string | undefined> {
    const sessionId = typeof object.id === 'string' ? object.id : null;
    if (!sessionId) return undefined;
    const paymentStatus =
      typeof object.payment_status === 'string' ? object.payment_status : null;

    const result = await this.funding.applyCheckoutEvent({
      sessionId,
      eventType: type,
      paymentStatus,
    });
    return result.operationId;
  }

  private async applyPayout(
    type: string,
    object: Record<string, unknown>,
  ): Promise<string | undefined> {
    const payoutId = typeof object.id === 'string' ? object.id : null;
    if (!payoutId) return undefined;
    const status =
      typeof object.status === 'string' ? object.status : 'unknown';
    const failureMessage =
      typeof object.failure_message === 'string'
        ? object.failure_message
        : null;

    const result = await this.withdrawals.applyPayoutEvent({
      payoutId,
      eventType: type,
      status,
      failureMessage,
    });
    return result.operationId;
  }
}
