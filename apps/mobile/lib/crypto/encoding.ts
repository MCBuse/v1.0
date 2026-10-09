import type { PaymentInstruction } from '@/features/offline/models';

const SMS_MAX_LENGTH = 160;
const MULTIPART_PREFIX_LENGTH = 6; // "X/Y|" prefix e.g. "1/3|"

const BASE64URL_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function uint8ArrayToBase64url(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;

    result += BASE64URL_CHARS[(b0 >> 2) & 0x3f];
    result += BASE64URL_CHARS[((b0 << 4) | (b1 >> 4)) & 0x3f];
    if (i + 1 < bytes.length) {
      result += BASE64URL_CHARS[((b1 << 2) | (b2 >> 6)) & 0x3f];
    }
    if (i + 2 < bytes.length) {
      result += BASE64URL_CHARS[b2 & 0x3f];
    }
  }
  return result;
}

function base64urlToUint8Array(str: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i += 4) {
    const c0 = BASE64URL_CHARS.indexOf(str[i]!);
    const c1 = i + 1 < str.length ? BASE64URL_CHARS.indexOf(str[i + 1]!) : 0;
    const c2 = i + 2 < str.length ? BASE64URL_CHARS.indexOf(str[i + 2]!) : 0;
    const c3 = i + 3 < str.length ? BASE64URL_CHARS.indexOf(str[i + 3]!) : 0;

    bytes.push(((c0 << 2) | (c1 >> 4)) & 0xff);
    if (i + 2 < str.length) bytes.push(((c1 << 4) | (c2 >> 2)) & 0xff);
    if (i + 3 < str.length) bytes.push(((c2 << 6) | c3) & 0xff);
  }
  return new Uint8Array(bytes);
}

export function encodeInstructionCompact(
  instruction: PaymentInstruction,
): string {
  // Compact binary-like format: pipe-delimited fields, then base64url
  const fields = [
    instruction.version.toString(),
    instruction.paymentId,
    instruction.payerWalletId,
    instruction.payeeId,
    instruction.stablecoinTicker,
    instruction.amount,
    instruction.offlineAllowanceId ?? '',
    instruction.nonce.toString(),
    instruction.timestamp.toString(),
    instruction.expiresAt.toString(),
    instruction.signature,
  ];
  const raw = fields.join('|');
  const encoded = new TextEncoder().encode(raw);
  return 'MCBP:' + uint8ArrayToBase64url(encoded);
}

export function decodeInstructionCompact(
  encoded: string,
): PaymentInstruction | null {
  try {
    if (!encoded.startsWith('MCBP:')) return null;
    const b64 = encoded.slice(5);
    const bytes = base64urlToUint8Array(b64);
    const raw = new TextDecoder().decode(bytes);
    const fields = raw.split('|');
    if (fields.length < 11) return null;

    return {
      version: 1,
      paymentId: fields[1]!,
      payerWalletId: fields[2]!,
      payeeId: fields[3]!,
      stablecoinTicker: fields[4]!,
      amount: fields[5]!,
      offlineAllowanceId: fields[6] || null,
      nonce: parseInt(fields[7]!, 10),
      timestamp: parseInt(fields[8]!, 10),
      expiresAt: parseInt(fields[9]!, 10),
      signature: fields[10]!,
    };
  } catch {
    return null;
  }
}

export function splitForSms(encoded: string): string[] {
  if (encoded.length <= SMS_MAX_LENGTH) return [encoded];

  const usable = SMS_MAX_LENGTH - MULTIPART_PREFIX_LENGTH;
  const parts = Math.ceil(encoded.length / usable);
  const result: string[] = [];

  for (let i = 0; i < parts; i++) {
    const chunk = encoded.slice(i * usable, (i + 1) * usable);
    result.push(`${i + 1}/${parts}|${chunk}`);
  }
  return result;
}

export function reassembleFromSms(parts: string[]): string | null {
  try {
    const parsed = parts
      .map((p) => {
        const sepIdx = p.indexOf('|');
        if (sepIdx === -1) return { index: 0, total: 1, data: p };
        const header = p.slice(0, sepIdx);
        const [indexStr, totalStr] = header.split('/');
        return {
          index: parseInt(indexStr!, 10) - 1,
          total: parseInt(totalStr!, 10),
          data: p.slice(sepIdx + 1),
        };
      })
      .sort((a, b) => a.index - b.index);

    if (parsed.length !== parsed[0]?.total) return null;

    return parsed.map((p) => p.data).join('');
  } catch {
    return null;
  }
}
