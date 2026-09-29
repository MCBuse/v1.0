import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { authSession, useOperation } from '@/lib/api';
import { useAppStore } from '@/store/app-store';

import type {
  ForgotPasswordRequest,
  LoginPhoneRequest,
  LoginRequest,
  ResetPasswordRequest,
  SendOtpRequest,
  SignupRequest,
  TokenPairResponse,
  VerifyOtpRequest,
} from './models';
import { usePendingAuthStore } from './pending-store';
import { authRepository } from './repository';

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

export function useCompleteAuth() {
  const clearPending       = usePendingAuthStore((s) => s.clear);
  const setIsAuthenticated = useAppStore((s) => s.setIsAuthenticated);

  return useCallback(async (tokens: TokenPairResponse) => {
    await authSession.set(tokens);
    clearPending();
    setIsAuthenticated(true);
  }, [clearPending, setIsAuthenticated]);
}

export function useCommitPendingAuth() {
  const pending = usePendingAuthStore((s) => s.pending);
  const completeAuth = useCompleteAuth();

  return useCallback(async () => {
    if (!pending) return false;
    await completeAuth(pending.tokens);
    return true;
  }, [pending, completeAuth]);
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

export function useForgotPassword() {
  return useOperation<ForgotPasswordRequest, void>({
    mutationFn: (input) => authRepository.forgotPassword(input),
  });
}

export function useResetPassword() {
  return useOperation<ResetPasswordRequest, void>({
    mutationFn: (input) => authRepository.resetPassword(input),
  });
}
