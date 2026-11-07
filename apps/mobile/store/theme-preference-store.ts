import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance, Platform, type ColorSchemeName } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemeMode = 'system' | 'light' | 'dark';

export function resolveIsDark(mode: ThemeMode, systemScheme: ColorSchemeName): boolean {
  return mode === 'system' ? systemScheme === 'dark' : mode === 'dark';
}

// Keeps native chrome (alerts, keyboards, pickers) in step with the chosen mode.
function applyNativeScheme(mode: ThemeMode) {
  if (Platform.OS === 'web') return;
  Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
}

type ThemePreferenceState = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

export const useThemePreference = create<ThemePreferenceState>()(
  persist(
    (set) => ({
      mode: 'system',
      setMode: (mode) => {
        applyNativeScheme(mode);
        set({ mode });
      },
    }),
    {
      name: 'theme-preference',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (state) applyNativeScheme(state.mode);
      },
    },
  ),
);
