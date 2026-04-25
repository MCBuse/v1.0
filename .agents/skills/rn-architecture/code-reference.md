# RN Architecture — Code Reference

Complete TypeScript/React Native patterns for each architectural piece. Copy and adapt per feature.

---

## 1. RepositoryBase

Handles error mapping and secure/persisted storage helpers. React Query owns in-memory and MMKV caching — repositories are pure fetch + validate functions.

```ts
// src/core/repository/repository-base.ts
import * as SecureStore from 'expo-secure-store';
import { MMKV } from 'react-native-mmkv';
import { NetworkError } from '../errors/network-error';
import {
  OperationFailure,
  ServerOperationFailure,
  UnknownOperationFailure,
} from '../errors/operation-failure';
import { logger } from '../logger/logger';

type AsyncOp<T> = () => Promise<T>;
type SerializableOp = () => Promise<Record<string, unknown>>;
type Deserializer<T> = (data: Record<string, unknown>) => T;

const persistedStorage = new MMKV({ id: 'repo-cache' });

export abstract class RepositoryBase {
  /**
   * Secure cache — encrypted via expo-secure-store.
   * Use for auth tokens, PII, private keys.
   * NOTE: Not cached by React Query — read directly when needed.
   */
  protected async runSecureQuery<T>(
    key: string,
    remoteOnly: boolean,
    operation: SerializableOp,
    deserializer: Deserializer<T>,
  ): Promise<T> {
    return this._runSerializedQuery(key, remoteOnly, operation, deserializer, true);
  }

  /**
   * No cache — direct fetch with typed error mapping.
   * React Query wraps this and owns cache/retry/stale logic.
   */
  protected async runOperation<T>(operation: AsyncOp<T>): Promise<T> {
    try {
      return await operation();
    } catch (e) {
      if (e instanceof NetworkError) {
        throw new ServerOperationFailure({
          message: e.message,
          wrapped: e,
          response: e.rawResponse,
        });
      }
      if (e instanceof OperationFailure) throw e;
      logger.error('Repository operation failed', e);
      throw new UnknownOperationFailure(e);
    }
  }

  /** Clear specific secure/persisted cache keys (call on logout). */
  protected async clearSecure(keys: string[]): Promise<void> {
    await Promise.all(keys.map((k) => SecureStore.deleteItemAsync(k)));
  }

  protected clearPersisted(keys: string[]): void {
    keys.forEach((k) => persistedStorage.delete(k));
  }

  private async _runSerializedQuery<T>(
    key: string,
    remoteOnly: boolean,
    operation: SerializableOp,
    deserializer: Deserializer<T>,
    secure: boolean,
  ): Promise<T> {
    try {
      if (!remoteOnly) {
        try {
          const cached = secure
            ? await SecureStore.getItemAsync(key)
            : persistedStorage.getString(key);
          if (cached != null) return deserializer(JSON.parse(cached));
        } catch (e) {
          logger.warn(`Cache deserialization failed for "${key}": ${e}`);
        }
      }

      const data = await this.runOperation(operation);
      const serialized = JSON.stringify(data);

      if (secure) {
        await SecureStore.setItemAsync(key, serialized);
      } else {
        persistedStorage.set(key, serialized);
      }

      return deserializer(data as Record<string, unknown>);
    } catch (e) {
      if (e instanceof OperationFailure) throw e;
      logger.error('Serialized query failed', e);
      throw new UnknownOperationFailure(e);
    }
  }
}
```

---

## 2. Repository Interface + Implementation

No `remoteOnly` param — React Query decides freshness via `staleTime` and `invalidateQueries`.

```ts
// src/features/savings/repository/savings-account-repository.ts

// Abstract interface — defines the contract
export interface SavingsAccountRepository {
  fetchAccounts(): Promise<SavingsAccount[]>;
  fetchAccount(id: string): Promise<SavingsAccountDetail>;
  createAccount(name: string, subscriptionId: string): Promise<SavingsAccount>;
  editAccount(id: string, name: string, options?: { customColor?: string }): Promise<SavingsAccount>;
}

// Implementation — extends RepositoryBase for error mapping
export class SavingsAccountRepositoryImpl
  extends RepositoryBase
  implements SavingsAccountRepository
{
  private get apiClient() {
    return ServiceLocator.instance.get<ApiClient>(Tokens.ApiClient);
  }

  async fetchAccounts(): Promise<SavingsAccount[]> {
    return this.runOperation(async () => {
      const res = await this.apiClient.query<{ me: { savingsAccounts: unknown[] } }>(
        FETCH_ACCOUNTS_QUERY,
      );
      return res.me.savingsAccounts.map(SavingsAccountSchema.parse);
    });
  }

  async fetchAccount(id: string): Promise<SavingsAccountDetail> {
    return this.runOperation(async () => {
      const res = await this.apiClient.query<{ me: { savingsAccounts: unknown[] } }>(
        FETCH_ACCOUNT_QUERY,
        { id },
      );
      return SavingsAccountDetailSchema.parse(res.me.savingsAccounts[0]);
    });
  }

  // Mutations use runOperation directly — no cache writing
  async createAccount(name: string, subscriptionId: string): Promise<SavingsAccount> {
    return this.runOperation(async () => {
      const res = await this.apiClient.mutate<{ createAccount: { account: unknown } }>(
        CREATE_ACCOUNT_MUTATION,
        { name, subscriptionId },
      );
      return SavingsAccountSchema.parse(res.createAccount.account);
    });
  }

  async editAccount(id: string, name: string, options?: { customColor?: string }): Promise<SavingsAccount> {
    return this.runOperation(async () => {
      const res = await this.apiClient.mutate<{ editAccount: { account: unknown } }>(
        EDIT_ACCOUNT_MUTATION,
        { id, name, customColor: options?.customColor },
      );
      return SavingsAccountSchema.parse(res.editAccount.account);
    });
  }
}
```

