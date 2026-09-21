import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
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
 * How long a worker holds an operation before another may take it over.
 *
 * Long enough that a slow chain submission finishes inside it; short enough
 * that an instance killed mid-step does not strand the operation for long.
 */
const CLAIM_LEASE_MS = 120_000;

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
  /** Identifies this instance's claims; every process gets its own. */
  private readonly workerId = randomUUID();

  constructor(
    private readonly operations: FinancialOperationsService,
    private readonly funding: AccountFundingService,
    private readonly transfers: AccountTransferService,
    private readonly withdrawals: AccountWithdrawalService,
    private readonly treasury: TreasuryService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (this.config.get<string>('PROCESS_ROLE') !== 'operations-daemon') {
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
        if (Date.now() - operation.updatedAt.getTime() >= 600_000) this.logger.warn(`Financial recovery needs attention: ${operation.id} (${operation.status})`);
        try {
          if (await this.stepExclusively(operation)) handled += 1;
        } catch (error) {
          this.logger.error(
            `Operation ${operation.id} (${operation.kind}/${operation.status}) failed to advance: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          // Back off rather than spinning on the same failure.
          await this.operations.deferNextAttempt(operation.id, Math.min(300_000, 15_000 * 2 ** Math.min(operation.attempts, 5)));
        }
      }
    } finally {
      this.running = false;
    }
    return handled;
  }

  /**
   * Steps an operation only if this worker can take an exclusive lease on it.
   *
   * Every caller that might run concurrently with the sweep — the sweep itself
   * and the post-webhook nudge — goes through here. `step` stays available
   * unguarded for tests that drive one operation deliberately.
   */
  async stepExclusively(operation: FinancialOperation): Promise<boolean> {
    const claimed = await this.operations.claim(
      operation.id,
      this.workerId,
      CLAIM_LEASE_MS,
    );
    if (!claimed) return false;

    const heartbeat = setInterval(() => void this.operations.renew(operation.id, this.workerId, CLAIM_LEASE_MS).catch(() => undefined), 30_000);
    try {
      await this.step(claimed);
      return true;
    } finally {
      clearInterval(heartbeat);
      await this.operations
        .release(operation.id, this.workerId)
        .catch(() => undefined);
    }
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
        return operation.kind.startsWith('funding_') ? this.funding.refundFunding(operation) : this.withdrawals.completeCompensation(operation);
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
    await this.funding.ensureCheckout(operation);
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
        await this.operations.beginCompensation(operation.id, 'chain_transfer_failed');
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
    await this.operations.releaseBalanceAndEnd(operation, 'failed', 'chain_transfer_failed');
  }
}
