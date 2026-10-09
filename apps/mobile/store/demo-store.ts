import { create } from 'zustand';

import type { ConnectivityMode } from '@/features/offline/models';
import { setDemoConnectivityMode } from '@/hooks/use-connectivity-mode';

export type UserRole = 'consumer' | 'issuer' | 'merchant';

interface DemoState {
  isDemoMode: boolean;
  userRole: UserRole;
  simulatedConnectivity: ConnectivityMode | null;
  smsDelivered: boolean;
  settlementComplete: boolean;
}

interface DemoActions {
  enableDemoMode: () => void;
  disableDemoMode: () => void;
  setUserRole: (role: UserRole) => void;
  setConnectivity: (mode: ConnectivityMode | null) => void;
  simulateSmsDelivery: () => void;
  simulateSettlement: () => void;
  resetDemo: () => void;
}

export const useDemoStore = create<DemoState & DemoActions>((set) => ({
  isDemoMode: false,
  userRole: 'consumer',
  simulatedConnectivity: null,
  smsDelivered: false,
  settlementComplete: false,

  enableDemoMode: () => {
    set({ isDemoMode: true });
  },

  disableDemoMode: () => {
    setDemoConnectivityMode(null);
    set({
      isDemoMode: false,
      userRole: 'consumer',
      simulatedConnectivity: null,
      smsDelivered: false,
      settlementComplete: false,
    });
  },

  setUserRole: (role) => {
    set({ userRole: role });
  },

  setConnectivity: (mode) => {
    setDemoConnectivityMode(mode);
    set({ simulatedConnectivity: mode });
  },

  simulateSmsDelivery: () => {
    set({ smsDelivered: true });
  },

  simulateSettlement: () => {
    set({ settlementComplete: true });
  },

  resetDemo: () => {
    setDemoConnectivityMode(null);
    set({
      userRole: 'consumer',
      simulatedConnectivity: null,
      smsDelivered: false,
      settlementComplete: false,
    });
  },
}));
