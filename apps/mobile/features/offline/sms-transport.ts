import * as SMS from 'expo-sms';
import { Platform } from 'react-native';

import {
  encodeInstructionCompact,
  splitForSms,
} from '@/lib/crypto/encoding';

import type { PaymentInstruction } from './models';

export interface SmsTransportResult {
  success: boolean;
  parts: number;
  error?: string;
}

let demoMode = false;
let demoCallback: ((instruction: PaymentInstruction) => void) | null = null;

export function enableDemoSmsTransport(
  callback?: (instruction: PaymentInstruction) => void,
) {
  demoMode = true;
  demoCallback = callback ?? null;
}

export function disableDemoSmsTransport() {
  demoMode = false;
  demoCallback = null;
}

export async function sendPaymentInstructionViaSms(
  instruction: PaymentInstruction,
  recipientNumber: string,
): Promise<SmsTransportResult> {
  if (demoMode) {
    demoCallback?.(instruction);
    const encoded = encodeInstructionCompact(instruction);
    const parts = splitForSms(encoded);
    return { success: true, parts: parts.length };
  }

  const isAvailable = await SMS.isAvailableAsync();
  if (!isAvailable) {
    return {
      success: false,
      parts: 0,
      error: 'SMS is not available on this device',
    };
  }

  const encoded = encodeInstructionCompact(instruction);
  const parts = splitForSms(encoded);

  if (Platform.OS === 'android') {
    for (const part of parts) {
      const { result } = await SMS.sendSMSAsync([recipientNumber], part);
      if (result === 'cancelled') {
        return { success: false, parts: 0, error: 'SMS cancelled by user' };
      }
    }
    return { success: true, parts: parts.length };
  }

  // iOS: pre-filled composer (user must confirm)
  const fullMessage = parts.join('\n');
  const { result } = await SMS.sendSMSAsync([recipientNumber], fullMessage);
  return {
    success: result !== 'cancelled',
    parts: parts.length,
    error: result === 'cancelled' ? 'SMS cancelled by user' : undefined,
  };
}

export const INFRASTRUCTURE_SMS_NUMBER_KEY = 'mcbuse_infra_sms_number';
export const DEFAULT_DEMO_SMS_NUMBER = '+1234567890';
