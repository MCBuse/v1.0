import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PublicKey } from '@solana/web3.js';
import { ConfigService } from '@nestjs/config';
import { SolanaService } from '../solana/solana.service';
import { sendSplTransfer } from '../solana/spl-transfer';
import { TreasuryService } from '../treasury/treasury.service';
import {
  FinancialOperationsService,
  type FinancialOperation,
} from '../financial-operations/financial-operations.service';
import { OperationLedgerService } from '../financial-operations/operation-ledger.service';
import { usdCentsToUsdcBaseUnits } from '../financial-operations/operation-money';
import {
  AccountWalletsService,
  type AccountName,
} from './account-wallets.service';

export type TransferPurpose = 'manual' | 'day_end';

/**
 * Moves money between a person's own two accounts.
 *
 * Funds are reserved before anything is signed, the tokens genuinely move on
 * devnet between the two wallets, and only then is the ledger finalized — once.
 */
@Injectable()
export class AccountTransferService {
  private readonly logger = new Logger(AccountTransferService.name);

  constructor(
    private readonly solana: SolanaService,
    private readonly config: ConfigService,
    private readonly treasury: TreasuryService,
    private readonly operations: FinancialOperationsService,
    private readonly ledger: OperationLedgerService,
    private readonly wallets: AccountWalletsService,
  ) {}

  async startTransfer(params: {
    userId: string;
    from: AccountName;
    to: AccountName;
    amountCents: bigint;
    idempotencyKey: string;
    purpose?: TransferPurpose;
    businessDate?: string;
    actorUserId?: string;
  }): Promise<{
    operationId: string;
    status: string;
    amountCents: string;
    from: AccountName;
    to: AccountName;
    replayed: boolean;
  }> {
    if (params.from === params.to) {
      throw new BadRequestException('Choose two different accounts');
    }
    if (params.amountCents <= 0n) {
      throw new BadRequestException('Amount must be positive');
    }

    const source = await this.wallets.forUser(params.userId, params.from);
    const destination = await this.wallets.forUser(params.userId, params.to);
    const amountBaseUnits = usdCentsToUsdcBaseUnits(params.amountCents);

    const { operation, replayed } = await this.operations.begin({
      userId: params.userId,
      kind:
        params.purpose === 'day_end' ? 'merchant_dayend' : 'internal_transfer',
      idempotencyKey: params.idempotencyKey,
      amountBaseUnits,
      currency: 'USDC',
      sourceWalletId: source.id,
      destinationWalletId: destination.id,
      displayAmountMinor: params.amountCents,
      displayCurrency: 'USD',
      metadata: {
        from: params.from,
        to: params.to,
        purpose: params.purpose ?? 'manual',
        businessDate: params.businessDate ?? null,
        actorUserId: params.actorUserId ?? params.userId,
      },
    });

    if (!replayed) {
      await this.reserve(operation);
    }

    const current = await this.operations.require(operation.id);
    return {
      operationId: current.id,
      status: current.status,
      amountCents: params.amountCents.toString(),
      from: params.from,
      to: params.to,
      replayed,
    };
  }

  /** Holds the funds before anything is signed. */
  async reserve(stale: FinancialOperation): Promise<void> {
    const operation = await this.operations.require(stale.id);
    if (operation.status !== 'created') return;
    if (!operation.sourceWalletId) {
      throw new Error(`Transfer ${operation.id} has no source account`);
    }

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

  /** Signs and broadcasts the wallet-to-wallet transfer. */
  async submitChainTransfer(stale: FinancialOperation): Promise<void> {
    const operation = await this.operations.require(stale.id);
    if (operation.status !== 'reserved') return;
    if (!operation.sourceWalletId || !operation.destinationWalletId) {
      throw new Error(`Transfer ${operation.id} is missing an account`);
    }

    const source = await this.wallets.signingRecord(operation.sourceWalletId);
    const destinationAddress = await this.wallets.addressOf(
      operation.destinationWalletId,
    );

    // Everything the signature authorises is checked against the operation
    // before the key is ever decrypted.
    if (source.userId !== operation.userId) {
      throw new Error('Source account does not belong to the operation owner');
    }
    if (operation.amountBaseUnits <= 0n) {
      throw new Error('Refusing to sign a non-positive transfer');
    }

    const keypair = this.solana.decryptKeypair(source.encryptedKeypair);
    if (keypair.publicKey.toBase58() !== source.solanaPubkey) {
      throw new Error('Decrypted key does not match the stored wallet address');
    }

    const result = await sendSplTransfer({
      connection: this.solana.getConnection(),
      owner: keypair,
      // The treasury pays fees and rent so users never need to hold SOL.
      feePayer: this.treasury.feePayer(),
      mint: new PublicKey(this.config.getOrThrow<string>('SOLANA_USDC_MINT')),
      destinationOwner: new PublicKey(destinationAddress),
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
      },
    });

    if (result.status === 'failed') {
      const current = await this.operations.require(operation.id);
      if (current.status === 'chain_submitted') {
        await this.releaseAndFail(operation, 'chain_transfer_failed');
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

  /** Settles the reservation and credits the destination, exactly once. */
  async finalize(stale: FinancialOperation): Promise<void> {
    const operation = await this.operations.require(stale.id);
    if (operation.status !== 'chain_confirmed') return;

    const ledgerEntryId = await this.ledger.transaction(async (tx) => {
      const recorded = await this.ledger.recordOnce(tx, {
        operationId: operation.id,
        debitWalletId: operation.sourceWalletId!,
        creditWalletId: operation.destinationWalletId!,
        amount: operation.amountBaseUnits,
        currency: operation.currency,
        type: 'internal',
        chainSignature: operation.chainSignature,
        metadata: {
          ...(operation.metadata as Record<string, unknown> | null),
          source: 'account_transfer',
        },
      });

      if (recorded.created) {
        await this.ledger.consumeReservation(
          tx,
          operation.sourceWalletId!,
          operation.currency,
          operation.amountBaseUnits,
        );
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

  private async releaseAndFail(
    operation: FinancialOperation,
    code: string,
  ): Promise<void> {
    await this.releaseReservation(operation);
    await this.operations.fail(operation.id, code);
  }
}
