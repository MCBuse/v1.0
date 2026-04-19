import Constants from 'expo-constants';
import { Platform } from 'react-native';

const FALLBACK_HOST = Platform.select({
  android: '10.0.2.2',
  default: 'localhost',
});

const FALLBACK_BASE_URL = `http://${FALLBACK_HOST}:4000/api/v1`;

const extra =
  (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string };

export const env = {
  apiBaseUrl:
    process.env.EXPO_PUBLIC_API_BASE_URL ??
    extra.apiBaseUrl ??
    FALLBACK_BASE_URL,
} as const;
