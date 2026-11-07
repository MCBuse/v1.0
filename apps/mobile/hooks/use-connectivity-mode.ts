import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

export type ConnectivityMode = 'online' | 'poor' | 'offline';

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

  useEffect(() => NetInfo.addEventListener((state) => setMode(classifyConnection(state))), []);

  return mode;
}
