import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { and, desc, eq, gte, isNull, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { CreateOfframpSessionDto } from './dto/create-offramp-session.dto';
import { InitiateMoonpayDepositDto } from './dto/initiate-moonpay-deposit.dto';
import { SignOfframpUrlDto } from './dto/sign-offramp-url.dto';
import { MoonpayOfframpProvider } from './moonpay-offramp.provider';
import type {
  MoonpaySellTransaction,
  NormalizedMoonpaySellEvent,
  NormalizedOfframpStatus,
} from './moonpay-offramp.types';
import { OfframpSolanaDepositService } from './offramp-solana-deposit.service';

const USDC_DECIMALS = 6;
const TERMINAL_STATUSES = new Set<NormalizedOfframpStatus>([
  'completed',
  'failed',
  'cancelled',
]);

function baseUnitsToDecimalString(amount: bigint, decimals = USDC_DECIMALS): string {
  const negative = amount < 0n;
  const positive = negative ? -amount : amount;
  const scale = 10n ** BigInt(decimals);
  const whole = positive / scale;
  const fraction = positive % scale;
  const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole.toString()}${fractionText ? `.${fractionText}` : ''}`;
}

function decimalStringToBaseUnits(value: string, decimals = USDC_DECIMALS): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new BadRequestException('Invalid decimal amount');
  }
  const [whole, fraction = ''] = trimmed.split('.');
  if (fraction.length > decimals) {
    throw new BadRequestException(`Amount has more than ${decimals} decimal places`);
  }
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0'));
}

function codeFromCurrency(value: unknown): string | undefined {
  if (typeof value === 'string') return value.toUpperCase();
  if (typeof value === 'object' && value !== null && 'code' in value) {
    const code = (value as { code?: unknown }).code;
    return typeof code === 'string' ? code.toUpperCase() : undefined;
  }
  return undefined;
}

function isExpectedUsdcCode(value: string | undefined, configured: string): boolean {
  const code = value?.toLowerCase();
  return code === 'usdc' || code === configured.toLowerCase();
}

@Injectable()
export class OfframpSessionsService {
  private readonly logger = new Logger(OfframpSessionsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly moonpay: MoonpayOfframpProvider,
    private readonly solanaDeposits: OfframpSolanaDepositService,
  ) {}

  async createSession(userId: string, dto: CreateOfframpSessionDto) {
    if (dto.provider !== 'moonpay') throw new BadRequestException('Unsupported provider');
    const currency = dto.cryptoCurrency ?? 'USDC';
    if (currency !== 'USDC') throw new BadRequestException('MoonPay off-ramp currently supports USDC only');

    const amount = BigInt(dto.cryptoAmount);
    if (amount <= 0n) throw new BadRequestException('Amount must be positive');

    const fiatCurrency = (dto.fiatCurrency ?? 'USD').toUpperCase();
    const savings = await this.getSavingsWallet(userId);
    const internalReference = randomUUID();
    const displayAmount = baseUnitsToDecimalString(amount);

    const row = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(schema.offrampTransactions)
        .values({
          userId,
          walletId: savings.id,
          provider: 'moonpay',
          internalReference,
          cryptoAmount: amount,
          cryptoCurrency: 'USDC',
          fiatCurrency,
          network: 'solana',
          refundWalletAddress: savings.solanaPubkey,
          status: 'pending',
        })
        .returning();

      const reserved = await tx
        .update(schema.balances)
        .set({
          available: sql`${schema.balances.available} - ${amount}`,
          pending: sql`${schema.balances.pending} + ${amount}`,
        })
        .where(
          and(
            eq(schema.balances.walletId, savings.id),
            eq(schema.balances.currency, 'USDC'),
            gte(schema.balances.available, amount),
          ),
        )
        .returning({ id: schema.balances.id });

      if (reserved.length !== 1) {
        throw new BadRequestException('Insufficient USDC balance in Holding');
      }

      const [ledger] = await tx
        .insert(schema.ledgerEntries)
        .values({
          debitWalletId: savings.id,
          creditWalletId: savings.id,
          amount,
          currency: 'USDC',
          type: 'off_ramp',
          status: 'pending',
          idempotencyKey: `offramp_moonpay_session:${created.id}`,
          metadata: JSON.stringify({
            provider: 'moonpay',
            internalReference,
            fiatCurrency,
          }),
        })
        .returning({ id: schema.ledgerEntries.id });

      const [updated] = await tx
        .update(schema.offrampTransactions)
        .set({ ledgerEntryId: ledger.id, updatedAt: new Date() })
        .where(eq(schema.offrampTransactions.id, created.id))
        .returning();

      return updated;
    });

    this.logger.log(`Created MoonPay off-ramp session ${row.id} ref=${internalReference}`);

    return {
      transactionId: row.id,
      internalReference,
      provider: 'moonpay',
      environment: this.moonpay.environment,
      params: {
        apiKey: this.moonpay.publicKey,
        baseCurrencyCode: this.moonpay.usdcCurrencyCode,
        baseCurrencyAmount: displayAmount,
        lockAmount: 'true',
        quoteCurrencyCode: fiatCurrency.toLowerCase(),
        refundWalletAddress: savings.solanaPubkey,
        externalTransactionId: internalReference,
        externalCustomerId: userId,
      },
    };
  }

  async signWidgetUrl(userId: string, id: string, dto: SignOfframpUrlDto) {
    const row = await this.getOwnedRow(userId, id);
    const signature = this.moonpay.signUrl(dto.url, {
      internalReference: row.internalReference,
      refundWalletAddress: row.refundWalletAddress,
      cryptoAmount: baseUnitsToDecimalString(row.cryptoAmount),
    });
    return { signature };
  }

  async initiateDeposit(userId: string, id: string, dto: InitiateMoonpayDepositDto) {
    const row = await this.getOwnedRow(userId, id);
    if (TERMINAL_STATUSES.has(row.status as NormalizedOfframpStatus)) {
      throw new BadRequestException('Off-ramp transaction is already closed');
    }
    if (row.depositTxHash) {
      return { depositId: row.depositTxHash };
    }

    this.assertSdkDepositMatchesLocalRow(row, dto);
    const remote = await this.moonpay.getSellTransaction(dto.transactionId);
    this.assertMoonpayTransactionMatchesLocalRow(row, dto, remote);

    const claimed = await this.db
      .update(schema.offrampTransactions)
      .set({
        externalTransactionId: dto.transactionId,
        depositWalletAddress: dto.depositWalletAddress,
        depositWalletAddressTag: dto.depositWalletAddressTag ?? null,
        fiatAmount: dto.fiatCurrencyAmount ?? row.fiatAmount?.toString() ?? null,
        fiatCurrency: dto.fiatCurrencyCode?.toUpperCase() ?? row.fiatCurrency,
        status: 'waiting_for_deposit',
        depositInitiatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.offrampTransactions.id, row.id),
          isNull(schema.offrampTransactions.depositTxHash),
          isNull(schema.offrampTransactions.depositInitiatedAt),
        ),
      )
      .returning();

    if (claimed.length !== 1) {
      const latest = await this.getOwnedRow(userId, id);
      if (latest.depositTxHash) return { depositId: latest.depositTxHash };
      throw new BadRequestException('Deposit is already in progress');
    }

    try {
      const txHash = await this.solanaDeposits.sendUsdcDeposit({
        payerPubkey: row.refundWalletAddress,
        payerEncryptedKeypair: await this.getEncryptedKeypair(row.walletId),
        destinationAddress: dto.depositWalletAddress,
        amount: row.cryptoAmount,
      });

      await this.db.transaction(async (tx) => {
        await tx
          .update(schema.offrampTransactions)
          .set({
            depositTxHash: txHash,
            status: 'deposit_submitted',
            updatedAt: new Date(),
          })
          .where(eq(schema.offrampTransactions.id, row.id));

        if (row.ledgerEntryId) {
          await tx
            .update(schema.ledgerEntries)
            .set({ solanaTxSignature: txHash })
            .where(eq(schema.ledgerEntries.id, row.ledgerEntryId));
        }
      });

      return { depositId: txHash };
    } catch (err) {
      await this.db
        .update(schema.offrampTransactions)
        .set({
          status: 'waiting_for_deposit',
          depositInitiatedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.offrampTransactions.id, row.id));
      throw err;
    }
  }

  async listTransactions(userId: string, limit = 20) {
    const safeLimit = Math.min(Math.max(Number.isFinite(limit) ? limit : 20, 1), 50);
    const rows = await this.db
      .select()
      .from(schema.offrampTransactions)
      .where(
        and(
          eq(schema.offrampTransactions.userId, userId),
          eq(schema.offrampTransactions.provider, 'moonpay'),
        ),
      )
      .orderBy(desc(schema.offrampTransactions.createdAt))
      .limit(safeLimit);
    return { data: rows.map((row) => this.serialize(row)), limit: safeLimit };
  }

  async getTransaction(userId: string, id: string) {
    const row = await this.getOwnedRow(userId, id);
    return this.serialize(row);
  }

  async applyMoonpayWebhook(event: NormalizedMoonpaySellEvent, rawPayload: unknown): Promise<void> {
    const row = await this.findWebhookRow(event);
    if (!row) {
      this.logger.warn(
        `No off-ramp row for MoonPay event ref=${event.internalReference ?? 'none'} tx=${event.externalTransactionId}`,
      );
      return;
    }

    const status = this.nextStatus(row, event);
    await this.db
      .update(schema.offrampTransactions)
      .set({
        externalTransactionId: event.externalTransactionId,
        status,
        cryptoCurrency: event.cryptoCurrency ?? row.cryptoCurrency,
        fiatAmount: event.fiatAmount ?? row.fiatAmount?.toString() ?? null,
        fiatCurrency: event.fiatCurrency ?? row.fiatCurrency,
        depositWalletAddress: event.depositWalletAddress ?? row.depositWalletAddress,
        depositWalletAddressTag:
          event.depositWalletAddressTag ?? row.depositWalletAddressTag,
        depositTxHash: event.depositTxHash ?? row.depositTxHash,
        refundTxHash: event.refundTxHash ?? row.refundTxHash,
        trackerUrl: event.trackerUrl ?? row.trackerUrl,
        rawWebhookPayload: rawPayload as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(schema.offrampTransactions.id, row.id));

    if (status === 'completed') {
      await this.completeReservedFunds(row.id);
    } else if (
      (status === 'failed' || status === 'cancelled') &&
      !row.depositTxHash &&
      !event.depositTxHash
    ) {
      await this.releaseReservedFunds(row.id, status);
    } else if (status === 'failed' && (event.refundTxHash ?? row.refundTxHash)) {
      await this.releaseReservedFunds(row.id, 'failed');
    }
  }

  private async getSavingsWallet(userId: string) {
    const [wallet] = await this.db
      .select()
      .from(schema.wallets)
      .where(
        and(
          eq(schema.wallets.userId, userId),
          eq(schema.wallets.type, 'savings'),
          eq(schema.wallets.isActive, true),
        ),
      )
      .limit(1);
    if (!wallet) throw new BadRequestException('Holding wallet not found');
    return wallet;
  }

  private async getEncryptedKeypair(walletId: string): Promise<string> {
    const [wallet] = await this.db
      .select({ encryptedKeypair: schema.wallets.encryptedKeypair })
      .from(schema.wallets)
      .where(eq(schema.wallets.id, walletId))
      .limit(1);
    if (!wallet) throw new BadRequestException('Holding wallet not found');
    return wallet.encryptedKeypair;
  }

  private async getOwnedRow(userId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(schema.offrampTransactions)
      .where(eq(schema.offrampTransactions.id, id))
      .limit(1);
    if (!row) throw new NotFoundException('Off-ramp transaction not found');
    if (row.userId !== userId) throw new ForbiddenException();
    return row;
  }

  private async findWebhookRow(event: NormalizedMoonpaySellEvent) {
    const clauses = [
      eq(schema.offrampTransactions.externalTransactionId, event.externalTransactionId),
    ];
    if (event.internalReference) {
      clauses.push(eq(schema.offrampTransactions.internalReference, event.internalReference));
    }

    const [row] = await this.db
      .select()
      .from(schema.offrampTransactions)
      .where(and(eq(schema.offrampTransactions.provider, 'moonpay'), or(...clauses)))
      .orderBy(desc(schema.offrampTransactions.createdAt))
      .limit(1);
    return row;
  }

  private assertSdkDepositMatchesLocalRow(
    row: typeof schema.offrampTransactions.$inferSelect,
    dto: InitiateMoonpayDepositDto,
  ) {
    const expectedCode = this.moonpay.usdcCurrencyCode.toLowerCase();
    if (!isExpectedUsdcCode(dto.cryptoCurrencyCode, expectedCode)) {
      throw new BadRequestException('MoonPay deposit currency mismatch');
    }
    if (BigInt(dto.cryptoCurrencyAmountSmallestDenomination) !== row.cryptoAmount) {
      throw new BadRequestException('MoonPay deposit amount mismatch');
    }
    const displayUnits = decimalStringToBaseUnits(dto.cryptoCurrencyAmount);
    if (displayUnits !== row.cryptoAmount) {
      throw new BadRequestException('MoonPay display amount mismatch');
    }
  }

  private assertMoonpayTransactionMatchesLocalRow(
    row: typeof schema.offrampTransactions.$inferSelect,
    dto: InitiateMoonpayDepositDto,
    remote: MoonpaySellTransaction,
  ) {
    if (remote.id !== dto.transactionId) {
      throw new BadRequestException('MoonPay transaction id mismatch');
    }
    if (remote.externalTransactionId !== row.internalReference) {
      throw new BadRequestException('MoonPay transaction reference mismatch');
    }
    const remoteCurrency = codeFromCurrency(remote.baseCurrency);
    if (!isExpectedUsdcCode(remoteCurrency, this.moonpay.usdcCurrencyCode)) {
      throw new BadRequestException('MoonPay transaction currency mismatch');
    }
    if (remote.baseCurrencyAmount === null || remote.baseCurrencyAmount === undefined) {
      throw new BadRequestException('MoonPay transaction amount missing');
    }
    if (decimalStringToBaseUnits(String(remote.baseCurrencyAmount)) !== row.cryptoAmount) {
      throw new BadRequestException('MoonPay transaction amount mismatch');
    }
    const remoteDepositAddress = remote.depositWallet?.walletAddress;
    if (!remoteDepositAddress) {
      throw new BadRequestException('MoonPay transaction deposit wallet missing');
    }
    if (remoteDepositAddress !== dto.depositWalletAddress) {
      throw new BadRequestException('MoonPay transaction deposit wallet mismatch');
    }
    const remoteDepositTag = remote.depositWallet?.walletAddressTag ?? null;
    if ((dto.depositWalletAddressTag ?? null) !== remoteDepositTag) {
      throw new BadRequestException('MoonPay transaction deposit tag mismatch');
    }
  }

  private nextStatus(
    row: typeof schema.offrampTransactions.$inferSelect,
    event: NormalizedMoonpaySellEvent,
  ): NormalizedOfframpStatus {
    const current = row.status as NormalizedOfframpStatus;
    if (current === 'completed') return 'completed';
    if (event.status === 'completed') return 'completed';
    if (event.status === 'failed' && (row.depositTxHash || event.depositTxHash) && !event.refundTxHash) {
      return 'refund_pending';
    }
    if (TERMINAL_STATUSES.has(current)) return current;
    return event.status;
  }

  private async completeReservedFunds(rowId: string) {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(schema.offrampTransactions)
        .where(eq(schema.offrampTransactions.id, rowId))
        .limit(1);
      if (!row?.ledgerEntryId) return;

      const ledgerUpdated = await tx
        .update(schema.ledgerEntries)
        .set({
          status: 'completed',
          solanaTxSignature: row.depositTxHash ?? undefined,
        })
        .where(
          and(
            eq(schema.ledgerEntries.id, row.ledgerEntryId),
            eq(schema.ledgerEntries.status, 'pending'),
          ),
        )
        .returning({ id: schema.ledgerEntries.id });
      if (ledgerUpdated.length !== 1) return;

      const balanceUpdated = await tx
        .update(schema.balances)
        .set({ pending: sql`${schema.balances.pending} - ${row.cryptoAmount}` })
        .where(
          and(
            eq(schema.balances.walletId, row.walletId),
            eq(schema.balances.currency, row.cryptoCurrency),
            gte(schema.balances.pending, row.cryptoAmount),
          ),
        )
        .returning({ id: schema.balances.id });
      if (balanceUpdated.length !== 1) {
        throw new Error('Unable to settle off-ramp pending balance');
      }

      await tx
        .update(schema.offrampTransactions)
        .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.offrampTransactions.id, row.id));
    });
  }

  private async releaseReservedFunds(rowId: string, status: 'failed' | 'cancelled') {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(schema.offrampTransactions)
        .where(eq(schema.offrampTransactions.id, rowId))
        .limit(1);
      if (!row?.ledgerEntryId) return;

      const ledgerUpdated = await tx
        .update(schema.ledgerEntries)
        .set({ status })
        .where(
          and(
            eq(schema.ledgerEntries.id, row.ledgerEntryId),
            eq(schema.ledgerEntries.status, 'pending'),
          ),
        )
        .returning({ id: schema.ledgerEntries.id });
      if (ledgerUpdated.length !== 1) return;

      const balanceUpdated = await tx
        .update(schema.balances)
        .set({
          available: sql`${schema.balances.available} + ${row.cryptoAmount}`,
          pending: sql`${schema.balances.pending} - ${row.cryptoAmount}`,
        })
        .where(
          and(
            eq(schema.balances.walletId, row.walletId),
            eq(schema.balances.currency, row.cryptoCurrency),
            gte(schema.balances.pending, row.cryptoAmount),
          ),
        )
        .returning({ id: schema.balances.id });
      if (balanceUpdated.length !== 1) {
        throw new Error('Unable to release off-ramp pending balance');
      }

      await tx
        .update(schema.offrampTransactions)
        .set({ status, updatedAt: new Date() })
        .where(eq(schema.offrampTransactions.id, row.id));
    });
  }

  private serialize(row: typeof schema.offrampTransactions.$inferSelect) {
    return {
      id: row.id,
      provider: row.provider,
      status: row.status,
      cryptoAmount: row.cryptoAmount.toString(),
      cryptoCurrency: row.cryptoCurrency,
      fiatAmount: row.fiatAmount?.toString() ?? null,
      fiatCurrency: row.fiatCurrency,
      network: row.network,
      refundWalletAddress: row.refundWalletAddress,
      depositWalletAddress: row.depositWalletAddress,
      depositWalletAddressTag: row.depositWalletAddressTag,
      depositTxHash: row.depositTxHash,
      refundTxHash: row.refundTxHash,
      trackerUrl: row.trackerUrl,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
