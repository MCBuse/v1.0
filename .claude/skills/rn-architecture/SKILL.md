---
name: rn-architecture
description: Production React Native / Expo architecture. Feature-based layering with repositories, React Query for server state, Zustand for app state, useDataScreen + useOperation hooks, Expo Router dual-group navigation, and structured error handling. Use when scaffolding new features, repositories, screens, or hooks in a React Native / Expo project.
version: 1.0.0
license: MIT
---

# React Native Production Architecture

A layered, feature-based architecture for production Expo / React Native apps. All patterns have a 1:1 translation from the Flutter reference — adapted for React idioms.

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                  Presentation                    │
│   Screens · useDataScreen · useOperation hooks  │
├─────────────────────────────────────────────────┤
│                Domain / State                    │
│   React Query (server state) · Zustand (app)    │
├─────────────────────────────────────────────────┤
│                    Data                          │
│   Repositories · ApiClient · Zod models         │
└─────────────────────────────────────────────────┘
```

**Data layer** — Repositories fetch data and map errors to typed failures. They know nothing about the UI or cache strategy. Zod schemas validate at the API boundary.

**Domain layer** — React Query owns all server state: caching, background refetch, retries. Zustand owns app-level state: loading overlay and auth/maintenance transitions. Neither layer touches the UI directly.

**Presentation layer** — Screens call `useDataScreen` (read) and `useOperation` (write). They never manage loading state manually, call `setState` for data, or contain business logic.

---

## Core Principles

1. **Screens never manage loading state** — `useDataScreen` returns `{ data, isLoading, isError, reload }`. No `useState` for async data in screens.
2. **Auto-refresh on screen focus** — `useDataScreen` uses `useFocusEffect` to refetch stale data whenever the screen becomes active (navigation back, app foreground, tab switch).
3. **Every user action is tracked** — `useOperation` logs a 3-state analytics event (started → success/failed) around every mutation.
4. **Typed errors end-to-end** — `NetworkError` → `OperationFailure` hierarchy. Every throw is intentional and catchable by type.
5. **Repositories are pure** — No caching, no UI concerns. Just fetch + validate + throw typed errors.
6. **Query invalidation over manual refresh** — Mutations call `queryClient.invalidateQueries()`. Dependent screens and components refetch automatically. No `PageReloaded` event bus needed.
7. **Single source of truth per entity** — One `useQuery` key per resource. All consumers share the same cached value.

---

## Folder Structure

```
src/
├── core/                         # Shared infrastructure (no feature knowledge)
│   ├── di/
│   │   └── service-locator.ts    # Typed DI registry
│   ├── errors/
│   │   ├── network-error.ts      # Axios error → user-friendly message
│   │   └── operation-failure.ts  # Error class hierarchy
│   ├── hooks/
│   │   ├── use-data-screen.ts    # useQuery wrapper + focus refetch
│   │   └── use-operation.ts      # useMutation wrapper + overlay + analytics
│   ├── logger/
│   │   └── logger.ts             # Sentry/Crashlytics on error, console otherwise
│   ├── network/
│   │   ├── api-client.ts         # ApiClient interface
│   │   └── axios-api-client.ts   # Impl: interceptors, token refresh, error mapping
│   ├── repository/
│   │   └── repository-base.ts    # Error mapping + secure/persisted helpers
│   └── store/
│       ├── overlay-store.ts      # Zustand: global loading overlay
│       └── app-state-store.ts    # Zustand: authenticated | unauthenticated | maintenance
│
├── features/                     # One directory per domain feature
│   └── [feature]/
│       ├── __fixtures__/         # Factory functions for tests
│       ├── __tests__/            # Repository + hook tests
│       ├── models/               # Zod schemas + inferred TS types
│       ├── repository/           # interface.ts + impl.ts
│       └── screens/              # Screen components + screen-specific hooks
│
├── components/                   # Shared UI primitives
│   ├── overlay-manager.tsx       # Global overlay (wraps app root)
│   └── data-error.tsx            # Full-screen error + retry button
│
└── app/                          # Expo Router file-based routes
    ├── _layout.tsx               # Root: switches (guest) ↔ (app) on auth state
    ├── (guest)/                  # Unauthenticated screens
    │   ├── _layout.tsx
    │   ├── login.tsx
    │   └── register.tsx
    └── (app)/                    # Authenticated screens (redirect if not authed)
        ├── _layout.tsx
        ├── (tabs)/
        │   ├── _layout.tsx
        │   └── index.tsx
        └── [feature]/
            └── [id].tsx
