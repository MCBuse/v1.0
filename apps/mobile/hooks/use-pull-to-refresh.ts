import * as Haptics from 'expo-haptics';
import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';

// A refetch that returns in 100ms would flash the spinner too briefly to notice.
const MIN_SPINNER_MS = 600;

/**
 * State for a pull-to-refresh control: a light haptic tap when the pull
 * triggers, every reload run in parallel, and the spinner held until all of
 * them settle (and for at least MIN_SPINNER_MS).
 */
export function usePullToRefresh(...reloads: (() => Promise<unknown>)[]) {
  const [refreshing, setRefreshing] = useState(false);
  const reloadsRef = useRef(reloads);
  reloadsRef.current = reloads;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    try {
      await Promise.all([
        Promise.allSettled(reloadsRef.current.map((reload) => reload())),
        new Promise((resolve) => setTimeout(resolve, MIN_SPINNER_MS)),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  return { refreshing, onRefresh };
}