---

## 3. ServiceLocator (DI Container)

Typed singleton registry. Supports lazy singletons, eager singletons, and factories.

```ts
// src/core/di/service-locator.ts

// Token registry — use Symbols to avoid string collisions
export const Tokens = {
  ApiClient: Symbol('ApiClient'),
  AuthRepository: Symbol('AuthRepository'),
  SavingsAccountRepository: Symbol('SavingsAccountRepository'),
  WalletsRepository: Symbol('WalletsRepository'),
  GoalsRepository: Symbol('GoalsRepository'),
  NotificationsRepository: Symbol('NotificationsRepository'),
} as const;

type Token = symbol;

class ServiceLocator {
  private static _instance: ServiceLocator;
  private _singletons = new Map<Token, unknown>();
  private _lazySingletonFactories = new Map<Token, () => unknown>();
  private _factories = new Map<Token, () => unknown>();

  static get instance(): ServiceLocator {
    if (!ServiceLocator._instance) {
      ServiceLocator._instance = new ServiceLocator();
    }
    return ServiceLocator._instance;
  }

  /** Created immediately on register. */
  registerSingleton<T>(token: Token, factory: () => T): void {
    this._singletons.set(token, factory());
  }

  /** Created on first get(), cached afterward. */
  registerLazySingleton<T>(token: Token, factory: () => T): void {
    this._lazySingletonFactories.set(token, factory as () => unknown);
  }

  /** New instance on every get(). */
  registerFactory<T>(token: Token, factory: () => T): void {
    this._factories.set(token, factory as () => unknown);
  }

  get<T>(token: Token): T {
    if (this._singletons.has(token)) {
      return this._singletons.get(token) as T;
    }
    if (this._lazySingletonFactories.has(token)) {
      const instance = this._lazySingletonFactories.get(token)!() as T;
      this._singletons.set(token, instance);             // cache after first resolution
      this._lazySingletonFactories.delete(token);
      return instance;
    }
    if (this._factories.has(token)) {
      return this._factories.get(token)!() as T;         // new instance each time
    }
    throw new Error(`ServiceLocator: no registration for token ${String(token)}`);
  }

  /** Swap a registration with a mock — use in tests only. */
  registerMock<T>(token: Token, mock: T): void {
    this._singletons.set(token, mock);
  }
}

export { ServiceLocator };

// src/core/di/init-services.ts
export function initServices(): void {
  const sl = ServiceLocator.instance;

  // Singletons — created immediately
  sl.registerSingleton(Tokens.ApiClient, () => new AxiosApiClient());

  // Lazy singletons — repositories share state, created on first access
  sl.registerLazySingleton(Tokens.AuthRepository, () => new AuthRepositoryImpl());
  sl.registerLazySingleton(Tokens.SavingsAccountRepository, () => new SavingsAccountRepositoryImpl());
  sl.registerLazySingleton(Tokens.WalletsRepository, () => new WalletRepositoryImpl());
  sl.registerLazySingleton(Tokens.GoalsRepository, () => new GoalsRepositoryImpl());

  // Factories — new instance each get() (no shared state needed)
  sl.registerFactory(Tokens.NotificationsRepository, () => new NotificationsRepositoryImpl());
}
```

---

## 4. Zustand Stores (replaces EventBus)

Both stores are writable from outside React — axios interceptors and repositories call `getState()` directly, no hooks needed.

```ts
// src/core/store/overlay-store.ts
import { create } from 'zustand';

interface OverlayState {
  isBusy: boolean;
  setBusy: (busy: boolean) => void;
}

export const useOverlayStore = create<OverlayState>((set) => ({
  isBusy: false,
  setBusy: (busy) => set({ isBusy: busy }),
}));

/**
 * Static helpers — callable from outside React (interceptors, hooks, repos).
 * Both useDataScreen and useOperation call these, not the hook directly.
 */
export const OverlayManager = {
  pageBusy: () => useOverlayStore.getState().setBusy(true),
  pageIdle: () => useOverlayStore.getState().setBusy(false),
};
```

