import { Platform } from 'react-native';

import {
  encodeInstructionCompact,
  decodeInstructionCompact,
} from '@/lib/crypto/encoding';

import type { PaymentInstruction } from './models';

// Lazy import to avoid crash on iOS/web where NFC may not be available
let NfcManager: typeof import('react-native-nfc-manager').default | null = null;
let Ndef: typeof import('react-native-nfc-manager').Ndef | null = null;

async function loadNfc() {
  if (Platform.OS !== 'android') return false;
  try {
    const mod = await import('react-native-nfc-manager');
    NfcManager = mod.default;
    Ndef = mod.Ndef;
    return true;
  } catch {
    return false;
  }
}

export async function isNfcAvailable(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const loaded = await loadNfc();
  if (!loaded || !NfcManager) return false;
  try {
    const supported = await NfcManager.isSupported();
    if (!supported) return false;
    await NfcManager.start();
    return true;
  } catch {
    return false;
  }
}

export async function writeInstructionToNfc(
  instruction: PaymentInstruction,
): Promise<boolean> {
  if (!NfcManager || !Ndef) return false;
  try {
    const encoded = encodeInstructionCompact(instruction);
    const { NfcTech } = await import('react-native-nfc-manager');
    await NfcManager.requestTechnology(NfcTech.Ndef);
    const bytes = Ndef.encodeMessage([Ndef.textRecord(encoded)]);
    if (bytes) {
      await NfcManager.ndefHandler.writeNdefMessage(bytes);
    }
    await NfcManager.cancelTechnologyRequest();
    return true;
  } catch {
    try {
      await NfcManager.cancelTechnologyRequest();
    } catch {
      // ignore cleanup errors
    }
    return false;
  }
}

export async function readInstructionFromNfc(): Promise<PaymentInstruction | null> {
  if (!NfcManager || !Ndef) return null;
  try {
    const { NfcTech } = await import('react-native-nfc-manager');
    await NfcManager.requestTechnology(NfcTech.Ndef);
    const tag = await NfcManager.getTag();
    await NfcManager.cancelTechnologyRequest();

    if (!tag?.ndefMessage?.length) return null;

    const record = tag.ndefMessage[0];
    if (!record?.payload) return null;

    const text = Ndef.text.decodePayload(
      new Uint8Array(record.payload),
    );
    if (!text) return null;

    return decodeInstructionCompact(text);
  } catch {
    try {
      await NfcManager.cancelTechnologyRequest();
    } catch {
      // ignore cleanup errors
    }
    return null;
  }
}
