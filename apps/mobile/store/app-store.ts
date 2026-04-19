import { create } from 'zustand';

/**
 * App-level navigation state.
 *
 * hasSeenOnboarding — false on every cold boot (no persistence).
 *   The user always sees onboarding when the app starts fresh.
 *   Flip to true when they tap "Get Started" or "Skip".
 *
 * isAuthenticated — mirrors whether the session has valid tokens.
 *   Kept in sync by ApiProvider on boot and by the auth hooks on sign-in/out.
 *   Do not write directly from screens — always go through auth hooks.
 */
type AppStore = {
  hasSeenOnboarding: boolean;
  isAuthenticated:   boolean;

  setHasSeenOnboarding: (value: boolean) => void;
  setIsAuthenticated:   (value: boolean) => void;
  signOut:              () => void;
};

export const useAppStore = create<AppStore>((set) => ({
  hasSeenOnboarding: false,
  isAuthenticated:   false,

  setHasSeenOnboarding: (value) => set({ hasSeenOnboarding: value }),
  setIsAuthenticated:   (value) => set({ isAuthenticated: value }),
  signOut:              ()      => set({ isAuthenticated: false }),
}));
