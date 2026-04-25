import type {
  CreateWidgetSessionParams,
  CreateWidgetSessionResult,
  NormalizedOnrampEvent,
} from './onramp-widget.types';

export interface OnrampWidgetProvider {
  readonly providerName: string;

  createWidgetSession(params: CreateWidgetSessionParams): Promise<CreateWidgetSessionResult>;

  /**
   * @param rawBody Raw POST body bytes
   * @param signatureHeader Full `Moonpay-Signature-V2` header value (e.g. `t=...,s=...`)
   */
  verifyWebhook(rawBody: Buffer, signatureHeader: string | undefined): boolean;

  parseWebhook(payload: unknown): NormalizedOnrampEvent;
}

export const ONRAMP_WIDGET_PROVIDERS = 'ONRAMP_WIDGET_PROVIDERS';
