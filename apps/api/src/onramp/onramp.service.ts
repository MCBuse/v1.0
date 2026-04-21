import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { LedgerService } from '../ledger/ledger.service';
import { WalletsService } from '../wallets/wallets.service';
import type { OnRampProvider } from './onramp-provider.interface';
import { ONRAMP_PROVIDER } from './onramp-provider.interface';
import { InitiateOnRampDto } from './dto/initiate-onramp.dto';
import { CreateCardDto } from './dto/create-card.dto';
import { CircleClient } from './circle/circle.client';

@Injectable()
export class OnRampService {
  private readonly logger = new Logger(OnRampService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(ONRAMP_PROVIDER) private readonly provider: OnRampProvider,
    private readonly walletsService: WalletsService,
    private readonly ledgerService: LedgerService,
    private readonly circleClient: CircleClient,
  ) {}

  async initiate(userId: string, dto: InitiateOnRampDto) {
    const amount = BigInt(dto.amount);
    if (amount <= 0n) throw new BadRequestException('Amount must be positive');

    const currency = dto.currency.toUpperCase();

    // Load user's savings wallet
    const wallets = await this.walletsService.findByUserId(userId);
    const savings = wallets['savings'];
    if (!savings) throw new BadRequestException('Savings wallet not found');

    const idempotencyKey = randomUUID();

    const result = await this.provider.initiateOnRamp({
      walletId: savings.id,
      solanaPubkey: savings.solanaPubkey,
      amount,
      currency,
      idempotencyKey,
      cardSourceId: dto.cardSourceId,
    });

    // For completed (mock) or synchronous on-ramps, credit balance immediately
    if (result.status === 'completed') {
      await this.db.transaction(async (tx) => {
        const updated = await tx
          .update(schema.balances)
          .set({ available: sql`${schema.balances.available} + ${result.amount}` })
          .where(
            and(
              eq(schema.balances.walletId, savings.id),
              eq(schema.balances.currency, currency),
            ),
          )
          .returning({ id: schema.balances.id });

        if (updated.length !== 1) {
          throw new BadRequestException('Balance record not found for savings wallet');
        }

        await tx.insert(schema.ledgerEntries).values({
          // On-ramp has no debit wallet — use savings as both sides to track the credit
          debitWalletId: savings.id,
          creditWalletId: savings.id,
          amount: result.amount,
          currency,
          type: 'on_ramp',
          status: 'completed',
          idempotencyKey,
          metadata: JSON.stringify({ externalId: result.externalId, provider: this.provider.providerName }),
        });
      });

      this.logger.log(
        `On-ramp completed: ${result.amount} ${currency} credited to wallet ${savings.id} (${result.externalId})`,
      );
    } else {
      // Pending — write ledger entry only, balance credited via webhook
      await this.ledgerService.recordEntry({
        debitWalletId: savings.id,
        creditWalletId: savings.id,
        amount: result.amount,
        currency,
        type: 'on_ramp',
        status: 'pending',
        idempotencyKey,
        metadata: { externalId: result.externalId },
      });
    }

    // Return result with updated balance
    const updatedBalance = await this.walletsService.getBalance(userId, 'savings', currency);

    return {
      externalId: result.externalId,
      status: result.status,
      amount: dto.amount,
      currency,
      balance: updatedBalance,
    };
  }

  /** Proxy Circle's public key — mobile uses this to encrypt card data before tokenization */
  getEncryptionKey() {
    return this.circleClient.get<{ keyId: string; publicKey: string }>(
      '/v1/encryption/public',
    );
  }

  /** Tokenize a card with Circle. Returns a Circle card ID for use in initiateOnRamp. */
  async createCard(dto: CreateCardDto) {
    return this.circleClient.post<{ id: string; status: string; last4: string; network: string }>(
      '/v1/cards',
      {
        idempotencyKey: randomUUID(),
        keyId: dto.keyId,
        encryptedData: dto.encryptedData,
        billingDetails: dto.billingDetails,
        expMonth: dto.expMonth,
        expYear: dto.expYear,
        metadata: {
          email: 'user@mcbuse.com',
          phoneNumber: '+10000000000',
          sessionId: randomUUID(),
          ipAddress: '0.0.0.0',
        },
      },
    );
  }
}
