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
import type { SwapProvider } from './swap-provider.interface';
import { SWAP_PROVIDER } from './swap-provider.interface';
import { PreviewSwapDto } from './dto/preview-swap.dto';
import { ExecuteSwapDto } from './dto/execute-swap.dto';

@Injectable()
export class SwapService {
  private readonly logger = new Logger(SwapService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(SWAP_PROVIDER) private readonly provider: SwapProvider,
    private readonly walletsService: WalletsService,
  ) {}

  /**
   * Return a rate quote without executing any state change.
   */
  async preview(userId: string, dto: PreviewSwapDto) {
    this.validatePair(dto.fromCurrency, dto.toCurrency);
    const fromAmount = this.parseAmount(dto.fromAmount);

    const result = await this.provider.preview({
      fromCurrency: dto.fromCurrency.toUpperCase(),
      toCurrency: dto.toCurrency.toUpperCase(),
      fromAmount,
    });

    return this.serializePreview(result);
  }

  /**
   * Execute the swap inside the caller's savings wallet.
   * Atomically deducts fromCurrency and credits toCurrency in a single DB transaction.
   */
  async execute(userId: string, dto: ExecuteSwapDto) {
    const fromCurrency = dto.fromCurrency.toUpperCase();
    const toCurrency = dto.toCurrency.toUpperCase();
    this.validatePair(fromCurrency, toCurrency);

    const fromAmount = this.parseAmount(dto.fromAmount);

    const wallets = await this.walletsService.findByUserId(userId);
    const savings = wallets['savings'];
    if (!savings) throw new BadRequestException('Savings wallet not found');

    const idempotencyKey = randomUUID();

    // Get rate from provider first (outside transaction — read-only)
    const preview = await this.provider.preview({
      fromCurrency,
      toCurrency,
      fromAmount,
    });

    // Execute with provider (mock: instant; real: DEX call)
    const swapResult = await this.provider.execute({
      fromCurrency,
      toCurrency,
      fromAmount,
      walletId: savings.id,
      solanaPubkey: savings.solanaPubkey,
      idempotencyKey,
    });

    if (swapResult.status === 'failed') {
      throw new BadRequestException('Swap failed at provider level');
    }

    if (swapResult.status === 'pending') {
      throw new BadRequestException(
        'Swap is pending provider finalization and cannot be settled yet',
      );
    }

    // Atomic DB transaction: deduct source, credit target, record ledger
    await this.db.transaction(async (tx) => {
      // Deduct fromCurrency (gte guard prevents overdraft — no race condition)
      const deducted = await tx
        .update(schema.balances)
        .set({
          available: sql`${schema.balances.available} - ${swapResult.fromAmount}`,
        })
        .where(
          and(
            eq(schema.balances.walletId, savings.id),
            eq(schema.balances.currency, fromCurrency),
            gte(schema.balances.available, swapResult.fromAmount),
          ),
        )
        .returning({ id: schema.balances.id });

      if (deducted.length === 0) {
        throw new BadRequestException(
          `Insufficient ${fromCurrency} balance in savings wallet`,
        );
      }

      // Credit toCurrency
      const credited = await tx
        .update(schema.balances)
        .set({
          available: sql`${schema.balances.available} + ${swapResult.toAmount}`,
        })
        .where(
          and(
            eq(schema.balances.walletId, savings.id),
            eq(schema.balances.currency, toCurrency),
          ),
        )
        .returning({ id: schema.balances.id });

      if (credited.length !== 1) {
        throw new BadRequestException(
          `Target currency ${toCurrency} balance row not found`,
        );
      }

      // Double-entry ledger — same wallet on both sides (intra-wallet currency exchange)
      await tx.insert(schema.ledgerEntries).values({
        debitWalletId: savings.id,
        creditWalletId: savings.id,
        amount: swapResult.fromAmount,
        currency: fromCurrency,
        type: 'swap',
        status: swapResult.status,
        idempotencyKey,
        metadata: JSON.stringify({
          fromCurrency,
          toCurrency,
          fromAmount: swapResult.fromAmount.toString(),
          toAmount: swapResult.toAmount.toString(),
          rate: preview.rate,
          fee: swapResult.fee.toString(),
          externalId: swapResult.externalId,
        }),
      });
    });

    this.logger.log(
      `Swap: ${swapResult.fromAmount} ${fromCurrency} → ${swapResult.toAmount} ${toCurrency} ` +
        `for wallet ${savings.id} (${swapResult.externalId})`,
    );

    // Fetch refreshed balances for both currencies
    const [fromBalance, toBalance] = await Promise.all([
      this.walletsService.getBalance(userId, 'savings', fromCurrency),
      this.walletsService.getBalance(userId, 'savings', toCurrency),
    ]);

    return {
      fromCurrency,
      toCurrency,
      fromAmount: swapResult.fromAmount.toString(),
      toAmount: swapResult.toAmount.toString(),
      rate: preview.rate,
      fee: swapResult.fee.toString(),
      feeCurrency: swapResult.feeCurrency,
      externalId: swapResult.externalId,
      status: swapResult.status,
      balances: { [fromCurrency]: fromBalance, [toCurrency]: toBalance },
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private validatePair(from: string, to: string) {
    if (from === to) {
      throw new BadRequestException('fromCurrency and toCurrency must differ');
    }
    const valid = ['USDC', 'EURC'];
    if (!valid.includes(from) || !valid.includes(to)) {
      throw new BadRequestException(
        `Unsupported currency. Supported: ${valid.join(', ')}`,
      );
    }
  }

  private parseAmount(raw: string): bigint {
    const amount = BigInt(raw);
    if (amount <= 0n) throw new BadRequestException('fromAmount must be positive');
    return amount;
  }

  private serializePreview(result: Awaited<ReturnType<SwapProvider['preview']>>) {
    return {
      fromCurrency: result.fromCurrency,
      toCurrency: result.toCurrency,
      fromAmount: result.fromAmount.toString(),
      toAmount: result.toAmount.toString(),
      rate: result.rate,
      fee: result.fee.toString(),
      feeCurrency: result.feeCurrency,
    };
  }
}
