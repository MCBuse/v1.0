import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useEffect, useRef, useState } from 'react';

import type { ConnectivityMode } from '@/features/offline/models';

let demoModeOverride: ConnectivityMode | null = null;
const demoListeners = new Set<(mode: ConnectivityMode | null) => void>();

export function setDemoConnectivityMode(mode: ConnectivityMode | null) {
  demoModeOverride = mode;
  demoListeners.forEach((fn) => fn(mode));
}

export function getDemoConnectivityMode(): ConnectivityMode | null {
  return demoModeOverride;
}

function classifyConnection(state: NetInfoState): ConnectivityMode {
  if (!state.isConnected) return 'offline';

  if (state.type === 'cellular') {
    const details = state.details;
    if (details && 'cellularGeneration' in details) {
      const gen = details.cellularGeneration;
      if (gen === '2g') return 'poor';
      if (gen === '3g') return 'poor';
    }
  }

  if (state.isInternetReachable === false) return 'poor';

  return 'online';
}

export function useConnectivityMode(): ConnectivityMode {
  const [mode, setMode] = useState<ConnectivityMode>('online');
  const [override, setOverride] = useState<ConnectivityMode | null>(
    demoModeOverride,
  );
  const lastReal = useRef<ConnectivityMode>('online');

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const classified = classifyConnection(state);
      lastReal.current = classified;
      if (!demoModeOverride) {
        setMode(classified);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const listener = (m: ConnectivityMode | null) => {
      setOverride(m);
      setMode(m ?? lastReal.current);
    };
    demoListeners.add(listener);
    return () => {
      demoListeners.delete(listener);
    };
  }, []);

  return override ?? mode;
}