```ts
// src/core/store/app-state-store.ts
import { create } from 'zustand';
import { router } from 'expo-router';

export type AppState = 'unauthenticated' | 'authenticated' | 'maintenance';

interface AppStateStore {
  appState: AppState;
  setAuthenticated: () => void;
  logout: () => void;
  setMaintenance: () => void;
}

export const useAppStateStore = create<AppStateStore>((set) => ({
  appState: 'unauthenticated',

  setAuthenticated: () => set({ appState: 'authenticated' }),

  logout: () => {
    // Clear any sensitive repo caches here if needed
    set({ appState: 'unauthenticated' });
    router.replace('/(guest)/login');
  },

  setMaintenance: () => set({ appState: 'maintenance' }),
}));

/**
 * Static helpers — called from axios interceptors outside React.
 */
export const AppStateManager = {
  onAuthExpired: () => useAppStateStore.getState().logout(),
  onMaintenance: () => useAppStateStore.getState().setMaintenance(),
};
```

**Root layout** driven by app state — changing the store swaps route groups automatically:

```tsx
// app/_layout.tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Slot } from 'expo-router';
import { useEffect } from 'react';
import { initServices } from '@/core/di/init-services';
import { useAppStateStore } from '@/core/store/app-state-store';
import { queryClient } from '@/core/network/query-client';
import { OverlayManager } from '@/components/overlay-manager';

export default function RootLayout() {
  useEffect(() => { initServices(); }, []);

  const appState = useAppStateStore((s) => s.appState);

  return (
    <QueryClientProvider client={queryClient}>
      <OverlayManagerComponent>
        {appState === 'maintenance' && <Redirect href="/(guest)/maintenance" />}
        {appState === 'unauthenticated' && <Redirect href="/(guest)/login" />}
        <Slot />
      </OverlayManagerComponent>
    </QueryClientProvider>
  );
}
```

---

## 5. useDataScreen

Wraps `useQuery` with focus-triggered refetch. Equivalent to Flutter's `DataPage` — screens never write loading state manually.

```ts
// src/core/hooks/use-data-screen.ts
import { useFocusEffect } from '@react-navigation/native';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { logger } from '../logger/logger';

interface UseDataScreenOptions<T> {
  queryKey: QueryKey;
  queryFn: () => Promise<T>;
  /** How long data is fresh before triggering a background refetch. Default: 5 min. */
  staleTime?: number;
  /** Set false to disable the focus-triggered refetch. Default: true. */
  refetchOnFocus?: boolean;
}

export function useDataScreen<T>({
  queryKey,
  queryFn,
  staleTime = 1000 * 60 * 5,
  refetchOnFocus = true,
}: UseDataScreenOptions<T>) {
  const queryClient = useQueryClient();
  const isFirstFocus = useRef(true);

  const query = useQuery({
    queryKey,
    queryFn,
    staleTime,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000), // exp backoff, max 10s
  });

  // Equivalent to FocusDetector.onFocusGained — refetch stale data when screen appears
  useFocusEffect(
    useCallback(() => {
      if (!refetchOnFocus) return;

      // Skip the very first focus (useQuery already fetches on mount)
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }

      if (query.isStale || query.isError) {
        query.refetch().catch((e) => logger.error('Focus refetch failed', e));
      }
    }, [query, refetchOnFocus]),
  );

  return {
    data: query.data,
    isLoading: query.isPending,
    isError: query.isError,
    error: query.error,
    /** Invalidate query — triggers background refetch in this screen and any other consumer. */
    reload: () => queryClient.invalidateQueries({ queryKey }),
  };
}
```

**Typical screen — no initState, no setState for data, no manual loading flags:**

```tsx
// src/features/savings/screens/accounts-screen.tsx
export default function AccountsScreen() {
  const repo = ServiceLocator.instance.get<SavingsAccountRepository>(
    Tokens.SavingsAccountRepository,
  );

  const { data: accounts, isLoading, isError, reload } = useDataScreen({
    queryKey: ['savings-accounts'],
    queryFn: () => repo.fetchAccounts(),
  });

  if (isLoading) return <LoadingScreen />;
  if (isError) return <DataError onRetry={reload} />;

  return (
    <FlatList
      data={accounts}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <AccountCard account={item} />}
    />
  );
}
```

**Composed screens — independent child data, no coordination needed:**

```tsx
// Each child uses its own useDataScreen / useQuery independently.
// When a parent mutation invalidates ['wallet-balance'], BalanceCard refetches automatically.
function BalanceCard() {
  const { data: balance, isLoading } = useDataScreen({
    queryKey: ['wallet-balance'],
    queryFn: () =>
      ServiceLocator.instance.get<WalletRepository>(Tokens.WalletsRepository).getBalance(),
    staleTime: 1000 * 30, // short stale — balance changes frequently
  });

  if (isLoading) return <Skeleton />;
  return <Text>{balance}</Text>;
}
```

