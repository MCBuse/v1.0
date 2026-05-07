import { useDataScreen, useOperation } from '@/lib/api';

import {
  usersRepository,
  normalizeUsernameInput,
  isUsernameFormatValid,
} from './repository';
import type {
  ResolvedUsername,
  UpdateProfileInput,
  UserProfile,
  UsernameAvailability,
} from './models';

export function useProfile() {
  return useDataScreen<UserProfile>({
    queryKey: ['profile'],
    queryFn:  () => usersRepository.getProfile(),
  });
}

export function useUpdateProfile() {
  return useOperation<UpdateProfileInput, UserProfile>({
    mutationFn:     (input) => usersRepository.updateProfile(input),
    invalidateKeys: [['profile'], ['wallets']],
  });
}

export function useUsernameAvailability(username: string, enabled = true) {
  const normalized = normalizeUsernameInput(username);
  return useDataScreen<UsernameAvailability>({
    queryKey: ['username-availability', normalized],
    queryFn:  () => usersRepository.checkUsernameAvailability(normalized),
    enabled:  enabled && isUsernameFormatValid(normalized),
    staleTime: 30_000,
  });
}

export function useResolveUsername() {
  return useOperation<string, ResolvedUsername>({
    mutationFn: (username) => usersRepository.resolveUsername(username),
  });
}
