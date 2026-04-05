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

    // 3. Load payee wallet from the payment request
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

    // 6. Load payee encryptedKeypair (for Solana transfer)
    const payeeFullRows = await this.db
      .select()
      .from(schema.wallets)
      .where(eq(schema.wallets.id, payeeWallet.id))
      .limit(1);
    const payeeFullWallet = payeeFullRows[0];
    if (!payeeFullWallet) throw new BadRequestException('Payee wallet not found');

    const idempotencyKey = randomUUID();

    // 7. DB transaction: atomic deduct + credit + ledger
    let txSignature: string | null = null;

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

      // Credit payee
      await tx
        .update(schema.balances)
        .set({ available: sql`${schema.balances.available} + ${amount}` })
        .where(
          and(
            eq(schema.balances.walletId, payeeWallet.id),
            eq(schema.balances.currency, currency),
          ),
        );

      // Execute transfer (mock: no-op on Solana; real: SPL token transfer)
      const result = await this.transferProvider.execute({
        payerWalletId: payerWallet.id,
        payerPubkey: payerWallet.solanaPubkey,
        payerEncryptedKeypair: payerWallet.encryptedKeypair,
        payeeWalletId: payeeWallet.id,
        payeePubkey: payeeFullWallet.solanaPubkey,
        amount,
        currency,
        idempotencyKey,
      });

      if (result.status === 'failed') {
        throw new InternalServerErrorException('Transfer failed — transaction rolled back');
      }

      txSignature = result.txSignature;

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

      // Mark dynamic requests complete
      if (pr.type === 'dynamic') {
        await tx
          .update(schema.paymentRequests)
          .set({ status: 'completed', completedAt: new Date(), ledgerEntryId })
          .where(eq(schema.paymentRequests.id, pr.id));
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