---

## 6. useOperation

Wraps async mutations with overlay, analytics, invalidation, and error dialog. Equivalent to Flutter's `OperationRunnerState.runOperation`.

```ts
// src/core/hooks/use-operation.ts
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { OverlayManager } from '../store/overlay-store';
import { logger } from '../logger/logger';
import { OperationFailure } from '../errors/operation-failure';

type OperationFailureHandler = (e: OperationFailure) => Promise<boolean>;

interface RunOperationOptions<T> {
  /** Show global loading overlay. Default: true. */
  showLoader?: boolean;
  /** Query keys to invalidate on success — dependent screens refetch automatically. */
  invalidateKeys?: QueryKey[];
  /**
   * Custom error handler. Return true to suppress the default Alert.
   * Use for business-specific errors (insufficient funds, deactivated account, etc.)
   */
  errorHandler?: OperationFailureHandler;
  onSuccess?: (result: T) => void;
}

export function useOperation() {
  const queryClient = useQueryClient();

  async function runOperation<T>(
    name: string,
    operation: () => Promise<T>,
    options: RunOperationOptions<T> = {},
  ): Promise<T | null> {
    const { showLoader = true, invalidateKeys = [], errorHandler, onSuccess } = options;

    try {
      if (showLoader) OverlayManager.pageBusy();
      logOperationEvent(name, 'started');

      const result = await operation();

      logOperationEvent(name, 'success');

      if (invalidateKeys.length > 0) {
        await Promise.all(
          invalidateKeys.map((key) => queryClient.invalidateQueries({ queryKey: key })),
        );
      }

      onSuccess?.(result);
      return result;
    } catch (e) {
      let message = 'Something went wrong. Please try again.';

      if (e instanceof OperationFailure) {
        message = e.message;
        logOperationEvent(name, 'failed', e.message);
        logger.error(`[operation:${name}] failed`, e);

        // Custom handler — return true to suppress default Alert
        if (errorHandler && (await errorHandler(e))) return null;
      } else {
        logger.error(`[operation:${name}] unexpected error`, e);
      }

      Alert.alert('Error', message);
      return null;
    } finally {
      if (showLoader) OverlayManager.pageIdle();
    }
  }

  return { runOperation };
}

/** Analytics — fires to PostHog, Firebase, Amplitude, etc. */
function logOperationEvent(
  name: string,
  state: 'started' | 'success' | 'failed',
  reason?: string,
) {
  // analytics.track(`operation_${state}`, { name, reason });
  logger.info(`[analytics] operation_${state} name=${name}${reason ? ` reason=${reason}` : ''}`);
}
```

**Usage — user taps "Claim Reward":**

```tsx
const { runOperation } = useOperation();

const handleClaim = async () => {
  const result = await runOperation(
    'claim_reward',
    () => rewardsRepo.claimReward(reward.id),
    {
      invalidateKeys: [['rewards'], ['wallet-balance']],
      onSuccess: () => Toast.show('Reward claimed!'),
    },
  );
  if (result) {
    router.push(AppRoutes.rewardSuccess(result.id));
  }
};
```

**Custom error handler — suppress default alert for known business errors:**

```tsx
await runOperation(
  'create_session',
  () => authRepo.createSession(email, password),
  {
    errorHandler: async (error) => {
      if (!error.message.toLowerCase().includes('deactivated')) return false;
      // Show custom reactivation sheet instead of generic alert
      setShowReactivationSheet(true);
      return true; // true = suppress default Alert
    },
  },
);
```

**Without overlay (background sync, silent retry):**

```tsx
await runOperation('sync_notifications', () => notifRepo.sync(), { showLoader: false });
```

---

## 7. Query Invalidation (replaces PageReloaded EventBus)

Mutations invalidate specific query keys. All `useQuery` / `useDataScreen` hooks with those keys refetch automatically — no coordination, no event bus wiring.

```ts
// Mutation invalidates multiple related queries
await runOperation('update_profile', () => userRepo.updateProfile(data), {
  invalidateKeys: [
    ['profile'],          // profile screen refetches
    ['wallet-balance'],   // balance card refetches
    ['savings-accounts'], // accounts list refetches
  ],
});

// Direct invalidation outside useOperation (e.g. pull-to-refresh)
const queryClient = useQueryClient();
const handleRefresh = () => queryClient.invalidateQueries({ queryKey: ['savings-accounts'] });
```

**Child components — zero wiring needed, just use useDataScreen / useQuery:**

