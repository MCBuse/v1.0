import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  SwapProvider,
  SwapPreviewParams,
  SwapPreviewResult,
  SwapExecuteParams,
  SwapExecuteResult,
} from '../swap-provider.interface';

/**
 * Fixed-rate mock swap provider.
 *
 * Rates (approximate mid-market, no fee):
 *   USDC → EURC : 0.92  (numerator 92, denominator 100)
 *   EURC → USDC : 1.09  (numerator 109, denominator 100)
 *
 * Both amounts use 6-decimal base units (same as USDC / EURC on Solana).
 */
@Injectable()
export class MockSwapProvider implements SwapProvider {
  /** Returns { numerator, denominator, rateStr } for a given currency pair. */
  private getRate(
    from: string,
    to: string,
  ): { numerator: bigint; denominator: bigint; rateStr: string } {
    if (from === 'USDC' && to === 'EURC') {
      return { numerator: 92n, denominator: 100n, rateStr: '0.92' };
    }
    if (from === 'EURC' && to === 'USDC') {
      return { numerator: 109n, denominator: 100n, rateStr: '1.09' };
    }
    throw new Error(`Unsupported swap pair: ${from} → ${to}`);
  }

  async preview(params: SwapPreviewParams): Promise<SwapPreviewResult> {
    const { numerator, denominator, rateStr } = this.getRate(
      params.fromCurrency,
      params.toCurrency,
    );
    const toAmount = (params.fromAmount * numerator) / denominator;

    return {
      fromCurrency: params.fromCurrency,
      toCurrency: params.toCurrency,
      fromAmount: params.fromAmount,
      toAmount,
      rate: rateStr,
      fee: 0n,
      feeCurrency: params.fromCurrency,
    };
  }

  async execute(params: SwapExecuteParams): Promise<SwapExecuteResult> {
    const preview = await this.preview(params);

    return {
      fromCurrency: preview.fromCurrency,
      toCurrency: preview.toCurrency,
      fromAmount: preview.fromAmount,
      toAmount: preview.toAmount,
      fee: preview.fee,
      feeCurrency: preview.feeCurrency,
      externalId: `mock_swap_${randomUUID()}`,
      status: 'completed',
    };
  }
}