```

---

## Layer Descriptions

### RepositoryBase

Abstract class all repositories extend. Provides:
- `runOperation<T>()` — wraps any async call, maps errors to typed `OperationFailure`
- `runSecureQuery<T>()` — read/write via `expo-secure-store` (for tokens, PII)
- `clear()` — wipe secure/persisted cache entries on logout

Repositories do **not** cache. React Query decides when to re-fetch.

```ts
class RewardsRepositoryImpl extends RepositoryBase implements RewardsRepository {
  async fetchRewards(): Promise<Reward[]> {
    return this.runOperation(async () => {
      const res = await apiClient.query(FETCH_REWARDS);
      return parseRewardList(res.me.rewards);
    });
  }
}
```

### ServiceLocator

Typed singleton DI registry. Replaces `GetIt`. Supports:
- `registerSingleton` — created immediately
- `registerLazySingleton` — created on first `get()`
- `registerFactory` — new instance on every `get()`
- `registerMock` — for tests

```ts
const repo = ServiceLocator.instance.get<RewardsRepository>(Tokens.RewardsRepository);
```

### Zustand Stores

Two stores replace the EventBus entirely:

**`useOverlayStore`** — `isBusy: boolean`. Both `useDataScreen` and `useOperation` call `OverlayManager.pageBusy()` / `OverlayManager.pageIdle()` which write to this store. The `OverlayManager` component reads it and renders a modal spinner.

**`useAppStateStore`** — `appState: 'authenticated' | 'unauthenticated' | 'maintenance'`. The root `_layout.tsx` reads this to switch route groups. Axios interceptors call `AppStateManager.onAuthExpired()` / `AppStateManager.onMaintenance()` — both are plain function calls that write to the store outside React.

Key property: both stores are writable from **outside React** via `useStore.getState().setter()` — enabling axios interceptors and repository classes to trigger UI-level state changes.

### useDataScreen

Thin wrapper around `useQuery` that:
1. Sets sensible defaults (5-min `staleTime`, 2 retries with backoff)
2. Calls `useFocusEffect` to refetch when screen comes back into focus if data is stale
3. Returns a stable `reload` function (`queryClient.invalidateQueries`)

```ts
const { data, isLoading, isError, reload } = useDataScreen({
  queryKey: ['rewards'],
  queryFn: () => rewardsRepo.fetchRewards(),
});
```

### useOperation

Wrapper around `useMutation`-style async calls that adds:
- Global overlay (`OverlayManager.pageBusy/pageIdle`)
- 3-state analytics (`logOperationEvent(name, 'started' | 'success' | 'failed')`)
- Query invalidation after success (`invalidateKeys`)
- Default `Alert.alert` on error, with opt-out via `errorHandler` callback
- Returns `null` on failure so callers can `if (result)` guard

```ts
const { runOperation } = useOperation();

const result = await runOperation('claim_reward', () => repo.claimReward(id), {
  invalidateKeys: [['rewards']],
});
if (result) { /* success */ }
```

### OverlayManager Component

Wraps the app root (inside `QueryClientProvider`). Reads `useOverlayStore` and renders a transparent `Modal` with a spinner on top of all content. Blocks back navigation while busy via `usePreventRemove`.

```tsx
// app/_layout.tsx
<QueryClientProvider client={queryClient}>
  <OverlayManager>
    <Slot />
  </OverlayManager>
