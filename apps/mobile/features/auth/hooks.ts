import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback } from 'react';

import { usersRepository } from '@/features/users/repository';
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
  VerifyEmailOtpRequest,
  VerifyOtpRequest,
} from './models';
import { usePendingAuthStore, type PendingAuthChannel, type PendingAuthFlow } from './pending-store';
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
    // A refresh during verification rotates the tokens; persist the live pair,
    // not the (now revoked) one parked in the pending store.
    await completeAuth(authSession.get() ?? pending.tokens);
    return true;
  }, [pending, completeAuth]);
}

/**
 * Finishes login/sign-up once the API has issued tokens, and navigates.
 *   phone → straight in (SMS OTP not shipped yet).
 *   email → straight in if already verified, otherwise park the tokens in the
 *           pending store, send an email code and go to the OTP screen.
 * Email tokens go into `authSession` as a transient (memory-only) session so
 * the profile / send-otp calls carry the bearer; they are persisted only once
 * the code is verified. On failure the session is cleared and the error rethrown.
 */
export function useFinishSignIn() {
  const completeAuth = useCompleteAuth();
  const setPending   = usePendingAuthStore((s) => s.set);

  return useCallback(async (
    tokens: TokenPairResponse,
    ctx: { identifier: string; channel: PendingAuthChannel; flow: PendingAuthFlow },
  ) => {
    if (ctx.channel === 'email') {
      try {
        authSession.setTransient(tokens);
        const profile = await usersRepository.getProfile();
        if (!profile.isEmailVerified) {
          setPending({ tokens, ...ctx });
          await authRepository.sendEmailOtp();
          router.push({
            pathname: '/(guest)/auth/otp',
            params:   { identifier: ctx.identifier, flow: ctx.flow },
          });
          return;
        }
      } catch (err) {
        await authRepository.logout(); // revokes the refresh token, clears the session
        throw err;
      }
    }

    await completeAuth(tokens);
    router.replace('/(tabs)');
  }, [completeAuth, setPending]);
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

export function useSendEmailOtp() {
  return useOperation<void, void>({
    mutationFn: () => authRepository.sendEmailOtp(),
  });
}

export function useVerifyEmailOtp() {
  return useOperation<VerifyEmailOtpRequest, void>({
    mutationFn: (input) => authRepository.verifyEmailOtp(input),
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
