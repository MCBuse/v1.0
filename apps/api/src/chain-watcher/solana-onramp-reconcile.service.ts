import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, inArray, gte, or, isNull, lt } from 'drizzle-orm';
import { ConfigService } from '@nestjs/config';
import { PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { SolanaService } from '../solana/solana.service';
import { WidgetOnrampSettlementService } from '../onramp/widget-onramp-settlement.service';

const USDC_DECIMALS = 6;

function microsFromDecimalString(s: string | null | undefined): bigint | null {
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return BigInt(Math.round(n * 10 ** USDC_DECIMALS));
}

function microsToDecimalString(micros: bigint): string {
  const neg = micros < 0n;
  const v = neg ? -micros : micros;
  const whole = v / 1_000_000n;
  const frac = v % 1_000_000n;
  const fracStr = frac.toString().padStart(6, '0').replace(/0+$/, '');
  const core = fracStr.length > 0 ? `${whole}.${fracStr}` : `${whole}`;
  return neg ? `-${core}` : core;
}

@Injectable()
export class SolanaOnrampReconcileService {
  private readonly logger = new Logger(SolanaOnrampReconcileService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly config: ConfigService,
    private readonly solana: SolanaService,
    private readonly settlement: WidgetOnrampSettlementService,
  ) {}

  private usdcMint(): string {
    return (
      this.config.get<string>('SOLANA_USDC_MINT') ??
      '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
    );
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async reconcile(): Promise<void> {
    const mint = this.usdcMint();
    const conn = this.solana.getConnection();

    const since = new Date(Date.now() - 60 * 60 * 1000);
    const rows = await this.db
      .select()
      .from(schema.onrampTransactions)
      .where(
        and(
          eq(schema.onrampTransactions.provider, 'moonpay'),
          inArray(schema.onrampTransactions.status, ['pending', 'processing', 'completed']),
          gte(schema.onrampTransactions.createdAt, since),
        ),
      );

    for (const row of rows) {
      try {
        await this.reconcileRow(row, mint, conn);
      } catch (e) {
        this.logger.warn(`Reconcile failed for ${row.id}: ${(e as Error).message}`);
      }
    }
  }

  @Cron('*/5 * * * *')
  async expireStale(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    await this.db
      .update(schema.onrampTransactions)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(
        and(
          eq(schema.onrampTransactions.status, 'pending'),
          lt(schema.onrampTransactions.createdAt, cutoff),
        ),
      );
  }

  private async reconcileRow(
    row: typeof schema.onrampTransactions.$inferSelect,
    mintStr: string,
    conn: ReturnType<SolanaService['getConnection']>,
  ): Promise<void> {
    const owner = new PublicKey(row.walletAddress);
    const mint = new PublicKey(mintStr);
    const ata = getAssociatedTokenAddressSync(mint, owner);
    const ataStr = ata.toBase58();

    const sigs = await conn.getSignaturesForAddress(ata, { limit: 15 });
    const expectedMicros =
      microsFromDecimalString(row.cryptoAmount?.toString() ?? undefined) ?? null;

    for (const { signature } of sigs) {
      if (row.txHash && signature === row.txHash) break;

      const parsed = await conn.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });
      if (!parsed?.meta) continue;

      const inbound = this.inboundUsdcDelta(parsed, ataStr, mint.toBase58());
      if (inbound === null || inbound <= 0n) continue;

      if (expectedMicros !== null) {
        const diff = inbound > expectedMicros ? inbound - expectedMicros : expectedMicros - inbound;
        if (diff > 10_000n) continue;
      }

      if (!this.txWithinWindow(parsed, row.createdAt)) continue;

      await this.applyChainHit(row.id, signature, microsToDecimalString(inbound));
      break;
    }
  }

  private txWithinWindow(parsed: ParsedTransactionWithMeta, createdAt: Date): boolean {
    const t = parsed.blockTime;
    if (typeof t !== 'number') return true;
    const txMs = t * 1000;
    const start = createdAt.getTime() - 15 * 60 * 1000;
    const end = Date.now() + 15 * 60 * 1000;
    return txMs >= start && txMs <= end;
  }

  /**
   * Net increase of USDC at the given SPL token account (ATA) within one transaction.
   */
  private inboundUsdcDelta(
    parsed: ParsedTransactionWithMeta,
    ataStr: string,
    mintStr: string,
  ): bigint | null {
    const meta = parsed.meta;
    if (!meta) return null;
    const preByIdx = new Map<number, bigint>();
    const postByIdx = new Map<number, bigint>();

    for (const b of meta.preTokenBalances ?? []) {
      if (b.mint !== mintStr) continue;
      const acc = parsed.transaction.message.accountKeys[b.accountIndex];
      const addr = typeof acc === 'string' ? acc : acc.pubkey.toBase58();
      if (addr !== ataStr) continue;
      preByIdx.set(b.accountIndex, BigInt(b.uiTokenAmount?.amount ?? '0'));
    }
    for (const b of meta.postTokenBalances ?? []) {
      if (b.mint !== mintStr) continue;
      const acc = parsed.transaction.message.accountKeys[b.accountIndex];
      const addr = typeof acc === 'string' ? acc : acc.pubkey.toBase58();
      if (addr !== ataStr) continue;
      postByIdx.set(b.accountIndex, BigInt(b.uiTokenAmount?.amount ?? '0'));
    }

    let maxDelta = 0n;
    for (const idx of postByIdx.keys()) {
      const before = preByIdx.get(idx) ?? 0n;
      const after = postByIdx.get(idx) ?? 0n;
      const d = after - before;
      if (d > maxDelta) maxDelta = d;
    }
    return maxDelta > 0n ? maxDelta : null;
  }

  private async applyChainHit(rowId: string, signature: string, cryptoDecimal: string): Promise<void> {
    const [current] = await this.db
      .select()
      .from(schema.onrampTransactions)
      .where(eq(schema.onrampTransactions.id, rowId))
      .limit(1);

    if (!current) return;
    if (current.status === 'failed' || current.status === 'expired' || current.status === 'cancelled') {
      return;
    }
    if (current.txHash && current.txHash !== signature) return;
    const nextStatus = current.status === 'completed' ? 'completed' : 'processing';

    await this.db
      .update(schema.onrampTransactions)
      .set({
        status: nextStatus,
        txHash: signature,
        cryptoAmount: cryptoDecimal,
        cryptoCurrency: 'USDC',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.onrampTransactions.id, rowId),
          or(isNull(schema.onrampTransactions.txHash), eq(schema.onrampTransactions.txHash, signature)),
        ),
      );

    if (nextStatus === 'completed') {
      await this.settlement.creditIfPending(rowId);
    }
  }
}