</QueryClientProvider>
```

---

## Caching Strategy

| Tier | Mechanism | Survives restart | Encrypted | Use for |
|---|---|---|---|---|
| In-memory | React Query `QueryClient` | No | No | All server data by default |
| Persisted | `persistQueryClient` + MMKV adapter | Yes | No | Non-sensitive data (lists, profiles) |
| Secure | `expo-secure-store` via `runSecureQuery` | Yes | Yes | Auth tokens, PII, keys |

**React Query controls cache freshness** — `staleTime`, `gcTime`, and `invalidateQueries` replace the Flutter `remoteOnly: bool` parameter. To force a remote fetch: `queryClient.invalidateQueries({ queryKey })` or `refetch()`.

---

## Navigation

Expo Router file-based routing with two route groups:

```
(guest)/  — login, register, onboarding. No auth required.
(app)/    — all authenticated screens. Redirects to (guest) if not authed.
```

Auth state drives the root layout — changing `appState` in `useAppStateStore` automatically swaps route groups and clears the navigation stack.

**Rules:**
- Always use the `Routes` constants, never hardcode paths
- IDs go in the path (`/goals/[id]`) — bookmarkable, deep-linkable
- Pass full objects via React Query cache pre-seeding (`queryClient.setQueryData`) for instant detail navigation with fallback fetch
- Business state (flow steps, active filters) lives in Zustand or local state, never in routes

---

## Error Handling Flow

```
API call fails
  → axios ErrorInterceptor maps AxiosError → NetworkError (user message)
  → axios AuthInterceptor catches 401 → pause queue → refresh token → retry
  → axios MaintenanceInterceptor catches 503 → AppStateManager.onMaintenance()
  → RepositoryBase.runOperation() wraps NetworkError → ServerOperationFailure
  → useDataScreen: sets isError = true, shows DataError with retry
  → useOperation: catches OperationFailure → logs analytics → Alert.alert (or custom handler)
  → logger.error() → Sentry.captureException + Crashlytics.recordError
```

Token refresh uses a **request queue**: when a 401 is detected, all in-flight requests are queued. A single refresh attempt runs. On success, the queue drains and retries. On failure, `AppStateManager.onAuthExpired()` triggers logout.

---

## Testing Strategy

Test repositories and hooks — not screens. Screens are thin wrappers; the logic lives in the repo and hooks.

**Pattern:**
1. Register mock `ApiClient` in `ServiceLocator` via `registerMock`
2. Use factory functions (not fixtures files) to generate test data
3. Wrap every `renderHook` with `createWrapper()` — a `QueryClientProvider` with `retry: false`
4. Use `waitFor` to resolve async query states

```ts
function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
```

**What to test per feature:**
- Repository: each method returns correctly parsed data; throws `OperationFailure` on API error
- `useDataScreen` usage: `isLoading` → `data` lifecycle; `isError` on failure
- `useOperation` usage: success path invalidates correct keys; error path calls `errorHandler`

---

## Dependencies

```json
{
  "dependencies": {
    "@tanstack/react-query": "^5.x",
    "@tanstack/query-persist-client-core": "^5.x",
    "@tanstack/query-async-storage-persister": "^5.x",
    "react-native-mmkv": "^3.x",
    "expo-secure-store": "^14.x",
    "axios": "^1.x",
    "zustand": "^5.x",
    "zod": "^3.x",
    "expo-router": "^4.x",
    "@react-navigation/native": "^7.x",
    "@sentry/react-native": "^6.x"
  },
  "devDependencies": {
    "@testing-library/react-native": "^13.x",
    "@testing-library/jest-native": "^5.x",
    "jest": "^29.x"
  }
}
```

**MMKV note:** `react-native-mmkv` requires a dev client (not Expo Go). Use `expo-dev-client` or EAS Build.

---

## Setup Checklist

1. Install dependencies above
2. Create `src/core/` structure (copy from `code-reference.md`)
3. Implement `RepositoryBase`, `ServiceLocator`, Zustand stores, error hierarchy
4. Implement `ApiClient` + axios instance with interceptor chain
5. Implement `useDataScreen` and `useOperation` hooks
6. Wrap root layout with `QueryClientProvider` + `OverlayManager`
7. Wire root `_layout.tsx` to `useAppStateStore` for auth-driven routing
8. Call `initServices()` in `app/_layout.tsx` before rendering
9. Add MMKV persister to `QueryClient` for offline-capable queries
10. For each feature: create `models/`, `repository/`, `__fixtures__/`, `__tests__/`, `screens/`
