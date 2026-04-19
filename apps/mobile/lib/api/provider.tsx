import { QueryClientProvider } from '@tanstack/react-query';
import React, { useEffect, useRef, useState } from 'react';

import { useAppStore } from '@/store/app-store';
import { setOnAuthExpired } from './client';
import { createQueryClient } from './query-client';
import { authSession } from './session';

type Props = { children: React.ReactNode };

/**
 * Boots the data layer:
 *   1. Rehydrates auth tokens from SecureStore.
 *   2. Flips the app-store into the right auth state BEFORE any screen mounts.
 *   3. Registers the "auth expired" callback so axios interceptors can log out.
 *   4. Provides the shared QueryClient to the tree.
 *
 * Children render only after hydration — this prevents a flicker of the
 * (guest) stack for users that are actually signed in.
 */
export function ApiProvider({ children }: Props) {
  const [ready, setReady] = useState(false);
  const clientRef = useRef(createQueryClient());

  const setIsAuthenticated = useAppStore((s) => s.setIsAuthenticated);
  const signOut            = useAppStore((s) => s.signOut);

  useEffect(() => {
    let cancelled = false;

    setOnAuthExpired(() => {
      clientRef.current.clear();
      signOut();
    });

    authSession.hydrate().then((tokens) => {
      if (cancelled) return;
      setIsAuthenticated(Boolean(tokens));
      setReady(true);
    });

    return () => {
      cancelled = true;
      setOnAuthExpired(null);
    };
  }, [setIsAuthenticated, signOut]);

  if (!ready) return null;

  return (
    <QueryClientProvider client={clientRef.current}>
      {children}
    </QueryClientProvider>
  );
}
