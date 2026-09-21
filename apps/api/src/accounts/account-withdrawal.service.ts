import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PublicKey } from '@solana/web3.js';
import Stripe from 'stripe';
import { SolanaService } from '../solana/solana.service';
import { sendSplTransfer } from '../solana/spl-transfer';
import { StripeClient } from '../stripe/stripe.client';
import { TreasuryService } from '../treasury/treasury.service';
import {
  FinancialOperationsService,
  type FinancialOperation,
} from '../financial-operations/financial-operations.service';
import { OperationLedgerService } from '../financial-operations/operation-ledger.service';
import { MoneyAuditService } from '../financial-operations/money-audit.service';
import {
  usdCentsToUsdcBaseUnits,
  usdcBaseUnitsToUsdCents,
} from '../financial-operations/operation-money';
import { AccountWalletsService } from './account-wallets.service';
import { PayoutDestinationsService } from './payout-destinations.service';

/**
 * Takes money out of the Holding account.
 *
 * The order matters and is the whole point: funds are reserved, the tokens are
 * returned to the treasury on devnet, and only then is a Stripe payout created.
 * If the payout fails after the tokens have already moved, the operation cannot
 * simply be marked failed — it goes through compensation, and the treasury
 * sends the tokens back before the balance is restored.
 */
@Injectable()
export class AccountWithdrawalService {
  private readonly logger = new Logger(AccountWithdrawalService.name);

  constructor(
    private readonly solana: SolanaService,
    private readonly config: ConfigService,
    private readonly stripeClient: StripeClient,
    private readonly treasury: TreasuryService,
    private readonly operations: FinancialOperationsService,
    private readonly ledger: OperationLedgerService,
    private readonly wallets: AccountWalletsService,
    private readonly destinations: PayoutDestinationsService,
    private readonly audit: MoneyAuditService,
  ) {}

  private get stripe(): Stripe.Stripe {
    return this.stripeClient.stripe;
  }

  async startWithdrawal(params: {
    userId: string;
    destinationId: string;
    amountCents: bigint;
    idempotencyKey: string;
  }): Promise<{
    operationId: string;
    status: string;
    amountCents: string;
    destinationId: string;
    replayed: boolean;
  }> {
    if (params.amountCents <= 0n) {
      throw new BadRequestException('Amount must be positive');
    }

    let eligible: Awaited<
      ReturnType<PayoutDestinationsService['requireEligible']>
    >;
    try {
      eligible = await this.destinations.requireEligible(
        params.userId,
        params.destinationId,
      );
    } catch (error) {
      await this.audit.authorization({
        userId: params.userId,
        operationKind: 'withdrawal',
        decision: 'refused',
        subjectType: 'payout_destination',
        subjectId: params.destinationId,
        reason: 'destination_ineligible',
        amountBaseUnits: usdCentsToUsdcBaseUnits(params.amountCents),
        currency: 'USDC',
      });
      // A real provider state, surfaced as one.
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Payout destination unavailable',
      );
    }

    const holding = await this.wallets.forUser(params.userId, 'holding');
    const amountBaseUnits = usdCentsToUsdcBaseUnits(params.amountCents);

    const { operation, replayed } = await this.operations.begin({
      userId: params.userId,
      kind:
        eligible.destination.kind === 'card'
          ? 'withdrawal_card'
          : 'withdrawal_bank',
      idempotencyKey: params.idempotencyKey,
      amountBaseUnits,
      currency: 'USDC',
      sourceWalletId: holding.id,
      displayAmountMinor: params.amountCents,
      displayCurrency: 'USD',
      provider: 'stripe',
      providerAccountId: eligible.accountId,
      providerDestinationId: params.destinationId,
      metadata: {
        payoutMethod: eligible.method,
        destinationKind: eligible.destination.kind,
        destinationLast4: eligible.destination.last4,
      },
    });

    if (!replayed) {
      await this.audit.authorization({
        userId: params.userId,
        operationKind: operation.kind,
        decision: 'granted',
        subjectType: 'payout_destination',
        subjectId: params.destinationId,
        operationId: operation.id,
        amountBaseUnits,
        currency: 'USDC',
      });
      await this.reserve(operation);
    }

