import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { SolanaService } from '../solana/solana.service';
import { LedgerService } from '../ledger/ledger.service';
import { InternalTransferDto } from './dto/internal-transfer.dto';
import { randomUUID } from 'crypto';

const CURRENCIES = ['USDC', 'EURC'] as const;

@Injectable()
export class WalletsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly solanaService: SolanaService,
    private readonly ledgerService: LedgerService,
  ) {}

  /** Create savings + routine wallets with zero balances for a new user. */
  async createWalletPair(userId: string) {
    const savings = this.solanaService.generateKeypair();
    const routine = this.solanaService.generateKeypair();

    return this.db.transaction(async (tx) => {
      const walletRows = await tx
        .insert(schema.wallets)
        .values([
          {
            userId,
            type: 'savings',
            solanaPubkey: savings.publicKey,
            encryptedKeypair: savings.encryptedKeypair,
          },
          {
            userId,
            type: 'routine',
            solanaPubkey: routine.publicKey,
            encryptedKeypair: routine.encryptedKeypair,
          },
        ])
        .returning({
          id: schema.wallets.id,
          userId: schema.wallets.userId,
          type: schema.wallets.type,
          solanaPubkey: schema.wallets.solanaPubkey,
          isActive: schema.wallets.isActive,
          createdAt: schema.wallets.createdAt,
        });

      // Initialise zero balances for each wallet × each currency
      const balanceValues = walletRows.flatMap((w) =>
        CURRENCIES.map((currency) => ({ walletId: w.id, currency })),
      );
      await tx.insert(schema.balances).values(balanceValues);

      return walletRows;
    });
  }

  /** Return both wallets (with balances) for a user. Never returns encryptedKeypair. */
  async findByUserId(userId: string) {
    const walletRows = await this.db
      .select({
        id: schema.wallets.id,
        userId: schema.wallets.userId,
        type: schema.wallets.type,
        solanaPubkey: schema.wallets.solanaPubkey,
        isActive: schema.wallets.isActive,
        createdAt: schema.wallets.createdAt,
      })
      .from(schema.wallets)
      .where(and(eq(schema.wallets.userId, userId), eq(schema.wallets.isActive, true)));

    const result: Record<string, typeof walletRows[0] & { balances: { currency: string; available: string; pending: string }[] }> = {};

    for (const wallet of walletRows) {
      const balanceRows = await this.db
        .select()
        .from(schema.balances)
        .where(eq(schema.balances.walletId, wallet.id));

      result[wallet.type] = {
        ...wallet,
        balances: balanceRows.map((b) => ({
          currency: b.currency,
          available: b.available.toString(),
          pending: b.pending.toString(),
        })),
      };
    }

    return result;
  }

  async getBalance(userId: string, walletType: string, currency: string) {
    const wallet = await this.getWalletForUser(userId, walletType);
    const rows = await this.db
      .select()
      .from(schema.balances)
      .where(
        and(
          eq(schema.balances.walletId, wallet.id),
          eq(schema.balances.currency, currency.toUpperCase()),
        ),
      )
      .limit(1);

    if (!rows[0]) throw new NotFoundException(`Balance not found`);
    return {
      currency: rows[0].currency,
      available: rows[0].available.toString(),
      pending: rows[0].pending.toString(),
    };
  }

  /** Internal Savings ↔ Routine transfer. Both wallets are custodial — no on-chain tx. */
  async internalTransfer(userId: string, dto: InternalTransferDto) {
    if (dto.fromWalletType === dto.toWalletType) {
      throw new BadRequestException('Source and destination wallets must differ');
    }

    const amount = BigInt(dto.amount);
    if (amount <= 0n) throw new BadRequestException('Amount must be positive');

    const from = await this.getWalletForUser(userId, dto.fromWalletType);
    const to = await this.getWalletForUser(userId, dto.toWalletType);
    const currency = dto.currency.toUpperCase();

    // Load source balance
    const srcBalRows = await this.db
      .select()
      .from(schema.balances)
      .where(
        and(eq(schema.balances.walletId, from.id), eq(schema.balances.currency, currency)),
      )
      .limit(1);

    const srcBal = srcBalRows[0];
    if (!srcBal || srcBal.available < amount) {
      throw new BadRequestException('Insufficient balance');
    }

    // DB transaction: deduct + credit + ledger entry
    const idempotencyKey = randomUUID();

    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.balances)
        .set({ available: srcBal.available - amount })
        .where(
          and(eq(schema.balances.walletId, from.id), eq(schema.balances.currency, currency)),
        );

      const dstBalRows = await tx
        .select()
        .from(schema.balances)
        .where(
          and(eq(schema.balances.walletId, to.id), eq(schema.balances.currency, currency)),
        )
        .limit(1);

      const dstBal = dstBalRows[0];
      await tx
        .update(schema.balances)
        .set({ available: (dstBal?.available ?? 0n) + amount })
        .where(
          and(eq(schema.balances.walletId, to.id), eq(schema.balances.currency, currency)),
        );

      await tx.insert(schema.ledgerEntries).values({
        debitWalletId: from.id,
        creditWalletId: to.id,
        amount,
        currency,
        type: 'internal',
        status: 'completed',
        idempotencyKey,
        metadata: JSON.stringify({ initiatedBy: userId }),
      });
    });

    return {
      from: dto.fromWalletType,
      to: dto.toWalletType,
      currency,
      amount: dto.amount,
      idempotencyKey,
    };
  }

  private async getWalletForUser(userId: string, walletType: string) {
    const rows = await this.db
      .select()
      .from(schema.wallets)
      .where(
        and(
          eq(schema.wallets.userId, userId),
          eq(schema.wallets.type, walletType),
          eq(schema.wallets.isActive, true),
        ),
      )
      .limit(1);

    if (!rows[0]) {
      throw new NotFoundException(`${walletType} wallet not found`);
    }
    // Verify ownership
    if (rows[0].userId !== userId) {
      throw new ForbiddenException();
    }
    return rows[0];
  }
}