```tsx
// Each child independently subscribes to its query key.
// Parent mutations trigger refetch automatically via invalidation.
// Add, remove, or rearrange child widgets without touching any parent code.

function GoalProgressCard({ goalId }: { goalId: string }) {
  const { data: goal } = useDataScreen({
    queryKey: ['goal', goalId],
    queryFn: () => goalsRepo.fetchGoal(goalId),
  });
  return <ProgressBar value={goal?.progress ?? 0} />;
}

function RecentTransactionsList() {
  const { data: txns } = useDataScreen({
    queryKey: ['transactions', { limit: 5 }],
    queryFn: () => txnRepo.fetchRecent(5),
  });
  return <TransactionList transactions={txns ?? []} />;
}
```

**Pre-seed cache for instant detail navigation (replaces `extra` object pattern):**

```tsx
// In list screen — tap an item
const queryClient = useQueryClient();

const handleAccountPress = (account: SavingsAccount) => {
  // Pre-seed the detail query — detail screen loads instantly, no spinner
  queryClient.setQueryData(['savings-account', account.id], account);
  router.push(AppRoutes.accountDetails(account.id));
};

// In detail screen — data is instantly available from cache,
// background refetch kicks in after staleTime
const { data: account } = useDataScreen({
  queryKey: ['savings-account', id],
  queryFn: () => repo.fetchAccount(id),
  staleTime: 1000 * 30,
});
```

---

## 8. Navigation

Expo Router dual route groups + typed constants. Never hardcode path strings.

```ts
// src/core/navigation/routes.ts
export const GuestRoutes = {
  login: '/(guest)/login' as const,
  register: '/(guest)/register' as const,
  onboarding: '/(guest)/onboarding' as const,
  maintenance: '/(guest)/maintenance' as const,
};

export const AppRoutes = {
  home: '/(app)/(tabs)/' as const,
  accountDetails: (id: string) => `/(app)/savings/${id}` as const,
  goalDetails: (id: string) => `/(app)/goals/${id}` as const,
  payslipDetail: '/(app)/payslips/detail' as const,
  // pushNamed equivalent — user can go back
  push: (path: string) => router.push(path as never),
  // goNamed equivalent — top-level, no back stack
  go: (path: string) => router.replace(path as never),
};
```

**File structure for dual groups:**

```
app/
├── _layout.tsx                ← root: reads useAppStateStore, switches groups
├── (guest)/
│   ├── _layout.tsx            ← stack navigator, no auth required
│   ├── login.tsx
│   ├── register.tsx
│   ├── onboarding.tsx
│   └── maintenance.tsx
└── (app)/
    ├── _layout.tsx            ← protected: redirect to login if not authed
    ├── (tabs)/
    │   ├── _layout.tsx        ← bottom tabs
    │   ├── index.tsx          ← home tab
    │   └── explore.tsx        ← explore tab
    ├── savings/
    │   └── [id].tsx           ← account detail (id in path = deep-linkable)
    ├── goals/
    │   └── [id].tsx
    └── payslips/
        └── detail.tsx
```

**Protected layout — redirect if not authenticated:**

```tsx
// app/(app)/_layout.tsx
import { Redirect, Stack } from 'expo-router';
import { useAppStateStore } from '@/core/store/app-state-store';

export default function AppLayout() {
  const appState = useAppStateStore((s) => s.appState);
  if (appState !== 'authenticated') return <Redirect href={GuestRoutes.login} />;
  return <Stack />;
}
```

**Deep-linkable detail screen with path param:**

```tsx
// app/(app)/goals/[id].tsx
import { useLocalSearchParams } from 'expo-router';

export default function GoalDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const repo = ServiceLocator.instance.get<GoalsRepository>(Tokens.GoalsRepository);

  const { data: goal, isLoading, isError, reload } = useDataScreen({
    queryKey: ['goal', id],
    queryFn: () => repo.fetchGoal(id),
  });

  if (isLoading) return <LoadingScreen />;
  if (isError) return <DataError onRetry={reload} />;

  return <GoalDetail goal={goal} />;
}
```

**What does NOT go in routes:** business state (current step in a flow, active filters, form draft). Use Zustand or local `useState` for those.

---

## 9. Error Handling & Network Client

### ApiClient Interface

```ts
// src/core/network/api-client.ts
export interface ApiClient {
  /** Read operations */
  query<T>(document: string, variables?: Record<string, unknown>): Promise<T>;
  /** Write operations */
  mutate<T>(document: string, variables?: Record<string, unknown>): Promise<T>;
  /** Pause new requests (called during token refresh) */
  pauseRequests(): void;
  /** Resume and drain queued requests */
  resumeRequests(): void;
  cancelRequests(): void;
}
```

### Auth Token Refresh with Request Queue

When a 401 is detected, all in-flight requests are queued. One refresh attempt runs. On success, the queue drains and retries. On failure, logout is triggered.

