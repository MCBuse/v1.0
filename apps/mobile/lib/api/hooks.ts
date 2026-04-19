import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';

import { ApiError } from './errors';

// ── Read-only data for a screen ─────────────────────────────────────────────
//
// Thin wrapper around `useQuery` that:
//   • auto-refetches on focus if the query is stale
//   • exposes a stable `reload` = invalidateQueries
//   • preserves the standard React Query return surface
export function useDataScreen<TData, TError = ApiError>(
  options: UseQueryOptions<TData, TError, TData, QueryKey>,
) {
  const queryClient = useQueryClient();
  const query       = useQuery<TData, TError, TData, QueryKey>(options);

  useFocusEffect(
    useCallback(() => {
      const state = queryClient.getQueryState(options.queryKey);
      if (state?.isInvalidated || state?.status === 'error') {
        query.refetch();
      }
    }, [queryClient, options.queryKey, query]),
  );

  const reload = useCallback(
    () => queryClient.invalidateQueries({ queryKey: options.queryKey }),
    [queryClient, options.queryKey],
  );

  return { ...query, reload };
}

// ── Write / mutation ────────────────────────────────────────────────────────
//
// Thin wrapper around `useMutation` that:
//   • invalidates a set of query keys on success
//   • normalises errors to ApiError via the client's interceptors
export function useOperation<TInput, TOutput, TOnMutateResult = unknown>(
  options: UseMutationOptions<TOutput, ApiError, TInput, TOnMutateResult> & {
    invalidateKeys?: QueryKey[];
  },
) {
  const queryClient = useQueryClient();
  const { invalidateKeys, onSuccess, ...rest } = options;

  return useMutation<TOutput, ApiError, TInput, TOnMutateResult>({
    ...rest,
    onSuccess: async (data, variables, onMutateResult, context) => {
      if (invalidateKeys?.length) {
        await Promise.all(
          invalidateKeys.map((key) =>
            queryClient.invalidateQueries({ queryKey: key }),
          ),
        );
      }
      await onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}
