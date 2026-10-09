import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';

const ONBOARDING_KEY = 'mcbuse.app.hasSeenOnboarding';

type AppStore = {
  hasSeenOnboarding: boolean;
  isAuthenticated:   boolean;

  setHasSeenOnboarding: (value: boolean) => void;
  setIsAuthenticated:   (value: boolean) => void;
  signOut:              () => void;
  hydrateOnboarding:    () => Promise<void>;
};

export const useAppStore = create<AppStore>((set) => ({
  hasSeenOnboarding: false,
  isAuthenticated:   false,

  setHasSeenOnboarding: (value) => {
    set({ hasSeenOnboarding: value });
    if (Platform.OS !== 'web') {
      SecureStore.setItemAsync(ONBOARDING_KEY, value ? '1' : '').catch(() => {});
    }
  },
  setIsAuthenticated:   (value) => set({ isAuthenticated: value }),
  signOut:              ()      => set({ isAuthenticated: false }),
  hydrateOnboarding: async () => {
    if (Platform.OS === 'web') return;
    const stored = await SecureStore.getItemAsync(ONBOARDING_KEY);
    if (stored === '1') set({ hasSeenOnboarding: true });
  },
}));