```ts
// src/core/network/axios-api-client.ts
import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import { AppStateManager } from '../store/app-state-store';
import { NetworkError } from '../errors/network-error';
import { logger } from '../logger/logger';

let isRefreshing = false;
let requestQueue: Array<(token: string) => void> = [];

function onTokenRefreshed(token: string) {
  requestQueue.forEach((cb) => cb(token));
  requestQueue = [];
}

function queueRequest(resolve: (token: string) => void) {
  requestQueue.push(resolve);
}

export function createAxiosInstance(): AxiosInstance {
  const instance = axios.create({
    baseURL: process.env.EXPO_PUBLIC_API_URL,
    timeout: 15_000,
  });

  // Auth header
  instance.interceptors.request.use((config) => {
    const token = getStoredToken(); // read from SecureStore synchronously via MMKV mirror
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  // Auth refresh + error mapping
  instance.interceptors.response.use(
    (res) => res,
    async (error: AxiosError) => {
      const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

      // 503 → maintenance mode
      if (error.response?.status === 503) {
        AppStateManager.onMaintenance();
        return Promise.reject(NetworkError.fromAxios(error));
      }

      // 401 → refresh flow
      if (error.response?.status === 401 && !original._retry) {
        if (isRefreshing) {
          // Queue this request until refresh completes
          return new Promise<unknown>((resolve) => {
            queueRequest((token) => {
              original.headers.Authorization = `Bearer ${token}`;
              resolve(instance(original));
            });
          });
        }

        original._retry = true;
        isRefreshing = true;

        try {
          const newToken = await refreshAuthToken(); // separate axios instance, bypasses interceptor
          await storeToken(newToken);               // write to SecureStore
          onTokenRefreshed(newToken);
          original.headers.Authorization = `Bearer ${newToken}`;
          return instance(original);
        } catch (refreshError) {
          logger.error('Token refresh failed', refreshError);
          requestQueue = [];
          AppStateManager.onAuthExpired(); // → logout → redirect to guest
          return Promise.reject(NetworkError.fromAxios(error));
        } finally {
          isRefreshing = false;
        }
      }

      return Promise.reject(NetworkError.fromAxios(error));
    },
  );

  return instance;
}
```

### App State Transitions from Network Errors

```
401 (first occurrence) → pause queue → refresh token → retry
401 (refresh failed)   → AppStateManager.onAuthExpired() → logout() → /(guest)/login
503                    → AppStateManager.onMaintenance() → appState = 'maintenance'
useAppStateStore       → root _layout.tsx reads appState → renders Redirect automatically
```

---

## 10. Logger

Only errors go to remote services. Debug/info/warn are console-only.

```ts
// src/core/logger/logger.ts
import * as Sentry from '@sentry/react-native';

class AppLogger {
  debug(message: string, ...meta: unknown[]): void {
    if (__DEV__) console.debug(`[DEBUG] ${message}`, ...meta);
  }

  info(message: string, ...meta: unknown[]): void {
    if (__DEV__) console.info(`[INFO] ${message}`, ...meta);
  }

  warn(message: string, ...meta: unknown[]): void {
    console.warn(`[WARN] ${message}`, ...meta);
  }

  /** Sends to Sentry + Crashlytics. Only use for unexpected/actionable errors. */
  error(message: string, error?: unknown): void {
    console.error(`[ERROR] ${message}`, error);

    const err = error instanceof Error ? error : new Error(String(error ?? message));

    // Remote error services
    Sentry.captureException(err, { extra: { message } });
    // crashlytics().recordError(err);
    // posthog.capture('$exception', { message, error: String(error) });
  }
}

export const logger = new AppLogger();
```

---

## 11. NetworkError — Context-Aware Messages

Maps axios errors to user-readable messages. Called by the axios interceptor before errors reach repositories.

```ts
// src/core/errors/network-error.ts
import type { AxiosError } from 'axios';

export class NetworkError extends Error {
  readonly rawResponse: unknown;

  constructor(message: string, rawResponse?: unknown) {
    super(message);
    this.name = 'NetworkError';
    this.rawResponse = rawResponse;
  }

  static fromAxios(error: AxiosError): NetworkError {
    const { code, response, message } = error;

    // Timeout
    if (code === 'ECONNABORTED' || code === 'ERR_CANCELED') {
      return new NetworkError('Request timed out. Please try again.', response?.data);
    }

    // No internet / DNS failure
    if (
      code === 'ERR_NETWORK' ||
      message.includes('Network Error') ||
      message.includes('Failed to fetch')
    ) {
      return new NetworkError(
        'A network error occurred. Please check your connection.',
        response?.data,
      );
    }

    // Server returned a response — extract message if available
    if (response) {
      const serverMsg = extractServerMessage(response.data);
      return new NetworkError(
        serverMsg ?? `Server error (${response.status}). Please try again.`,
        response.data,
      );
    }

    return new NetworkError('Something went wrong. Please try again.');
  }
}

function extractServerMessage(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (typeof d['message'] === 'string') return d['message'];
  if (Array.isArray(d['errors'])) return (d['errors'] as string[]).join('. ');
  if (Array.isArray(d['error'])) return (d['error'] as string[]).join('. ');
  return null;
}
```

