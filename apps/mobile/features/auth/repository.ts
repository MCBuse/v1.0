import { ApiError, authSession, http } from '@/lib/api';

import {
  tokenPairResponse,
  type LoginPhoneRequest,
  type LoginRequest,
  type SendOtpRequest,
  type SignupRequest,
  type TokenPairResponse,
  type VerifyOtpRequest,
} from './models';

/**
 * Thin wrapper around auth endpoints.
 *
 * Note: login / signup / loginPhone return tokens **without** writing them to
 * the session cache. Tokens only become active once the caller commits them
 * (see `commitPendingAuth` in hooks.ts) after the OTP gate is passed.
 */
export const authRepository = {
  async login(input: LoginRequest): Promise<TokenPairResponse> {
    const raw = await http.post<unknown>('/auth/login', input);
    return tokenPairResponse.parse(raw);
  },

  async loginPhone(input: LoginPhoneRequest): Promise<TokenPairResponse> {
    const raw = await http.post<unknown>('/auth/login/phone', input);
    return tokenPairResponse.parse(raw);
  },

  async signup(input: SignupRequest): Promise<TokenPairResponse> {
    const raw = await http.post<unknown>('/auth/signup', input);
    return tokenPairResponse.parse(raw);
  },

  async logout(): Promise<void> {
    const tokens = authSession.get();
    if (tokens?.refreshToken) {
      try {
        await http.post('/auth/logout', { refreshToken: tokens.refreshToken });
      } catch (err) {
        // A network / auth error during logout shouldn't block local sign-out.
        if (!(err instanceof ApiError) || err.kind === 'server') throw err;
      }
    }
    await authSession.clear();
  },

  async sendPhoneOtp(input: SendOtpRequest): Promise<void> {
    await http.post('/auth/phone/send-otp', input);
  },

  async verifyPhoneOtp(input: VerifyOtpRequest): Promise<void> {
    await http.post('/auth/phone/verify-otp', input);
  },
};
