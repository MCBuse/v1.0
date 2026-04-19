import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { authSession, useOperation } from '@/lib/api';
import { useAppStore } from '@/store/app-store';

import type {
  LoginPhoneRequest,
  LoginRequest,
  SendOtpRequest,
  SignupRequest,
  TokenPairResponse,
  VerifyOtpRequest,
} from './models';
import { usePendingAuthStore } from './pending-store';
import { authRepository } from './repository';

/**
 * Submits email + password to /auth/login. Tokens are returned but NOT yet
 * written to the session — the caller (login screen) stashes them via the
 * pending-auth store and navigates to OTP. Only after OTP verification does
 * `commitPendingAuth` activate them.
 */
export function useLogin() {
  return useOperation<LoginRequest, TokenPairResponse>({
    mutationFn: (input) => authRepository.login(input),
  });
}

export function useLoginPhone() {
  return useOperation<LoginPhoneRequest, TokenPairResponse>({
    mutationFn: (input) => authRepository.loginPhone(input),
  });
}

export function useSignup() {
  return useOperation<SignupRequest, TokenPairResponse>({
    mutationFn: (input) => authRepository.signup(input),
  });
}

/**
 * Moves tokens from the pending-auth store into the session cache and flips
 * `isAuthenticated` — the root layout will swap route groups on the next render.
 */
export function useCommitPendingAuth() {
  const pending            = usePendingAuthStore((s) => s.pending);
  const clearPending       = usePendingAuthStore((s) => s.clear);
  const setIsAuthenticated = useAppStore((s) => s.setIsAuthenticated);

  return useCallback(async () => {
    if (!pending) return false;
    await authSession.set(pending.tokens);
    clearPending();
    setIsAuthenticated(true);
    return true;
  }, [pending, clearPending, setIsAuthenticated]);
}

/**
 * Revokes the refresh token server-side, clears secure storage and the query
 * cache, and flips the app store out of authenticated state.
 */
export function useSignOut() {
  const signOut      = useAppStore((s) => s.signOut);
  const clearPending = usePendingAuthStore((s) => s.clear);
  const queryClient  = useQueryClient();

  return useOperation<void, void>({
    mutationFn: () => authRepository.logout(),
    onSuccess:  () => {
      queryClient.clear();
      clearPending();
      signOut();
    },
    // Even if the server call fails we still want the user signed out locally.
    onError: () => {
      queryClient.clear();
      clearPending();
      signOut();
    },
  });
}

export function useSendPhoneOtp() {
  return useOperation<SendOtpRequest, void>({
    mutationFn: (input) => authRepository.sendPhoneOtp(input),
  });
}

export function useVerifyPhoneOtp() {
  return useOperation<VerifyOtpRequest, void>({
    mutationFn: (input) => authRepository.verifyPhoneOtp(input),
  });
}