---

## 12. Error Hierarchy

```ts
// src/core/errors/operation-failure.ts

export class OperationFailure extends Error {
  readonly wrapped?: unknown;
  readonly response?: unknown;

  constructor({
    message = 'Operation failed',
    wrapped,
    response,
  }: {
    message?: string;
    wrapped?: unknown;
    response?: unknown;
  } = {}) {
    super(message);
    this.name = 'OperationFailure';
    this.wrapped = wrapped;
    this.response = response;
  }

  toString(): string {
    return `${this.name}(${this.wrapped ? `wrapped=${String(this.wrapped)} ` : ''}msg=${this.message})`;
  }
}

/** API call succeeded but server returned a failure response. */
export class ServerOperationFailure extends OperationFailure {
  constructor(args?: ConstructorParameters<typeof OperationFailure>[0]) {
    super({ message: 'Server error. Please try again.', ...args });
    this.name = 'ServerOperationFailure';
  }
}

/** Unexpected JS error — not a known network or server failure. */
export class UnknownOperationFailure extends OperationFailure {
  constructor(wrapped?: unknown) {
    super({ message: 'Something went wrong. Please try again.', wrapped });
    this.name = 'UnknownOperationFailure';
  }
}

/** Local cache read/write failed. */
export class CacheOperationFailure extends OperationFailure {
  constructor(args?: ConstructorParameters<typeof OperationFailure>[0]) {
    super({ message: 'Cache error.', ...args });
    this.name = 'CacheOperationFailure';
  }
}

// Type guard
export function isOperationFailure(e: unknown): e is OperationFailure {
  return e instanceof OperationFailure;
}
```

---

## 13. Zod Model Example

Zod replaces Equatable + `json_annotation`. Schema validates at the API boundary, TypeScript type is inferred — no codegen.

```ts
// src/features/rewards/models/reward.ts
import { z } from 'zod';

// .catch('unknown') mirrors Flutter's @JsonKey(unknownEnumValue: RewardStatus.unknown)
export const RewardStatusSchema = z
  .enum(['available', 'claimed', 'expired'])
  .catch('unknown');

export type RewardStatus = z.infer<typeof RewardStatusSchema> | 'unknown';

export const RewardSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  points: z.number().int().nonnegative(),
  status: RewardStatusSchema,
  createdAt: z.string().datetime({ offset: true }),
});

export type Reward = z.infer<typeof RewardSchema>;

// Call at the API boundary — throws ZodError (caught by runOperation → UnknownOperationFailure)
export const parseReward = (data: unknown): Reward => RewardSchema.parse(data);
export const parseRewardList = (data: unknown): Reward[] => z.array(RewardSchema).parse(data);
```

**Nested model with transformation:**

```ts
export const SavingsAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  balance: z.number(),
  customColor: z.string().nullable().default(null),
  createdAt: z.string().datetime({ offset: true }).transform((s) => new Date(s)),
});

export type SavingsAccount = z.infer<typeof SavingsAccountSchema>;
```

---

## 14. OverlayManager Component

Reads `useOverlayStore`, renders a modal spinner above all content, blocks back navigation while busy.

```tsx
// src/components/overlay-manager.tsx
import { usePreventRemove } from '@react-navigation/native';
import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';
import { useOverlayStore } from '@/core/store/overlay-store';

interface Props {
  children: React.ReactNode;
}

export function OverlayManagerComponent({ children }: Props) {
  const isBusy = useOverlayStore((s) => s.isBusy);

  // Block swipe-back and hardware back while a loader is showing
  usePreventRemove(isBusy, () => {});

  return (
    <>
      {children}
      <Modal
        visible={isBusy}
        transparent
        animationType="fade"
        statusBarTranslucent
        // Prevent dismissal by tapping outside
        onRequestClose={() => {}}
      >
        <View style={styles.backdrop}>
          <View style={styles.spinner}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    padding: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
});
```

---

## 15. Test Example (RNTL)

Test repositories and hooks — not screens. Mock `ApiClient` via `ServiceLocator.registerMock`. Use factory functions for test data.

```ts
// src/features/rewards/__fixtures__/reward-factory.ts
import type { Reward } from '../models/reward';

export const RewardFactory = {
  make: (overrides: Partial<Reward> = {}): Reward => ({
    id: 'reward-1',
    title: 'Test Reward',
    description: null,
    points: 100,
    status: 'available',
    createdAt: new Date().toISOString(),
    ...overrides,
  }),

  makeMany: (count: number, overrides: Partial<Reward> = {}): Reward[] =>
    Array.from({ length: count }, (_, i) =>
      RewardFactory.make({ id: `reward-${i + 1}`, ...overrides }),
    ),
};
```

