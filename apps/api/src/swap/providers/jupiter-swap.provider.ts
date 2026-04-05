import { Injectable } from '@nestjs/common';
import type {
  SwapProvider,
  SwapPreviewParams,
  SwapPreviewResult,
  SwapExecuteParams,
  SwapExecuteResult,
} from '../swap-provider.interface';

/**
 * Jupiter DEX swap provider stub.
 *
 * Phase 3+ implementation. Use Jupiter's Quote API to get live rates and
 * swap via their swap API or the on-chain program directly.
 *
 * Docs: https://station.jup.ag/docs/apis/swap-api
 */
@Injectable()
export class JupiterSwapProvider implements SwapProvider {
  async preview(_params: SwapPreviewParams): Promise<SwapPreviewResult> {
    throw new Error(
      'JupiterSwapProvider is not yet implemented. Set SWAP_PROVIDER=mock for development.',
    );
  }

  async execute(_params: SwapExecuteParams): Promise<SwapExecuteResult> {
    throw new Error(
      'JupiterSwapProvider is not yet implemented. Set SWAP_PROVIDER=mock for development.',
    );
  }
}
