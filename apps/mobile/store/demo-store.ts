import { create } from 'zustand';

import { setDemoConnectivityMode, type ConnectivityMode } from '@/hooks/use-connectivity-mode';

export type UserRole = 'consumer' | 'merchant';

interface DemoState {
  isDemoMode: boolean;
  userRole: UserRole;
  simulatedConnectivity: ConnectivityMode | null;
}

interface DemoActions {
  enableDemoMode: () => void;
  disableDemoMode: () => void;
  setUserRole: (role: UserRole) => void;
  setConnectivity: (mode: ConnectivityMode | null) => void;
  resetDemo: () => void;
}

export const useDemoStore = create<DemoState & DemoActions>((set) => ({
  isDemoMode: false,
  userRole: 'consumer',
  simulatedConnectivity: null,

  enableDemoMode: () => {
    set({ isDemoMode: true });
  },

  disableDemoMode: () => {
    setDemoConnectivityMode(null);
    set({
      isDemoMode: false,
      userRole: 'consumer',
      simulatedConnectivity: null,
    });
  },

  setUserRole: (role) => {
    set({ userRole: role });
  },

  setConnectivity: (mode) => {
    setDemoConnectivityMode(mode);
    set({ simulatedConnectivity: mode });
  },

  resetDemo: () => {
    setDemoConnectivityMode(null);
    set({
      userRole: 'consumer',
      simulatedConnectivity: null,
    });
  },
}));
