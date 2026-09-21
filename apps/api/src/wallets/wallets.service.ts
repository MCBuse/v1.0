import { AccountTransferService } from '../accounts/account-transfer.service';
import {
  Injectable,
  Optional,
  ConflictException,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, inArray } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { SolanaService } from '../solana/solana.service';
import { LedgerService } from '../ledger/ledger.service';
import { InternalTransferDto } from './dto/internal-transfer.dto';
import {
  assertIdempotentReuse,
  operationFingerprint,
} from '../financial-operations/operation-fingerprint';

const CURRENCIES = ['USDC', 'EURC'] as const;

@Injectable()
export class WalletsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly solanaService: SolanaService,
    private readonly ledgerService: LedgerService,
    @Optional() private readonly accountTransfers?: AccountTransferService,
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
            encryptionKeyVersion: savings.encryptionKeyVersion,
          },
          {
            userId,
            type: 'routine',
            solanaPubkey: routine.publicKey,
            encryptedKeypair: routine.encryptedKeypair,
            encryptionKeyVersion: routine.encryptionKeyVersion,
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
      .where(
        and(
          eq(schema.wallets.userId, userId),
          eq(schema.wallets.isActive, true),
        ),
      );

    if (walletRows.length === 0) return {};

    // Single query for all balances — avoids N+1 per wallet
    const walletIds = walletRows.map((w) => w.id);
    const allBalances = await this.db
      .select()
      .from(schema.balances)
      .where(inArray(schema.balances.walletId, walletIds));

    const balancesByWallet = new Map<string, typeof allBalances>();
    for (const bal of allBalances) {
      const bucket = balancesByWallet.get(bal.walletId) ?? [];
      bucket.push(bal);
      balancesByWallet.set(bal.walletId, bucket);
    }

    const result: Record<
      string,
      (typeof walletRows)[0] & {
        balances: { currency: string; available: string; pending: string }[];
      }
    > = {};
    for (const wallet of walletRows) {
      const walletBalances = balancesByWallet.get(wallet.id) ?? [];
      result[wallet.type] = {
        ...wallet,
        balances: walletBalances.map((b) => ({
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

  /** Legacy wire shape; settlement is shared with the account API. */
  async internalTransfer(
    userId: string,
    dto: InternalTransferDto,
    clientIdempotencyKey: string,
  ) {
    if (dto.currency !== 'USDC')
      throw new BadRequestException('Only USDC settlement is supported');
    const idempotencyKey = `wallet-transfer:${userId}:${clientIdempotencyKey}`;
    const legacy = await this.findInternalTransfer(idempotencyKey);
    if (legacy) {
      assertIdempotentReuse(
        legacy.fingerprint,
        operationFingerprint({
          userId,
          from: dto.fromWalletType,
          to: dto.toWalletType,
          amount: BigInt(dto.amount),
          currency: dto.currency,
        }),
        'wallet transfer',
      );
      // Historical ledger-only execution must never become a fresh chain movement.
      throw new ConflictException({
        code: 'LEGACY_TRANSFER_RECONCILIATION_REQUIRED',
        message:
          'This historical transfer is already recorded and requires settlement reconciliation.',
      });
    }
    if (!this.accountTransfers)
      throw new Error('Account settlement is unavailable');
    const result = await this.accountTransfers.startTransfer({
      userId,
      from: dto.fromWalletType === 'savings' ? 'holding' : 'routine',
      to: dto.toWalletType === 'savings' ? 'holding' : 'routine',
      amountBaseUnits: BigInt(dto.amount),
      idempotencyKey,
    });
    if (result.status !== 'finalized')
      throw new ConflictException({
        code:
          result.status === 'failed' ? 'TRANSFER_FAILED' : 'TRANSFER_PENDING',
        message:
          result.status === 'failed'
            ? 'Transfer failed'
            : 'Transfer is settling',
        operationId: result.operationId,
      });
    return {
      from: dto.fromWalletType,
      to: dto.toWalletType,
      amount: dto.amount,
      currency: dto.currency,
      idempotencyKey,
      replayed: result.replayed,
      operationId: result.operationId,
      status: result.status,
    };
  }

  private async findInternalTransfer(idempotencyKey: string) {
    const rows = await this.db
      .select({
        amount: schema.ledgerEntries.amount,
        currency: schema.ledgerEntries.currency,
        metadata: schema.ledgerEntries.metadata,
      })
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.idempotencyKey, idempotencyKey))
      .limit(1);

    if (!rows[0]) return null;
    let fingerprint: string | null = null;
    try {
      const parsed = JSON.parse(rows[0].metadata ?? '{}') as {
        fingerprint?: string;
      };
      fingerprint = parsed.fingerprint ?? null;
    } catch {
      fingerprint = null;
    }
    return { ...rows[0], fingerprint };
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
