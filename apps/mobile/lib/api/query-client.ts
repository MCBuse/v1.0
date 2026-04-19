import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './errors';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime:             60_000,      // 1 min
        gcTime:                5 * 60_000,  // 5 min
        refetchOnWindowFocus:  false,       // handled manually via focus hook
        retry: (failureCount, error) => {
          // Don't retry auth / client errors — only transient network/server.
          if (error instanceof ApiError) {
            if (error.kind === 'network' || error.kind === 'server') {
              return failureCount < 2;
            }
            return false;
          }
          return failureCount < 2;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}
