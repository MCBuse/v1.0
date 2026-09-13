import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'crypto';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { PaymentRequestsService } from '../payment-requests/payment-requests.service';
import { UsersService } from '../users/users.service';
import { ExecutePaymentDto } from './dto/execute-payment.dto';
import { ExecuteUsernamePaymentDto } from './dto/execute-username-payment.dto';
import type { TransferProvider } from './transfer-provider.interface';
import { TRANSFER_PROVIDER } from './transfer-provider.interface';

type RoutineWallet = typeof schema.wallets.$inferSelect;
type PayeeWallet = Pick<RoutineWallet, 'id' | 'solanaPubkey'>;
type MerchantPaymentData = {
  id: string;
  nonce: string;
  merchantId: string;
  displayAmountMinor: string;
  quoteRateScaled: string;
  description: string | null;
};

const RECOVERY_TIMEOUT_MS = 5 * 60 * 1000;

@Injectable()
export class PaymentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentsService.name);
  private reconciliationInterval?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(TRANSFER_PROVIDER)
    private readonly transferProvider: TransferProvider,
    private readonly paymentRequestsService: PaymentRequestsService,
    private readonly usersService: UsersService,
  ) {}

  onModuleInit() {
    setTimeout(() => void this.reconcileSubmittedMerchantPayments(), 5_000);
    this.reconciliationInterval = setInterval(
      () => void this.reconcileSubmittedMerchantPayments(),
      30_000,
    );
  }

  onModuleDestroy() {
    if (this.reconciliationInterval) clearInterval(this.reconciliationInterval);
  }

  async execute(payerUserId: string, dto: ExecutePaymentDto) {
    const duplicate = await this.findCompletedByIdempotency(
      dto.idempotencyKey,
      payerUserId,
      dto.nonce,
    );
    if (duplicate) return duplicate;

    const resolved = await this.paymentRequestsService.resolveForExecution(
      dto.nonce,
    );
    const payerWallet = await this.getRoutineWalletForUser(payerUserId);
    const payeeWallet = resolved.creatorWallet;
    if (!payeeWallet) throw new BadRequestException('Payee wallet not found');
    if (payerWallet.id === payeeWallet.id)
      throw new BadRequestException('Cannot send payment to yourself');

    let amount: bigint;
    let currency: string;
    if (resolved.type === 'dynamic') {
      if (!resolved.amount || !resolved.currency) {
        throw new InternalServerErrorException(
          'Dynamic payment request missing amount/currency',
        );
      }
      amount = BigInt(resolved.amount);
      currency = resolved.currency;
    } else {
      if (!dto.amount)
        throw new BadRequestException(
          'amount is required for static payment requests',
        );
      if (!dto.currency)
        throw new BadRequestException(
          'currency is required for static payment requests',
        );
      amount = BigInt(dto.amount);
      currency = dto.currency.toUpperCase();
    }
    if (amount <= 0n) throw new BadRequestException('Amount must be positive');

    const merchantPaymentRequest =
      resolved.merchantId &&
      resolved.displayAmountMinor &&
      resolved.quoteRateScaled
        ? {
            id: resolved.id,
            nonce: resolved.nonce,
            merchantId: resolved.merchantId,
            displayAmountMinor: resolved.displayAmountMinor,
            quoteRateScaled: resolved.quoteRateScaled,
            description: resolved.description,
          }
        : undefined;
    if (resolved.merchantId && !merchantPaymentRequest) {
      throw new InternalServerErrorException(
        'Merchant quote data is incomplete',
      );
    }
    if (merchantPaymentRequest) {
      await this.claimMerchantPayment(
        resolved.id,
        payerUserId,
        dto.idempotencyKey,
        payerWallet.id,
        currency,
        amount,
      );
    }
    let result: { txSignature: string | null };
    try {
      result = await this.executeRoutineTransfer({
        payerWallet,
        payeeWallet,
        amount,
        currency,
        idempotencyKey: dto.idempotencyKey,
        metadata: { nonce: dto.nonce, paymentRequestId: resolved.id },
        dynamicPaymentRequestId:
          resolved.type === 'dynamic' ? resolved.id : undefined,
        merchantPaymentRequest,
      });
    } catch (error) {
      if (merchantPaymentRequest) {
        await this.failUnsubmittedMerchantPayment(merchantPaymentRequest.id);
      }
      throw error;
    }

    this.logger.log(
      `P2P transfer: ${amount} ${currency} from ${payerWallet.id} to ${payeeWallet.id} (${result.txSignature ?? 'mock'})`,
    );
    return {
      txSignature: result.txSignature,
      amount: amount.toString(),
      currency,
      payerWalletId: payerWallet.id,
      payeeWalletId: payeeWallet.id,
      idempotencyKey: dto.idempotencyKey,
      paymentRequestId: resolved.id,
    };
  }

  async executeByUsername(payerUserId: string, dto: ExecuteUsernamePaymentDto) {
    const recipient = await this.usersService.findByUsername(dto.username);
    if (!recipient || !recipient.isActive)
      throw new NotFoundException('Recipient not found');
    if (recipient.id === payerUserId)
      throw new BadRequestException('Cannot send payment to yourself');
    const amount = BigInt(dto.amount);
    if (amount <= 0n) throw new BadRequestException('Amount must be positive');
    const currency = dto.currency.toUpperCase();
    const [payerWallet, payeeWallet] = await Promise.all([
      this.getRoutineWalletForUser(payerUserId),
      this.getRoutineWalletForUser(recipient.id),
    ]);
    const idempotencyKey = randomUUID();
    const result = await this.executeRoutineTransfer({
      payerWallet,
      payeeWallet,
      amount,
      currency,
      idempotencyKey,
      metadata: { recipientUsername: recipient.username },
    });
    return {
      txSignature: result.txSignature,
      amount: amount.toString(),
      currency,
      payerWalletId: payerWallet.id,
      payeeWalletId: payeeWallet.id,
      idempotencyKey,
      recipient: {
        username: recipient.username,
        displayName: `${recipient.firstName} ${recipient.lastName}`.trim(),
      },
    };
  }

  private async claimMerchantPayment(
    paymentRequestId: string,
    payerUserId: string,
    idempotencyKey: string,
    payerWalletId: string,
    currency: string,
    amount: bigint,
  ) {
    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(schema.merchantPaymentAttempts).values({
          paymentRequestId,
          payerUserId,
          idempotencyKey,
          status: 'processing',
        });
        const claimed = await tx
          .update(schema.paymentRequests)
          .set({ status: 'processing', processingAt: new Date() })
          .where(
            and(
              eq(schema.paymentRequests.id, paymentRequestId),
              eq(schema.paymentRequests.status, 'pending'),
            ),
          )
          .returning({ id: schema.paymentRequests.id });
        if (claimed.length !== 1) {
          throw new BadRequestException(
            'Payment request is already being processed',
          );
        }
        const reserved = await tx
          .update(schema.balances)
          .set({
            available: sql`${schema.balances.available} - ${amount}`,
            pending: sql`${schema.balances.pending} + ${amount}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.balances.walletId, payerWalletId),
              eq(schema.balances.currency, currency),
              gte(schema.balances.available, amount),
            ),
          )
          .returning({ id: schema.balances.id });
        if (reserved.length !== 1) {
          throw new BadRequestException('Insufficient balance');
        }
      });
    } catch (error) {
      const existing = await this.db
        .select()
        .from(schema.merchantPaymentAttempts)
        .where(
          eq(schema.merchantPaymentAttempts.paymentRequestId, paymentRequestId),
        )
        .limit(1);
      if (existing[0]?.idempotencyKey === idempotencyKey) {
        if (existing[0].status === 'finalized') return;
        throw new BadRequestException('Payment is still being finalized');
      }
      throw error;
    }
  }

  private async executeRoutineTransfer(params: {
    payerWallet: RoutineWallet;
    payeeWallet: PayeeWallet;
    amount: bigint;
    currency: string;
    idempotencyKey: string;
    metadata: Record<string, unknown>;
    dynamicPaymentRequestId?: string;
    merchantPaymentRequest?: MerchantPaymentData;
  }) {
    const {
      payerWallet,
      payeeWallet,
      amount,
      currency,
      idempotencyKey,
      metadata,
      dynamicPaymentRequestId,
      merchantPaymentRequest,
    } = params;
    if (!merchantPaymentRequest)
      await this.assertAvailableBalance(payerWallet.id, currency, amount);
    const transferResult = await this.transferProvider.execute({
      payerWalletId: payerWallet.id,
      payerPubkey: payerWallet.solanaPubkey,
      payerEncryptedKeypair: payerWallet.encryptedKeypair,
      payeeWalletId: payeeWallet.id,
      payeePubkey: payeeWallet.solanaPubkey,
      amount,
      currency,
      idempotencyKey,
      onSubmitted: merchantPaymentRequest
        ? async (txSignature) => {
            const submitted = await this.db
              .update(schema.merchantPaymentAttempts)
              .set({
                status: 'submitted',
                submittedSignature: txSignature,
                submittedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(
                eq(
                  schema.merchantPaymentAttempts.idempotencyKey,
                  idempotencyKey,
                ),
              )
              .returning({ id: schema.merchantPaymentAttempts.id });
            if (submitted.length !== 1)
              throw new Error('Payment attempt submission was not persisted');
          }
        : undefined,
      onSignaturePrepared: merchantPaymentRequest
        ? async (txSignature) => {
            const prepared = await this.db
              .update(schema.merchantPaymentAttempts)
              .set({
                submittedSignature: txSignature,
                updatedAt: new Date(),
              })
              .where(
                eq(
                  schema.merchantPaymentAttempts.idempotencyKey,
                  idempotencyKey,
                ),
              )
              .returning({ id: schema.merchantPaymentAttempts.id });
            if (prepared.length !== 1)
              throw new Error('Payment attempt signature was not persisted');
          }
        : undefined,
    });
    if (transferResult.status === 'failed') {
      if (merchantPaymentRequest)
        await this.markMerchantPaymentFailed(merchantPaymentRequest.id);
      throw new InternalServerErrorException(
        'Transfer failed; no ledger entry was recorded',
      );
    }
    if (transferResult.status === 'pending') {
      throw new ServiceUnavailableException(
        'Payment was submitted and is still finalizing',
      );
    }
    const txSignature = transferResult.txSignature;
    if (merchantPaymentRequest) {
      await this.finalizeMerchantPayment({
        paymentRequest: merchantPaymentRequest,
        payerWallet,
        payeeWallet,
        amount,
        currency,
        idempotencyKey,
        txSignature,
        metadata,
      });
    } else {
      await this.finalizeConsumerPayment({
        payerWallet,
        payeeWallet,
        amount,
        currency,
        idempotencyKey,
        txSignature,
        metadata,
        dynamicPaymentRequestId,
      });
    }
    return { txSignature };
  }

  private async finalizeConsumerPayment(params: {
    payerWallet: RoutineWallet;
    payeeWallet: PayeeWallet;
    amount: bigint;
    currency: string;
    idempotencyKey: string;
    txSignature: string | null;
    metadata: Record<string, unknown>;
    dynamicPaymentRequestId?: string;
  }) {
    await this.db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: schema.ledgerEntries.id })
        .from(schema.ledgerEntries)
        .where(eq(schema.ledgerEntries.idempotencyKey, params.idempotencyKey))
        .limit(1);
      if (existing[0]) return;
      await this.moveBalances(
        tx,
        params.payerWallet.id,
        params.payeeWallet.id,
        params.currency,
        params.amount,
      );
      const ledgerRows = await tx
        .insert(schema.ledgerEntries)
        .values({
          debitWalletId: params.payerWallet.id,
          creditWalletId: params.payeeWallet.id,
          amount: params.amount,
          currency: params.currency,
          type: 'p2p',
          status: 'completed',
          solanaTxSignature: params.txSignature,
          idempotencyKey: params.idempotencyKey,
          metadata: JSON.stringify(params.metadata),
        })
        .returning({ id: schema.ledgerEntries.id });
      if (params.dynamicPaymentRequestId) {
        const completed = await tx
          .update(schema.paymentRequests)
          .set({
            status: 'completed',
            completedAt: new Date(),
            ledgerEntryId: ledgerRows[0].id,
          })
          .where(
            and(
              eq(schema.paymentRequests.id, params.dynamicPaymentRequestId),
              eq(schema.paymentRequests.status, 'pending'),
            ),
          )
          .returning({ id: schema.paymentRequests.id });
        if (completed.length !== 1)
          throw new BadRequestException('Payment request is no longer pending');
      }
    });
  }

  private async finalizeMerchantPayment(params: {
    paymentRequest: MerchantPaymentData;
    payerWallet: RoutineWallet;
    payeeWallet: PayeeWallet;
    amount: bigint;
    currency: string;
    idempotencyKey: string;
    txSignature: string | null;
    metadata: Record<string, unknown>;
  }) {
    const request = params.paymentRequest;
    const finalizedAt = new Date();
    await this.db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: schema.merchantTransactions.id })
        .from(schema.merchantTransactions)
        .where(eq(schema.merchantTransactions.paymentRequestId, request.id))
        .limit(1);
      if (existing[0]) return;
      await this.settleMerchantReservation(
        tx,
        params.payerWallet.id,
        params.payeeWallet.id,
        params.currency,
        params.amount,
      );
      const ledgerRows = await tx
        .insert(schema.ledgerEntries)
        .values({
          debitWalletId: params.payerWallet.id,
          creditWalletId: params.payeeWallet.id,
          amount: params.amount,
          currency: params.currency,
          type: 'p2p',
          status: 'completed',
          solanaTxSignature: params.txSignature,
          paymentRequestId: request.id,
          idempotencyKey: params.idempotencyKey,
          metadata: JSON.stringify(params.metadata),
        })
        .returning({ id: schema.ledgerEntries.id });
      const completed = await tx
        .update(schema.paymentRequests)
        .set({
          status: 'completed',
          completedAt: finalizedAt,
          ledgerEntryId: ledgerRows[0].id,
        })
        .where(
          and(
            eq(schema.paymentRequests.id, request.id),
            eq(schema.paymentRequests.status, 'processing'),
          ),
        )
        .returning({ id: schema.paymentRequests.id });
      if (completed.length !== 1)
        throw new BadRequestException('Payment request cannot be finalized');
      await tx.insert(schema.merchantTransactions).values({
        receiptNumber: `MCB-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
        merchantId: request.merchantId,
        paymentRequestId: request.id,
        ledgerEntryId: ledgerRows[0].id,
        displayAmountMinor: BigInt(request.displayAmountMinor),
        displayCurrency: 'EUR',
        settlementAmount: params.amount,
        settlementCurrency: params.currency,
        quoteRateScaled: BigInt(request.quoteRateScaled),
        description: request.description,
        status: 'finalized',
        occurredAt: finalizedAt,
        finalizedAt,
      });
      await tx
        .update(schema.merchantPaymentAttempts)
        .set({
          status: 'finalized',
          errorCode: null,
          finalizedAt,
          updatedAt: finalizedAt,
        })
        .where(
          eq(
            schema.merchantPaymentAttempts.idempotencyKey,
            params.idempotencyKey,
          ),
        );
      await tx
        .update(schema.merchantCaptureExceptions)
        .set({ status: 'resolved', resolvedAt: finalizedAt })
        .where(
          and(
            eq(schema.merchantCaptureExceptions.paymentRequestId, request.id),
            eq(
              schema.merchantCaptureExceptions.reasonCode,
              'reconciliation_delayed',
            ),
            eq(schema.merchantCaptureExceptions.status, 'open'),
          ),
        );
    });
  }

  private async moveBalances(
    tx: Parameters<Parameters<typeof this.db.transaction>[0]>[0],
    payerWalletId: string,
    payeeWalletId: string,
    currency: string,
    amount: bigint,
  ) {
    const deducted = await tx
      .update(schema.balances)
      .set({ available: sql`${schema.balances.available} - ${amount}` })
      .where(
        and(
          eq(schema.balances.walletId, payerWalletId),
          eq(schema.balances.currency, currency),
          gte(schema.balances.available, amount),
        ),
      )
      .returning({ id: schema.balances.id });
    if (deducted.length === 0)
      throw new BadRequestException('Insufficient balance');
    const credited = await tx
      .update(schema.balances)
      .set({ available: sql`${schema.balances.available} + ${amount}` })
      .where(
        and(
          eq(schema.balances.walletId, payeeWalletId),
          eq(schema.balances.currency, currency),
        ),
      )
      .returning({ id: schema.balances.id });
    if (credited.length !== 1) {
      throw new BadRequestException(
        `Payee balance record not found for currency ${currency}`,
      );
    }
  }

  private async settleMerchantReservation(
    tx: Parameters<Parameters<typeof this.db.transaction>[0]>[0],
    payerWalletId: string,
    payeeWalletId: string,
    currency: string,
    amount: bigint,
  ) {
    const settled = await tx
      .update(schema.balances)
      .set({
        pending: sql`${schema.balances.pending} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.balances.walletId, payerWalletId),
          eq(schema.balances.currency, currency),
          gte(schema.balances.pending, amount),
        ),
      )
      .returning({ id: schema.balances.id });
    if (settled.length !== 1)
      throw new Error('Reserved merchant payment balance is unavailable');
    await this.creditBalance(tx, payeeWalletId, currency, amount);
  }

  private async releaseMerchantReservation(
    tx: Parameters<Parameters<typeof this.db.transaction>[0]>[0],
    payerWalletId: string,
    currency: string,
    amount: bigint,
  ) {
    const released = await tx
      .update(schema.balances)
      .set({
        available: sql`${schema.balances.available} + ${amount}`,
        pending: sql`${schema.balances.pending} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.balances.walletId, payerWalletId),
          eq(schema.balances.currency, currency),
          gte(schema.balances.pending, amount),
        ),
      )
      .returning({ id: schema.balances.id });
    if (released.length !== 1)
      throw new Error('Reserved merchant payment balance is unavailable');
  }

  private async creditBalance(
    tx: Parameters<Parameters<typeof this.db.transaction>[0]>[0],
    walletId: string,
    currency: string,
    amount: bigint,
  ) {
    const credited = await tx
      .update(schema.balances)
      .set({
        available: sql`${schema.balances.available} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.balances.walletId, walletId),
          eq(schema.balances.currency, currency),
        ),
      )
      .returning({ id: schema.balances.id });
    if (credited.length !== 1) {
      throw new BadRequestException(
        `Payee balance record not found for currency ${currency}`,
      );
    }
  }

  private async markMerchantPaymentFailed(paymentRequestId: string) {
    await this.db.transaction(async (tx) => {
      const paymentRows = await tx
        .select({
          payerWalletId: schema.wallets.id,
          amount: schema.paymentRequests.amount,
          currency: schema.paymentRequests.currency,
          merchantId: schema.paymentRequests.merchantId,
        })
        .from(schema.merchantPaymentAttempts)
        .innerJoin(
          schema.paymentRequests,
          eq(
            schema.paymentRequests.id,
            schema.merchantPaymentAttempts.paymentRequestId,
          ),
        )
        .innerJoin(
          schema.wallets,
          and(
            eq(
              schema.wallets.userId,
              schema.merchantPaymentAttempts.payerUserId,
            ),
            eq(schema.wallets.type, 'routine'),
          ),
        )
        .where(eq(schema.paymentRequests.id, paymentRequestId))
        .limit(1);
      const payment = paymentRows[0];
      if (!payment?.amount || !payment.currency) {
        throw new Error('Merchant payment reservation data is incomplete');
      }
      const failed = await tx
        .update(schema.merchantPaymentAttempts)
        .set({
          status: 'failed',
          errorCode: 'transfer_failed',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(
              schema.merchantPaymentAttempts.paymentRequestId,
              paymentRequestId,
            ),
            inArray(schema.merchantPaymentAttempts.status, [
              'processing',
              'submitted',
            ]),
          ),
        )
        .returning({ id: schema.merchantPaymentAttempts.id });
      if (failed.length !== 1) return;
      await this.releaseMerchantReservation(
        tx,
        payment.payerWalletId,
        payment.currency,
        payment.amount,
      );
      await tx
        .update(schema.paymentRequests)
        .set({ status: 'failed' })
        .where(eq(schema.paymentRequests.id, paymentRequestId));
      if (payment.merchantId) {
        await tx
          .update(schema.merchantCaptureExceptions)
          .set({ status: 'resolved', resolvedAt: new Date() })
          .where(
            and(
              eq(
                schema.merchantCaptureExceptions.paymentRequestId,
                paymentRequestId,
              ),
              eq(
                schema.merchantCaptureExceptions.reasonCode,
                'reconciliation_delayed',
              ),
              eq(schema.merchantCaptureExceptions.status, 'open'),
            ),
          );
        await tx.insert(schema.merchantCaptureExceptions).values({
          merchantId: payment.merchantId,
          paymentRequestId,
          reasonCode: 'transfer_failed',
          severity: 'warning',
          status: 'open',
        });
      }
    });
  }

  private async markMerchantPaymentDelayed(
    paymentRequestId: string,
    merchantId: string | null,
  ) {
    if (!merchantId) return;
    await this.db.transaction(async (tx) => {
      const marked = await tx
        .update(schema.merchantPaymentAttempts)
        .set({ errorCode: 'reconciliation_delayed', updatedAt: new Date() })
        .where(
          and(
            eq(
              schema.merchantPaymentAttempts.paymentRequestId,
              paymentRequestId,
            ),
            inArray(schema.merchantPaymentAttempts.status, [
              'processing',
              'submitted',
            ]),
            isNull(schema.merchantPaymentAttempts.errorCode),
          ),
        )
        .returning({ id: schema.merchantPaymentAttempts.id });
      if (marked.length !== 1) return;
      await tx.insert(schema.merchantCaptureExceptions).values({
        merchantId,
        paymentRequestId,
        reasonCode: 'reconciliation_delayed',
        severity: 'warning',
        status: 'open',
      });
    });
  }

  private async failUnsubmittedMerchantPayment(paymentRequestId: string) {
    const rows = await this.db
      .select({
        status: schema.merchantPaymentAttempts.status,
        submittedSignature: schema.merchantPaymentAttempts.submittedSignature,
      })
      .from(schema.merchantPaymentAttempts)
      .where(
        eq(schema.merchantPaymentAttempts.paymentRequestId, paymentRequestId),
      )
      .limit(1);
    if (rows[0]?.status === 'processing' && !rows[0].submittedSignature)
      await this.markMerchantPaymentFailed(paymentRequestId);
  }

  private async reconcileSubmittedMerchantPayments() {
    try {
      const rows = await this.db
        .select({
          attempt: schema.merchantPaymentAttempts,
          request: schema.paymentRequests,
        })
        .from(schema.merchantPaymentAttempts)
        .innerJoin(
          schema.paymentRequests,
          eq(
            schema.paymentRequests.id,
            schema.merchantPaymentAttempts.paymentRequestId,
          ),
        )
        .where(
          inArray(schema.merchantPaymentAttempts.status, [
            'processing',
            'submitted',
          ]),
        )
        .limit(25);
      for (const row of rows) {
        const recoveryStartedAt =
          row.attempt.submittedAt ?? row.attempt.claimedAt;
        const recoveryExpired =
          recoveryStartedAt.getTime() < Date.now() - RECOVERY_TIMEOUT_MS;
        if (!row.attempt.submittedSignature) {
          if (recoveryExpired)
            await this.markMerchantPaymentFailed(row.request.id);
          continue;
        }
        const status = await this.transferProvider.getStatus(
          row.attempt.submittedSignature,
        );
        if (status === 'pending') {
          if (recoveryExpired)
            await this.markMerchantPaymentDelayed(
              row.request.id,
              row.request.merchantId,
            );
          continue;
        }
        if (status === 'failed') {
          await this.markMerchantPaymentFailed(row.request.id);
          continue;
        }
        const payerWallet = await this.getRoutineWalletForUser(
          row.attempt.payerUserId,
        );
        const payeeRows = await this.db
          .select()
          .from(schema.wallets)
          .where(eq(schema.wallets.id, row.request.creatorWalletId))
          .limit(1);
        if (
          !payeeRows[0] ||
          !row.request.amount ||
          !row.request.currency ||
          !row.request.merchantId ||
          !row.request.displayAmountMinor ||
          !row.request.quoteRateScaled
        ) {
          continue;
        }
        await this.finalizeMerchantPayment({
          paymentRequest: {
            id: row.request.id,
            nonce: row.request.nonce,
            merchantId: row.request.merchantId,
            displayAmountMinor: row.request.displayAmountMinor.toString(),
            quoteRateScaled: row.request.quoteRateScaled.toString(),
            description: row.request.description,
          },
          payerWallet,
          payeeWallet: payeeRows[0],
          amount: row.request.amount,
          currency: row.request.currency,
          idempotencyKey: row.attempt.idempotencyKey,
          txSignature: row.attempt.submittedSignature,
          metadata: {
            nonce: row.request.nonce,
            paymentRequestId: row.request.id,
            reconciled: true,
          },
        });
      }
    } catch (error) {
      this.logger.error(
        'Merchant payment reconciliation failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async findCompletedByIdempotency(
    idempotencyKey: string,
    payerUserId: string,
    nonce: string,
  ) {
    const rows = await this.db
      .select({
        txSignature: schema.ledgerEntries.solanaTxSignature,
        amount: schema.ledgerEntries.amount,
        currency: schema.ledgerEntries.currency,
        payerWalletId: schema.ledgerEntries.debitWalletId,
        payeeWalletId: schema.ledgerEntries.creditWalletId,
        paymentRequestId: schema.ledgerEntries.paymentRequestId,
        metadata: schema.ledgerEntries.metadata,
      })
      .from(schema.ledgerEntries)
      .innerJoin(
        schema.wallets,
        eq(schema.wallets.id, schema.ledgerEntries.debitWalletId),
      )
      .where(
        and(
          eq(schema.ledgerEntries.idempotencyKey, idempotencyKey),
          eq(schema.wallets.userId, payerUserId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;

    let recordedNonce: unknown;
    try {
      const metadata = JSON.parse(row.metadata ?? '{}') as {
        nonce?: unknown;
      };
      recordedNonce = metadata.nonce;
    } catch {
      recordedNonce = undefined;
    }
    if (recordedNonce !== nonce) {
      throw new BadRequestException(
        'Idempotency key was already used for a different payment',
      );
    }

    return {
      txSignature: row.txSignature,
      amount: row.amount.toString(),
      currency: row.currency,
      payerWalletId: row.payerWalletId,
      payeeWalletId: row.payeeWalletId,
      idempotencyKey,
      paymentRequestId: row.paymentRequestId ?? undefined,
    };
  }

  private async getRoutineWalletForUser(userId: string) {
    const rows = await this.db
      .select()
      .from(schema.wallets)
      .where(
        and(
          eq(schema.wallets.userId, userId),
          eq(schema.wallets.type, 'routine'),
          eq(schema.wallets.isActive, true),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new BadRequestException('Routine wallet not found');
    return rows[0];
  }

  private async assertAvailableBalance(
    walletId: string,
    currency: string,
    amount: bigint,
  ) {
    const rows = await this.db
      .select({ id: schema.balances.id })
      .from(schema.balances)
      .where(
        and(
          eq(schema.balances.walletId, walletId),
          eq(schema.balances.currency, currency),
          gte(schema.balances.available, amount),
        ),
      )
      .limit(1);
    if (rows.length === 0)
      throw new BadRequestException('Insufficient balance');
  }
}
