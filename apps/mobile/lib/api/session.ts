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
// False while a sign-in awaits email verification: those tokens live in
// memory only, so killing the app mid-verification leaves nothing to resume.
let persisted = true;
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
    persisted = true;
    await tokenStorage.save(tokens);
    for (const fn of listeners) fn(current);
  },

  /** Unverified sign-in: usable for requests, never written to storage. */
  setTransient(tokens: AuthTokens): void {
    current = tokens;
    persisted = false;
    for (const fn of listeners) fn(current);
  },

  /** Refresh-token rotation: keeps the session's persisted/transient mode. */
  async rotate(tokens: AuthTokens): Promise<void> {
    current = tokens;
    if (persisted) await tokenStorage.save(tokens);
    for (const fn of listeners) fn(current);
  },

  async clear(): Promise<void> {
    current = null;
    persisted = true;
    await tokenStorage.clear();
    for (const fn of listeners) fn(null);
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};
