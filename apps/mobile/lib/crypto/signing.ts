import { createPaymentInstructionPayload } from '@/features/offline/models';
import type { PaymentInstruction } from '@/features/offline/models';

// ASSUMPTION: For the hackathon MVP, we use HMAC-SHA256 via SubtleCrypto (available
// in Hermes/JSC via expo-crypto polyfill or the global crypto object).
// In production, this should be Ed25519 from the actual Solana custodial keypair.
// The signing interface is the same regardless of algorithm.

export interface SigningProvider {
  sign(payload: Uint8Array, secretKey: string): Promise<string>;
  verify(payload: Uint8Array, signature: string, publicKey: string): Promise<boolean>;
}

function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function toBuffer(arr: Uint8Array): ArrayBuffer {
  return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer;
}

async function importKey(keyHex: string): Promise<CryptoKey> {
  const keyData = hexToUint8Array(keyHex.slice(0, 64));
  return crypto.subtle.importKey(
    'raw',
    toBuffer(keyData),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export const hmacSigningProvider: SigningProvider = {
  async sign(payload: Uint8Array, secretKey: string): Promise<string> {
    const key = await importKey(secretKey);
    const sig = await crypto.subtle.sign('HMAC', key, toBuffer(payload));
    return uint8ArrayToHex(new Uint8Array(sig));
  },

  async verify(
    payload: Uint8Array,
    signature: string,
    publicKey: string,
  ): Promise<boolean> {
    const key = await importKey(publicKey);
    const sigBytes = hexToUint8Array(signature);
    return crypto.subtle.verify('HMAC', key, toBuffer(sigBytes), toBuffer(payload));
  },
};

let activeProvider: SigningProvider = hmacSigningProvider;

export function setSigningProvider(provider: SigningProvider) {
  activeProvider = provider;
}

export async function signPaymentInstruction(
  instruction: Omit<PaymentInstruction, 'version' | 'signature'>,
  secretKey: string,
): Promise<string> {
  const payload = createPaymentInstructionPayload(instruction);
  return activeProvider.sign(payload, secretKey);
}

export async function verifyPaymentInstruction(
  instruction: PaymentInstruction,
  publicKey: string,
): Promise<boolean> {
  const payload = createPaymentInstructionPayload(instruction);
  return activeProvider.verify(payload, instruction.signature, publicKey);
}
