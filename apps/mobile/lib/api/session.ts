import { tokenStorage, type AuthTokens } from './storage';

/**
 * In-memory token cache. Axios interceptors read synchronously from here so
 * every request carries the latest access token without awaiting SecureStore.
 *
 * Keep this module framework-agnostic — UI state lives in Zustand (app-store).
 */
type Listener = (tokens: AuthTokens | null) => void;

let current: AuthTokens | null = null;
let hydrated = false;
const listeners = new Set<Listener>();

export const authSession = {
  async hydrate(): Promise<AuthTokens | null> {
    if (hydrated) return current;
    current  = await tokenStorage.load();
    hydrated = true;
    return current;
  },

  get(): AuthTokens | null {
    return current;
  },

  isHydrated(): boolean {
    return hydrated;
  },

  async set(tokens: AuthTokens): Promise<void> {
    current = tokens;
    await tokenStorage.save(tokens);
    for (const fn of listeners) fn(current);
  },

  async clear(): Promise<void> {
    current = null;
    await tokenStorage.clear();
    for (const fn of listeners) fn(null);
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};
