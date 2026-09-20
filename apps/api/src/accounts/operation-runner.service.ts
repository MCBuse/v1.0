import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TreasuryService } from '../treasury/treasury.service';
import {
  FinancialOperationsService,
  type FinancialOperation,
} from '../financial-operations/financial-operations.service';
import { AccountFundingService } from './account-funding.service';
import { AccountTransferService } from './account-transfer.service';
import { AccountWithdrawalService } from './account-withdrawal.service';

const POLL_INTERVAL_MS = 15_000;
const STARTUP_DELAY_MS = 5_000;

/**
 * Drives every in-flight operation to its next step.
 *
 * This is what makes a restart survivable. Each operation's stored status says
 * what has actually been confirmed, and the resume action for that status says
 * what is safe to do next — which, for a submitted chain transfer, is only ever
 * to check the signature we already have.
 */
@Injectable()
export class OperationRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OperationRunnerService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly operations: FinancialOperationsService,
    private readonly funding: AccountFundingService,
    private readonly transfers: AccountTransferService,
    private readonly withdrawals: AccountWithdrawalService,
    private readonly treasury: TreasuryService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (this.config.get<string>('OPERATION_RUNNER_ENABLED') === 'false') {
      this.logger.warn(
        'Operation recovery runner is disabled by configuration',
      );
      return;
    }
    setTimeout(() => void this.tick(), STARTUP_DELAY_MS);
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass over everything due. Public so tests can drive it directly. */
  async tick(limit = 25): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let handled = 0;
    try {
      const due = await this.operations.due(limit);
      for (const operation of due) {
        try {
          await this.step(operation);
          handled += 1;
        } catch (error) {
          this.logger.error(
            `Operation ${operation.id} (${operation.kind}/${operation.status}) failed to advance: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          // Back off rather than spinning on the same failure.
          await this.operations.deferNextAttempt(operation.id, 60_000);
        }
      }
    } finally {
      this.running = false;
    }
    return handled;
  }

  async step(operation: FinancialOperation): Promise<void> {
    const action = this.operations.actionFor(operation);
    switch (action) {
      case 'start':
        return this.start(operation);
      case 'poll_collection':
        return this.funding.pollCollection(operation);
      case 'submit_chain':
        return this.submitChain(operation);
      case 'check_chain':
        return this.checkChain(operation);
      case 'submit_payout':
        return this.withdrawals.submitPayout(operation);
      case 'poll_payout':
        return this.withdrawals.pollPayout(operation);
      case 'finalize':
        return this.finalize(operation);
      case 'complete_compensation':
        return this.withdrawals.completeCompensation(operation);
      case 'none':
        return;
    }
  }

  private async start(operation: FinancialOperation): Promise<void> {
    if (
      operation.kind === 'internal_transfer' ||
      operation.kind === 'merchant_dayend'
    ) {
      return this.transfers.reserve(operation);
    }
    if (
      operation.kind === 'withdrawal_bank' ||
      operation.kind === 'withdrawal_card'
    ) {
      return this.withdrawals.reserve(operation);
    }
    // A funding operation with no Checkout session was never usable.
    await this.operations.fail(operation.id, 'never_started');
  }

  private async submitChain(operation: FinancialOperation): Promise<void> {
    switch (operation.kind) {
      case 'funding_card':
      case 'funding_bank':
        return this.funding.deliverTokens(operation);
      case 'internal_transfer':
      case 'merchant_dayend':
        return this.transfers.submitChainTransfer(operation);
      case 'withdrawal_bank':
      case 'withdrawal_card':
        return this.withdrawals.returnTokensToTreasury(operation);
      default:
        return;
    }
  }

  /**
   * The recovery path that matters most: a transfer was broadcast but we never
   * saw the outcome. We look the signature up. We never send another.
   */
  private async checkChain(operation: FinancialOperation): Promise<void> {
    if (!operation.chainSignature) {
      // Submitted status with no signature should not happen; treat it as
      // unresolved rather than assuming either outcome.
      await this.operations.deferNextAttempt(operation.id, 60_000);
      return;
    }

    const status = await this.treasury.statusOf(operation.chainSignature);

    if (status === 'pending') {
      await this.operations.deferNextAttempt(operation.id, 15_000);
      return;
    }

    if (status === 'failed') {
      await this.operations.note(operation.id, 'chain_failed', {
        signature: operation.chainSignature,
      });
      // Nothing moved, so the reservation can be released and the operation
      // failed outright.
      if (
        operation.kind === 'internal_transfer' ||
        operation.kind === 'merchant_dayend' ||
        operation.kind === 'withdrawal_bank' ||
        operation.kind === 'withdrawal_card'
      ) {
        await this.releaseReservationAndFail(operation);
      } else {
        await this.operations.fail(operation.id, 'chain_transfer_failed');
      }
      return;
    }

    await this.operations.advance(
      operation.id,
      'chain_confirmed',
      {
        chainStatus: 'finalized',
        chainConfirmedAt: new Date(),
        nextAttemptAt: new Date(),
      },
      { signature: operation.chainSignature, recovered: true },
    );
  }

  private async finalize(operation: FinancialOperation): Promise<void> {
    switch (operation.kind) {
      case 'funding_card':
      case 'funding_bank':
        return this.funding.finalize(operation);
      case 'internal_transfer':
      case 'merchant_dayend':
        return this.transfers.finalize(operation);
      case 'withdrawal_bank':
      case 'withdrawal_card':
        return this.withdrawals.finalize(operation);
      default:
        return;
    }
  }

  private async releaseReservationAndFail(
    operation: FinancialOperation,
  ): Promise<void> {
    if (
      operation.kind === 'withdrawal_bank' ||
      operation.kind === 'withdrawal_card'
    ) {
      await this.withdrawals.releaseReservation(operation);
    } else {
      await this.transfers.releaseReservation(operation);
    }
    await this.operations.fail(operation.id, 'chain_transfer_failed');
  }
}
