import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
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

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(TRANSFER_PROVIDER) private readonly transferProvider: TransferProvider,
    private readonly paymentRequestsService: PaymentRequestsService,
  ) {}

  async execute(payerUserId: string, dto: ExecutePaymentDto) {
    // 1. Resolve payment request
    const resolved = await this.paymentRequestsService.resolve(dto.nonce);
    const pr = resolved;

    // 2. Load payer's routine wallet (with encryptedKeypair for Solana signing)
    const payerWalletRows = await this.db
      .select()
      .from(schema.wallets)
      .where(
        and(
          eq(schema.wallets.userId, payerUserId),
          eq(schema.wallets.type, 'routine'),
          eq(schema.wallets.isActive, true),
        ),
      )
      .limit(1);

    const payerWallet = payerWalletRows[0];
    if (!payerWallet) throw new BadRequestException('Routine wallet not found');

    // 3. Load payee wallet from the payment request (solanaPubkey already included)
    const payeeWallet = resolved.creatorWallet;
    if (!payeeWallet) throw new BadRequestException('Payee wallet not found');

    // 4. Guard: cannot pay yourself
    if (payerWallet.id === payeeWallet.id) {
      throw new BadRequestException('Cannot send payment to yourself');
    }

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

    const idempotencyKey = randomUUID();

    // 6. Execute the on-chain transfer BEFORE opening the DB transaction.
    //    This avoids holding a DB transaction open during slow RPC calls, and ensures
    //    that if the transfer fails we never mutate DB state at all.
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

    // 7. DB transaction: atomic deduct + credit + ledger + mark payment request complete
    await this.db.transaction(async (tx) => {
      // Atomic deduct from payer (fails if insufficient)
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

      if (deducted.length === 0) {
        throw new BadRequestException('Insufficient balance');
      }

      // Credit payee — assert the balance row exists
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

      // Double-entry ledger
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
          metadata: JSON.stringify({ nonce: dto.nonce, paymentRequestId: pr.id }),
        })
        .returning({ id: schema.ledgerEntries.id });

      const ledgerEntryId = ledgerRows[0].id;

      // Mark dynamic requests complete — conditional to prevent race/double-complete
      if (pr.type === 'dynamic') {
        const completed = await tx
          .update(schema.paymentRequests)
          .set({ status: 'completed', completedAt: new Date(), ledgerEntryId })
          .where(
            and(
              eq(schema.paymentRequests.id, pr.id),
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

    this.logger.log(
      `P2P transfer: ${amount} ${currency} from ${payerWallet.id} → ${payeeWallet.id} (${txSignature ?? 'mock'})`,
    );

    return {
      txSignature,
      amount: amount.toString(),
      currency,
      payerWalletId: payerWallet.id,
      payeeWalletId: payeeWallet.id,
      idempotencyKey,
      paymentRequestId: pr.id,
    };
  }
}
