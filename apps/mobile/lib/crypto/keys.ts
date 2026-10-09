import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const OFFLINE_KEYPAIR_KEY = 'mcbuse_offline_keypair';
const OFFLINE_PUBKEY_KEY = 'mcbuse_offline_pubkey';

export interface OfflineKeypair {
  publicKey: string;
  secretKey: string;
}

export async function storeOfflineKeypair(keypair: OfflineKeypair): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('Secure key storage not available on web');
  }
  await SecureStore.setItemAsync(
    OFFLINE_KEYPAIR_KEY,
    keypair.secretKey,
    { requireAuthentication: false },
  );
  await SecureStore.setItemAsync(
    OFFLINE_PUBKEY_KEY,
    keypair.publicKey,
    { requireAuthentication: false },
  );
}

export async function getOfflineKeypair(): Promise<OfflineKeypair | null> {
  if (Platform.OS === 'web') return null;
  const secretKey = await SecureStore.getItemAsync(OFFLINE_KEYPAIR_KEY);
  const publicKey = await SecureStore.getItemAsync(OFFLINE_PUBKEY_KEY);
  if (!secretKey || !publicKey) return null;
  return { publicKey, secretKey };
}

export async function hasOfflineKeypair(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const key = await SecureStore.getItemAsync(OFFLINE_KEYPAIR_KEY);
  return key !== null;
}

export async function clearOfflineKeypair(): Promise<void> {
  if (Platform.OS === 'web') return;
  await SecureStore.deleteItemAsync(OFFLINE_KEYPAIR_KEY);
  await SecureStore.deleteItemAsync(OFFLINE_PUBKEY_KEY);
}
