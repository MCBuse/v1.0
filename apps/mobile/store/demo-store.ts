import { create } from 'zustand';

import type { ConnectivityMode } from '@/features/offline/models';
import { setDemoConnectivityMode } from '@/hooks/use-connectivity-mode';

interface DemoState {
  isDemoMode: boolean;
  simulatedConnectivity: ConnectivityMode | null;
  smsDelivered: boolean;
  settlementComplete: boolean;
}

interface DemoActions {
  enableDemoMode: () => void;
  disableDemoMode: () => void;
  setConnectivity: (mode: ConnectivityMode | null) => void;
  simulateSmsDelivery: () => void;
  simulateSettlement: () => void;
  resetDemo: () => void;
}

export const useDemoStore = create<DemoState & DemoActions>((set) => ({
  isDemoMode: false,
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
      simulatedConnectivity: null,
      smsDelivered: false,
      settlementComplete: false,
    });
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
      simulatedConnectivity: null,
      smsDelivered: false,
      settlementComplete: false,
    });
  },
}));
