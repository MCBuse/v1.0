import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, gte, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { PaymentRequestsService } from '../payment-requests/payment-requests.service';
import type { TransferProvider } from './transfer-provider.interface';
import { TRANSFER_PROVIDER } from './transfer-provider.interface';
import { ExecutePaymentDto } from './dto/execute-payment.dto';
import { ExecuteUsernamePaymentDto } from './dto/execute-username-payment.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(TRANSFER_PROVIDER) private readonly transferProvider: TransferProvider,
    private readonly paymentRequestsService: PaymentRequestsService,
    private readonly usersService: UsersService,
  ) {}

  async execute(payerUserId: string, dto: ExecutePaymentDto) {
    // 1. Resolve payment request
    const resolved = await this.paymentRequestsService.resolve(dto.nonce);
    const pr = resolved;

    // 2. Load payer's routine wallet (with encryptedKeypair for Solana signing)
    const payerWallet = await this.getRoutineWalletForUser(payerUserId);

    // 3. Load payee wallet from the payment request (solanaPubkey already included)
    const payeeWallet = resolved.creatorWallet;
    if (!payeeWallet) throw new BadRequestException('Payee wallet not found');

    // 4. Guard: cannot pay yourself
    if (payerWallet.id === payeeWallet.id) throw new BadRequestException('Cannot send payment to yourself');

    // 5. Resolve amount + currency
    let amount: bigint;
    let currency: string;

    if (pr.type === 'dynamic') {
      // Dynamic: amount + currency locked in the payment request
      if (!pr.amount || !pr.currency) {
        throw new InternalServerErrorException('Dynamic payment request missing amount/currency');
      }
      amount = BigInt(pr.amount);
      currency = pr.currency;
    } else {
      // Static: payer supplies amount + currency
      if (!dto.amount) throw new BadRequestException('amount is required for static payment requests');
      if (!dto.currency) throw new BadRequestException('currency is required for static payment requests');
      amount = BigInt(dto.amount);
      currency = dto.currency.toUpperCase();
    }

    if (amount <= 0n) throw new BadRequestException('Amount must be positive');

    const result = await this.executeRoutineTransfer({
      payerWallet,
      payeeWallet,
      amount,
      currency,
      metadata: { nonce: dto.nonce, paymentRequestId: pr.id },
      dynamicPaymentRequestId: pr.type === 'dynamic' ? pr.id : undefined,
    });

    this.logger.log(
      `P2P transfer: ${amount} ${currency} from ${payerWallet.id} → ${payeeWallet.id} (${result.txSignature ?? 'mock'})`,
    );

    return {
      txSignature: result.txSignature,
      amount: amount.toString(),
      currency,
      payerWalletId: payerWallet.id,
      payeeWalletId: payeeWallet.id,
      idempotencyKey: result.idempotencyKey,
      paymentRequestId: pr.id,
    };
  }

  async executeByUsername(payerUserId: string, dto: ExecuteUsernamePaymentDto) {
    const recipient = await this.usersService.findByUsername(dto.username);
    if (!recipient || !recipient.isActive) throw new NotFoundException('Recipient not found');
    if (recipient.id === payerUserId) throw new BadRequestException('Cannot send payment to yourself');

    const amount = BigInt(dto.amount);
    if (amount <= 0n) throw new BadRequestException('Amount must be positive');
    const currency = dto.currency.toUpperCase();

    const [payerWallet, payeeWallet] = await Promise.all([
      this.getRoutineWalletForUser(payerUserId),
      this.getRoutineWalletForUser(recipient.id),
    ]);

    const result = await this.executeRoutineTransfer({
      payerWallet,
      payeeWallet,
      amount,
      currency,
      metadata: { recipientUsername: recipient.username },
    });

    this.logger.log(
      `Username P2P transfer: ${amount} ${currency} from ${payerWallet.id} → @${recipient.username} (${result.txSignature ?? 'mock'})`,
    );

    return {
      txSignature: result.txSignature,
      amount: amount.toString(),
      currency,
      payerWalletId: payerWallet.id,
      payeeWalletId: payeeWallet.id,
      idempotencyKey: result.idempotencyKey,
      recipient: {
        username: recipient.username,
        displayName: `${recipient.firstName} ${recipient.lastName}`.trim(),
      },
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

    const wallet = rows[0];
    if (!wallet) throw new BadRequestException('Routine wallet not found');
    return wallet;
  }

  private async executeRoutineTransfer(params: {
    payerWallet: typeof schema.wallets.$inferSelect;
    payeeWallet: Pick<typeof schema.wallets.$inferSelect, 'id' | 'solanaPubkey'>;
    amount: bigint;
    currency: string;
    metadata: Record<string, unknown>;
    dynamicPaymentRequestId?: string;
  }) {
    const { payerWallet, payeeWallet, amount, currency, metadata, dynamicPaymentRequestId } = params;
    const idempotencyKey = randomUUID();

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
    });

    if (transferResult.status === 'failed') {
      throw new InternalServerErrorException('Transfer failed — no DB state was mutated');
    }

    const txSignature = transferResult.txSignature;

    await this.db.transaction(async (tx) => {
      const deducted = await tx
        .update(schema.balances)
        .set({ available: sql`${schema.balances.available} - ${amount}` })
        .where(
          and(
            eq(schema.balances.walletId, payerWallet.id),
            eq(schema.balances.currency, currency),
            gte(schema.balances.available, amount),
          ),
        )
        .returning({ id: schema.balances.id });

      if (deducted.length === 0) throw new BadRequestException('Insufficient balance');

      const credited = await tx
        .update(schema.balances)
        .set({ available: sql`${schema.balances.available} + ${amount}` })
        .where(
          and(
            eq(schema.balances.walletId, payeeWallet.id),
            eq(schema.balances.currency, currency),
          ),
        )
        .returning({ id: schema.balances.id });

      if (credited.length !== 1) {
        throw new BadRequestException(`Payee balance record not found for currency ${currency}`);
      }

      const ledgerRows = await tx
        .insert(schema.ledgerEntries)
        .values({
          debitWalletId: payerWallet.id,
          creditWalletId: payeeWallet.id,
          amount,
          currency,
          type: 'p2p',
          status: 'completed',
          solanaTxSignature: txSignature,
          idempotencyKey,
          metadata: JSON.stringify(metadata),
        })
        .returning({ id: schema.ledgerEntries.id });

      const ledgerEntryId = ledgerRows[0].id;

      if (dynamicPaymentRequestId) {
        const completed = await tx
          .update(schema.paymentRequests)
          .set({ status: 'completed', completedAt: new Date(), ledgerEntryId })
          .where(
            and(
              eq(schema.paymentRequests.id, dynamicPaymentRequestId),
              eq(schema.paymentRequests.type, 'dynamic'),
              eq(schema.paymentRequests.status, 'pending'),
            ),
          )
          .returning({ id: schema.paymentRequests.id });

        if (completed.length === 0) {
          throw new BadRequestException('Payment request is no longer pending');
        }
      }
    });

    return { txSignature, idempotencyKey };
  }

  private async assertAvailableBalance(walletId: string, currency: string, amount: bigint) {
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

    if (rows.length === 0) throw new BadRequestException('Insufficient balance');
  }
}
