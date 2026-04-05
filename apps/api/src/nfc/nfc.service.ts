import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PaymentRequestsService } from '../payment-requests/payment-requests.service';
import { CreateNfcSessionDto } from './dto/create-nfc-session.dto';

const NFC_SCHEME = 'mcbuse://pay';
const NFC_VERSION = '1';
const DEFAULT_NFC_TTL_SECONDS = 60;
const MAX_NFC_TTL_SECONDS = 3600;

@Injectable()
export class NfcService {
  private readonly logger = new Logger(NfcService.name);

  constructor(
    private readonly paymentRequestsService: PaymentRequestsService,
  ) {}

  /**
   * Create an NFC tap session.
   *
   * Internally creates a dynamic payment request with a short TTL
   * (default 60 s — suitable for tap-to-pay proximity). Returns:
   *   - nfcPayload  : URI string written to the NFC tag / used in HCE
   *   - qrString    : same nonce as a QR deep link (fallback)
   *   - nonce       : raw nonce for the payer's `POST /payments` call
   *   - expiresAt   : ISO 8601 expiry
   */
  async createSession(userId: string, dto: CreateNfcSessionDto) {
    const ttl = Math.min(
      dto.expiresInSeconds ?? DEFAULT_NFC_TTL_SECONDS,
      MAX_NFC_TTL_SECONDS,
    );

    const parsed = BigInt(dto.amount);
    if (parsed <= 0n) throw new BadRequestException('amount must be positive');

    // Reuse PaymentRequestsService to create the underlying record
    const pr = await this.paymentRequestsService.create(userId, {
      type: 'dynamic',
      amount: dto.amount,
      currency: dto.currency,
      description: dto.description,
      expiresInSeconds: ttl,
    });

    const nfcPayload = this.buildNfcPayload(pr.nonce, dto.amount, dto.currency);

    this.logger.log(
      `NFC session created: nonce=${pr.nonce} ttl=${ttl}s userId=${userId}`,
    );

    return {
      id: pr.id,
      nonce: pr.nonce,
      nfcPayload,
      qrString: pr.qrString,
      amount: pr.amount,
      currency: pr.currency,
      description: pr.description,
      expiresAt: pr.expiresAt,
    };
  }

  /**
   * Resolve an NFC tap by nonce.
   * Delegates to PaymentRequestsService — same validation as QR.
   * Returns the payment details so the payer's app can show a confirmation
   * screen before the user approves execution.
   */
  async resolveSession(nonce: string) {
    const resolved = await this.paymentRequestsService.resolve(nonce);
    const nfcPayload = this.buildNfcPayload(
      nonce,
      resolved.amount ?? undefined,
      resolved.currency ?? undefined,
    );
    return { ...resolved, nfcPayload };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Build the NDEF URI record payload.
   *
   * Format: `mcbuse://pay?nonce=<uuid>&v=1[&amount=<bigint>&currency=<USDC|EURC>]`
   *
   * The mobile NFC SDK (Android NdefRecord / iOS CoreNFC) writes this as a
   * URI record (TNF=0x03, type="U"). No base64 encoding needed at API level —
   * the SDK handles NDEF framing.
   */
  private buildNfcPayload(nonce: string, amount?: string, currency?: string): string {
    const params = new URLSearchParams({ nonce, v: NFC_VERSION });
    if (amount) params.set('amount', amount);
    if (currency) params.set('currency', currency);
    return `${NFC_SCHEME}?${params.toString()}`;
  }
}
