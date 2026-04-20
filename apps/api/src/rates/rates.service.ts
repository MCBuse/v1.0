import { HttpService } from '@nestjs/axios';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

export interface RateResult {
  from: string;
  to: string;
  rate: number;
  inverseRate: number;
  updatedAt: string;
}

export interface RatesSnapshot {
  USDC_TO_EURC: RateResult; // = USD/EUR
  EURC_TO_USDC: RateResult; // = EUR/USD
  USD_TO_EUR: RateResult;
  EUR_TO_USD: RateResult;
  USD_TO_GHS: RateResult;
  GHS_TO_USD: RateResult;
  fetchedAt: string;
}

export interface FrankfurterResponse {
  date: string;
  base: 'EUR' | 'USD' | 'GHS';
  quote: 'EUR' | 'USD' | 'GHS';
  rate: number;
}

@Injectable()
export class RatesService implements OnModuleInit {
  private readonly logger = new Logger(RatesService.name);
  private cache: RatesSnapshot | null = null;

  // Frankfurter = European Central Bank data. Free. No API key.
  private readonly BASE_URL = 'https://api.frankfurter.dev/v2';

  constructor(private readonly http: HttpService) {}

  // Warm cache immediately on startup
  async onModuleInit() {
    await this.refresh();
  }

  // Refresh every 30 minutes — ECB rates update once daily
  // No point hitting it every 5 minutes
  @Cron(CronExpression.EVERY_30_MINUTES)
  async refresh(): Promise<void> {
    try {
      const { data } = await firstValueFrom<{ data: FrankfurterResponse[] }>(
        this.http.get(`${this.BASE_URL}/rates`, {
          params: { base: 'USD', quotes: 'EUR,GHS' },
        }),
      );

      const usdToEur: number =
        data.find((r) => r.base === 'USD' && r.quote === 'EUR')?.rate || 0;
      const usdToGhs: number =
        data.find((r) => r.base === 'USD' && r.quote === 'GHS')?.rate || 0;

      const now = new Date().toISOString();

      this.cache = {
        // USDC→EURC is identical to USD→EUR
        // because 1 USDC = $1 and 1 EURC = €1
        USDC_TO_EURC: this.pair('USDC', 'EURC', usdToEur, now),
        EURC_TO_USDC: this.pair('EURC', 'USDC', 1 / usdToEur, now),
        USD_TO_EUR: this.pair('USD', 'EUR', usdToEur, now),
        EUR_TO_USD: this.pair('EUR', 'USD', 1 / usdToEur, now),
        USD_TO_GHS: this.pair('USD', 'GHS', usdToGhs, now),
        GHS_TO_USD: this.pair('GHS', 'USD', 1 / usdToGhs, now),
        fetchedAt: now,
      };

      this.logger.log(
        `Rates refreshed — 1 USDC = ${usdToEur.toFixed(4)} EURC | 1 USD = ${usdToGhs.toFixed(2)} GHS`,
      );
    } catch (err) {
      // Keep stale cache — never return nothing
      this.logger.error('Rate refresh failed, keeping stale cache', err);
    }
  }

  getAll(): RatesSnapshot {
    if (!this.cache) throw new Error('Rates not yet loaded');
    return this.cache;
  }

  getRate(from: string, to: string): number {
    const snapshot = this.getAll();
    const key = `${from}_TO_${to}` as keyof RatesSnapshot;
    const entry = snapshot[key] as RateResult | undefined;
    if (!entry) throw new Error(`No rate for ${from}→${to}`);
    return entry.rate;
  }

  // Used by swap screen: show user what they'll get before confirming
  preview(amount: number, from: string, to: string, feePct = 0.005) {
    const rate = this.getRate(from, to);
    const grossOutput = amount * rate;
    const fee = grossOutput * feePct;

    return {
      from,
      to,
      amount,
      rate: +rate.toFixed(6),
      grossOutput: +grossOutput.toFixed(6),
      fee: +fee.toFixed(6),
      estimatedOutput: +(grossOutput - fee).toFixed(6),
      feePct,
      rateDisplay: `1 ${from} = ${rate.toFixed(4)} ${to}`,
    };
  }

  private pair(
    from: string,
    to: string,
    rate: number,
    updatedAt: string,
  ): RateResult {
    return {
      from,
      to,
      rate: +rate.toFixed(6),
      inverseRate: +(1 / rate).toFixed(6),
      updatedAt,
    };
  }
}
