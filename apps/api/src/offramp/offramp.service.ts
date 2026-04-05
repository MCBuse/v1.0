import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, sql, gte } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { WalletsService } from '../wallets/wallets.service';
import type { OffRampProvider } from './offramp-provider.interface';
import { OFFRAMP_PROVIDER } from './offramp-provider.interface';
import { InitiateOffRampDto } from './dto/initiate-offramp.dto';

@Injectable()
export class OffRampService {
  private readonly logger = new Logger(OffRampService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(OFFRAMP_PROVIDER) private readonly provider: OffRampProvider,
    private readonly walletsService: WalletsService,
  ) {}

  async withdraw(userId: string, dto: InitiateOffRampDto) {
    const amount = BigInt(dto.amount);
    if (amount <= 0n) throw new BadRequestException('Amount must be positive');

    const currency = dto.currency.toUpperCase();

    const wallets = await this.walletsService.findByUserId(userId);
    const savings = wallets['savings'];
    if (!savings) throw new BadRequestException('Savings wallet not found');

    const idempotencyKey = randomUUID();

    // Call provider first (external call — outside DB transaction)
    const result = await this.provider.initiateOffRamp({
      walletId: savings.id,
      solanaPubkey: savings.solanaPubkey,
      amount,
      currency,
      bankAccountRef: dto.bankAccountRef,
      idempotencyKey,
    });

    if (result.status === 'failed') {
      throw new BadRequestException('Off-ramp request failed at provider level');
    }

    // Atomic DB transaction: deduct balance + record ledger entry
    await this.db.transaction(async (tx) => {
      // Conditional deduct: only succeeds if available >= amount (prevents overdraft)
      const deducted = await tx
        .update(schema.balances)
        .set({
          available: sql`${schema.balances.available} - ${result.amount}`,
        })
        .where(
          and(
            eq(schema.balances.walletId, savings.id),
            eq(schema.balances.currency, currency),
            gte(schema.balances.available, result.amount),
          ),
        )
        .returning({ id: schema.balances.id });

      if (deducted.length === 0) {
        throw new BadRequestException(
          `Insufficient ${currency} balance in savings wallet`,
        );
      }

      await tx.insert(schema.ledgerEntries).values({
        // Off-ramp: debit from savings, credit to savings (funds leave the platform)
        debitWalletId: savings.id,
        creditWalletId: savings.id,
        amount: result.amount,
        currency,
        type: 'off_ramp',
        status: result.status,
        idempotencyKey,
        metadata: JSON.stringify({
          externalId: result.externalId,
          provider: this.provider.providerName,
          bankAccountRef: dto.bankAccountRef ?? null,
          estimatedSettlement: result.estimatedSettlement ?? null,
        }),
      });
    });

    this.logger.log(
      `Off-ramp initiated: ${result.amount} ${currency} from wallet ${savings.id} ` +
        `(externalId: ${result.externalId}, status: ${result.status})`,
    );

    const updatedBalance = await this.walletsService.getBalance(userId, 'savings', currency);

    return {
      externalId: result.externalId,
      status: result.status,
      amount: dto.amount,
      currency,
      estimatedSettlement: result.estimatedSettlement ?? null,
      balance: updatedBalance,
    };
  }
}
