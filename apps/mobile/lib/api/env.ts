import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = 4000;
const API_PREFIX = 'api/v1';

const EMULATOR_HOST = Platform.select({
  android: '10.0.2.2',
  default: '192.168.0.166',
});

const FALLBACK_BASE_URL = `http://${EMULATOR_HOST}:${API_PORT}/${API_PREFIX}`;

const extra =
  (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string };

const expoConfig = Constants.expoConfig as
  | (typeof Constants.expoConfig & {
    hostUri?: string;
    debuggerHost?: string;
  })
  | null;

function normalizeBaseUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\/+$/, '');
}

function hostFromExpo(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const host = value.split(':')[0];
  if (!host || host === 'localhost' || host === '127.0.0.1') return undefined;
  return host;
}

function devServerApiBaseUrl(): string | undefined {
  const host = hostFromExpo(expoConfig?.hostUri ?? expoConfig?.debuggerHost);
  return host ? `http://${host}:${API_PORT}/${API_PREFIX}` : undefined;
}

const apiBaseUrl =
  normalizeBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL) ??
  normalizeBaseUrl(extra.apiBaseUrl) ??
  devServerApiBaseUrl() ??
  FALLBACK_BASE_URL;

export const env = {
  apiBaseUrl,
} as const;
