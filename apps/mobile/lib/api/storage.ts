import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ACCESS_TOKEN_KEY  = 'mcbuse.auth.accessToken';
const REFRESH_TOKEN_KEY = 'mcbuse.auth.refreshToken';

export type AuthTokens = {
  accessToken:  string;
  refreshToken: string;
};

// Web fallback: in-memory storage (not vulnerable to XSS, but lost on page reload)
// For production web, use HttpOnly cookies set by the server instead.
let _memStore: Record<string, string> = {};

const webStorage = {
  getItem: (key: string): string | null => _memStore[key] ?? null,
  setItem: (key: string, value: string): void => { _memStore[key] = value; },
  removeItem: (key: string): void => { delete _memStore[key]; },
};

export const tokenStorage = {
  async load(): Promise<AuthTokens | null> {
    if (Platform.OS === 'web') {
      const accessToken = webStorage.getItem(ACCESS_TOKEN_KEY);
      const refreshToken = webStorage.getItem(REFRESH_TOKEN_KEY);
      if (!accessToken || !refreshToken) return null;
      return { accessToken, refreshToken };
    }

    const [accessToken, refreshToken] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    ]);
    if (!accessToken || !refreshToken) return null;
    return { accessToken, refreshToken };
  },

  async save(tokens: AuthTokens): Promise<void> {
    if (Platform.OS === 'web') {
      webStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
      webStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
      return;
    }

    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY,  tokens.accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
    ]);
  },

  async clear(): Promise<void> {
    if (Platform.OS === 'web') {
      webStorage.removeItem(ACCESS_TOKEN_KEY);
      webStorage.removeItem(REFRESH_TOKEN_KEY);
      return;
    }

    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    ]);
  },
};