    const current = await this.operations.require(operation.id);
    return {
      operationId: current.id,
      status: current.status,
      amountCents: params.amountCents.toString(),
      destinationId: params.destinationId,
      replayed,
    };
  }

  async reserve(stale: FinancialOperation): Promise<void> {
    const operation = await this.operations.require(stale.id);
    if (operation.status !== 'created') return;
    try {
      await this.ledger.transaction(async (tx) => {
        await this.ledger.reserve(
          tx,
          operation.sourceWalletId!,
          operation.currency,
          operation.amountBaseUnits,
        );
      });
    } catch (error) {
      await this.operations.fail(
        operation.id,
        'insufficient_funds',
        error instanceof Error ? error.message : undefined,
      );
      throw error;
    }
    await this.operations.advance(operation.id, 'reserved', {
      reservedAt: new Date(),
      nextAttemptAt: new Date(),
    });
  }

  /** Returns the tokens to the treasury before any fiat is promised. */
  async returnTokensToTreasury(stale: FinancialOperation): Promise<void> {
    const operation = await this.operations.require(stale.id);
    if (operation.status !== 'reserved') return;

    const treasuryAddress = this.treasury.address;
    if (!treasuryAddress) {
      throw new ServiceUnavailableException('Treasury is not configured');
    }

    const source = await this.wallets.signingRecord(operation.sourceWalletId!);
    if (source.userId !== operation.userId) {
      await this.refuseSigning(operation, source.id, 'owner_mismatch');
      throw new Error('Source account does not belong to the operation owner');
    }

    const keypair = this.solana.decryptKeypair(source.encryptedKeypair);
    if (keypair.publicKey.toBase58() !== source.solanaPubkey) {
      await this.refuseSigning(operation, source.id, 'address_mismatch');
      throw new Error('Decrypted key does not match the stored wallet address');
    }

    const result = await sendSplTransfer({
      connection: this.solana.getConnection(),
      owner: keypair,
      feePayer: this.treasury.feePayer(),
      mint: new PublicKey(this.config.getOrThrow<string>('SOLANA_USDC_MINT')),
      destinationOwner: new PublicKey(treasuryAddress),
      amount: operation.amountBaseUnits,
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
          walletId: source.id,
          walletAddress: source.solanaPubkey,
          keyVersion: source.encryptionKeyVersion,
          chainSignature: signature,
          amountBaseUnits: operation.amountBaseUnits,
          currency: operation.currency,
          feePayerAddress: this.treasury.address,
        });
      },
    });

    if (result.status === 'failed') {
      const current = await this.operations.require(operation.id);
      if (current.status === 'chain_submitted') {
        await this.ledger.transaction(async (tx) => {
          await this.ledger.releaseReservation(
            tx,
            operation.sourceWalletId!,
            operation.currency,
            operation.amountBaseUnits,
          );
        });
        await this.operations.fail(operation.id, 'token_return_failed');
      }
      return;
    }

    if (result.status === 'pending') {
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

  /**
   * Funds the connected account and creates the payout.
   *
   * From here on the tokens are already gone, so any failure has to be
   * compensated rather than declared.
   */
  async submitPayout(stale: FinancialOperation): Promise<void> {
    const operation = await this.operations.require(stale.id);
    if (operation.status !== 'chain_confirmed') return;

    const amountCents = Number(
      usdcBaseUnitsToUsdCents(operation.amountBaseUnits),
    );
    const accountId = operation.providerAccountId;
    const destinationId = operation.providerDestinationId;
    if (!accountId || !destinationId) {
      throw new Error(`Withdrawal ${operation.id} has no payout destination`);
    }

    try {
      // Move platform funds to the connected account first; a payout can only
      // draw on that account's own balance.
      const transfer = await this.stripe.transfers.create(
        {
          amount: amountCents,
          currency: 'usd',
          destination: accountId,
          metadata: { operationId: operation.id },
        },
        { idempotencyKey: `withdrawal-transfer:${operation.id}` },
      );

      const method =
        (operation.metadata as { payoutMethod?: 'standard' | 'instant' } | null)
          ?.payoutMethod ?? 'standard';

      const payout = await this.stripe.payouts.create(
        {
          amount: amountCents,
          currency: 'usd',
          method,
          destination: destinationId,
          metadata: { operationId: operation.id },
        },
        {
          stripeAccount: accountId,
          idempotencyKey: `withdrawal-payout:${operation.id}`,
        },
      );

      await this.operations.advance(
        operation.id,
        'payout_submitted',
        {
          providerRef: payout.id,
          providerStatus: payout.status,
          payoutSubmittedAt: new Date(),
          metadata: {
            ...(operation.metadata as Record<string, unknown> | null),
            transferId: transfer.id,
            payoutId: payout.id,
          },
        },
        { transferId: transfer.id, payoutId: payout.id, method },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Stripe payout failed';
      this.logger.error(
        `Withdrawal ${operation.id} payout failed after tokens moved: ${message}`,
      );
      await this.operations.beginCompensation(operation.id, 'payout_failed');
      await this.operations.note(operation.id, 'payout_error', { message });
    }
  }

  /** A refused signing attempt is a fact worth keeping, not just an exception. */
  private async refuseSigning(
    operation: FinancialOperation,
    walletId: string,
    reason: string,
  ): Promise<void> {
    await this.audit.authorization({
      userId: operation.userId,
      operationKind: operation.kind,
      decision: 'refused',
      subjectType: 'wallet',
      subjectId: walletId,
      reason,
      operationId: operation.id,
      amountBaseUnits: operation.amountBaseUnits,
      currency: operation.currency,
    });
  }

  async applyPayoutEvent(params: {
    payoutId: string;
    eventType: string;
    status: string;
    failureMessage?: string | null;
  }): Promise<{ handled: boolean; operationId?: string }> {
    const operation = await this.operations.findByProviderRef(params.payoutId);
    if (!operation) return { handled: false };

    if (params.status === 'paid' && operation.status === 'payout_submitted') {
      await this.operations.advance(
        operation.id,
        'payout_settled',
        { providerStatus: params.status, nextAttemptAt: new Date() },
        { eventType: params.eventType },
      );
      return { handled: true, operationId: operation.id };
    }

    if (
      (params.status === 'failed' || params.status === 'canceled') &&
      operation.status === 'payout_submitted'
    ) {
      await this.operations.beginCompensation(operation.id, 'payout_failed');
      await this.operations.note(operation.id, 'payout_failed', {
        eventType: params.eventType,
        failureMessage: params.failureMessage ?? null,
      });
      return { handled: true, operationId: operation.id };
    }

    await this.operations.note(operation.id, 'payout_update', {
      eventType: params.eventType,
      status: params.status,
    });
    return { handled: true, operationId: operation.id };
  }

  /** Re-reads an outstanding payout when a webhook never arrived. */
  async pollPayout(operation: FinancialOperation): Promise<void> {
    if (!operation.providerRef || !operation.providerAccountId) return;
    const payout = await this.stripe.payouts.retrieve(
      operation.providerRef,
      undefined,
      { stripeAccount: operation.providerAccountId },
    );
    await this.applyPayoutEvent({
      payoutId: payout.id,
      eventType: 'polled',
      status: payout.status,
      failureMessage: payout.failure_message,
    });
  }

  /** Returns reserved funds after a confirmed chain failure. */
  async releaseReservation(operation: FinancialOperation): Promise<void> {
    await this.ledger.transaction(async (tx) => {
      await this.ledger.releaseReservation(
        tx,
        operation.sourceWalletId!,
        operation.currency,
        operation.amountBaseUnits,
      );
    });
  }

  /** Records the completed withdrawal once the payout has actually settled. */
  async finalize(stale: FinancialOperation): Promise<void> {
    const operation = await this.operations.require(stale.id);
    if (operation.status !== 'payout_settled') return;

    const ledgerEntryId = await this.ledger.transaction(async (tx) => {
      const recorded = await this.ledger.recordOnce(tx, {
        operationId: operation.id,
        debitWalletId: operation.sourceWalletId!,
        creditWalletId: operation.sourceWalletId!,
        amount: operation.amountBaseUnits,
        currency: operation.currency,
        type: 'off_ramp',
        chainSignature: operation.chainSignature,
        metadata: {
          ...(operation.metadata as Record<string, unknown> | null),
          source: 'account_withdrawal',
          payoutId: operation.providerRef,
        },
      });

      if (recorded.created) {
        await this.ledger.consumeReservation(
          tx,
          operation.sourceWalletId!,
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
  }

  /**
   * Puts the money back after a payout failed once the tokens had already been
   * returned to the treasury. The balance is only restored after the treasury's
   * compensating transfer is confirmed on chain.
   */
  async completeCompensation(stale: FinancialOperation): Promise<void> {
    const operation = await this.operations.require(stale.id);
    if (operation.status !== 'compensating') return;

    const walletAddress = await this.wallets.addressOf(
      operation.sourceWalletId!,
    );
    const result = await this.treasury.sendUsdcTo(
      walletAddress,
      operation.amountBaseUnits,
      {
        onSignaturePrepared: async (signature) => {
          await this.operations.note(operation.id, 'compensation_prepared', {
            signature,
          });
          await this.audit.signature({
            userId: operation.userId,
            operationId: operation.id,
            operationKind: `${operation.kind}_compensation`,
            walletId: operation.sourceWalletId!,
            walletAddress,
            // The treasury signs the return; the user's key is not involved.
            keyVersion: 'treasury',
            chainSignature: signature,
            amountBaseUnits: operation.amountBaseUnits,
            currency: operation.currency,
            feePayerAddress: this.treasury.address,
          });
        },
      },
    );

    if (result.status !== 'completed') {
      // Not confirmed: leave the funds reserved and try again. Restoring the
      // balance now would credit money the chain has not returned.
      await this.operations.deferNextAttempt(operation.id, 30_000);
      return;
    }

    await this.ledger.transaction(async (tx) => {
      await this.ledger.releaseReservation(
        tx,
        operation.sourceWalletId!,
        operation.currency,
        operation.amountBaseUnits,
      );
    });

    await this.operations.completeCompensation(operation.id, {
      returnedSignature: result.signature,
    });

    this.logger.log(
      `Withdrawal ${operation.id} reversed; ${operation.amountBaseUnits} base units returned`,
    );
  }
}