```ts
// src/features/rewards/__tests__/rewards-repository.test.ts
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { ServiceLocator, Tokens } from '@/core/di/service-locator';
import { RewardsRepositoryImpl } from '../repository/rewards-repository';
import { useDataScreen } from '@/core/hooks/use-data-screen';
import { RewardFactory } from '../__fixtures__/reward-factory';
import type { ApiClient } from '@/core/network/api-client';
import { NetworkError } from '@/core/errors/network-error';
import { ServerOperationFailure } from '@/core/errors/operation-failure';

// ── Mock API client ───────────────────────────────────────────────────────────
const mockApiClient: jest.Mocked<Pick<ApiClient, 'query' | 'mutate'>> = {
  query: jest.fn(),
  mutate: jest.fn(),
};

// ── Wrapper with fresh QueryClient per test ───────────────────────────────────
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  ServiceLocator.instance.registerMock(Tokens.ApiClient, mockApiClient);
  jest.clearAllMocks();
});

// ── Repository unit tests ─────────────────────────────────────────────────────
describe('RewardsRepository', () => {
  test('fetchRewards returns parsed list', async () => {
    const rewards = RewardFactory.makeMany(3);
    mockApiClient.query.mockResolvedValue({ me: { rewards } });

    const repo = new RewardsRepositoryImpl();
    const result = await repo.fetchRewards();

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('reward-1');
    expect(result[0].status).toBe('available');
  });

  test('fetchRewards maps unknown status to "unknown"', async () => {
    const reward = RewardFactory.make({ status: 'legacy_type' as never });
    mockApiClient.query.mockResolvedValue({ me: { rewards: [reward] } });

    const repo = new RewardsRepositoryImpl();
    const [result] = await repo.fetchRewards();

    expect(result.status).toBe('unknown'); // Zod .catch('unknown')
  });

  test('fetchRewards throws ServerOperationFailure on network error', async () => {
    mockApiClient.query.mockRejectedValue(
      new NetworkError('A network error occurred. Please check your connection.'),
    );

    const repo = new RewardsRepositoryImpl();
    await expect(repo.fetchRewards()).rejects.toBeInstanceOf(ServerOperationFailure);
  });

  test('claimReward returns updated reward', async () => {
    const claimed = RewardFactory.make({ status: 'claimed' });
    mockApiClient.mutate.mockResolvedValue({ claimReward: { reward: claimed } });

    const repo = new RewardsRepositoryImpl();
    const result = await repo.claimReward('reward-1');

    expect(result.status).toBe('claimed');
    expect(mockApiClient.mutate).toHaveBeenCalledTimes(1);
  });
});

// ── Hook integration tests ────────────────────────────────────────────────────
describe('useDataScreen with rewards', () => {
  test('transitions from loading → data', async () => {
    const rewards = RewardFactory.makeMany(2);
    mockApiClient.query.mockResolvedValue({ me: { rewards } });

    const repo = new RewardsRepositoryImpl();
    const { result } = renderHook(
      () =>
        useDataScreen({
          queryKey: ['rewards'],
          queryFn: () => repo.fetchRewards(),
        }),
      { wrapper: createWrapper() },
    );

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.isError).toBe(false);
  });

  test('sets isError on failure', async () => {
    mockApiClient.query.mockRejectedValue(
      new NetworkError('A network error occurred. Please check your connection.'),
    );

    const repo = new RewardsRepositoryImpl();
    const { result } = renderHook(
      () =>
        useDataScreen({
          queryKey: ['rewards-error'],
          queryFn: () => repo.fetchRewards(),
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
```

---

## 16. QueryClient Setup (MMKV Persister)

```ts
// src/core/network/query-client.ts
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { persistQueryClient } from '@tanstack/query-persist-client-core';
import { MMKV } from 'react-native-mmkv';

const mmkv = new MMKV({ id: 'rq-persist' });

// MMKV adapter — synchronous reads, async writes to satisfy the persister interface
const mmkvStorageAdapter = {
  getItem: (key: string) => Promise.resolve(mmkv.getString(key) ?? null),
  setItem: (key: string, value: string) => Promise.resolve(mmkv.set(key, value)),
  removeItem: (key: string) => Promise.resolve(mmkv.delete(key)),
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,  // 5 minutes
      gcTime: 1000 * 60 * 60,    // 1 hour
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
    },
  },
});

// Persist non-sensitive queries across app restarts
persistQueryClient({
  queryClient,
  persister: createAsyncStoragePersister({
    storage: mmkvStorageAdapter,
    throttleTime: 1000,
  }),
  maxAge: 1000 * 60 * 60 * 24, // 24 hours
  // Exclude sensitive queries from persistence
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => {
      const key = query.queryKey[0];
      const excluded = ['auth-token', 'user-private', 'wallet-keys'];
      return !excluded.includes(key as string);
    },
  },
});
```
