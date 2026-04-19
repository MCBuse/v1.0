import { create } from 'zustand';

import type { TokenPairResponse } from './models';

export type PendingAuthFlow = 'login' | 'register';
export type PendingAuthChannel = 'email' | 'phone';

export type PendingAuth = {
  tokens:     TokenPairResponse;
  identifier: string;
  channel:    PendingAuthChannel;
  flow:       PendingAuthFlow;
};

type PendingAuthStore = {
  pending: PendingAuth | null;
  set:     (p: PendingAuth) => void;
  clear:   () => void;
};

/**
 * Short-lived holding area for tokens issued by the API that haven't yet been
 * confirmed via OTP. A successful OTP verification moves these tokens into
 * `authSession` and flips `isAuthenticated` — until then they do not grant access.
 */
export const usePendingAuthStore = create<PendingAuthStore>((set) => ({
  pending: null,
  set:     (p) => set({ pending: p }),
  clear:   ()  => set({ pending: null }),
}));
