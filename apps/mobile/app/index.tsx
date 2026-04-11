import { Redirect } from 'expo-router';

import { useAppStore } from '@/store/app-store';

/**
 * Root entry point — decides where to send the user.
 *
 * Boot flow:
 *   fresh install / every cold boot  → /(guest)/onboarding
 *   seen onboarding, not logged in   → /(guest)/auth
 *   authenticated                    → /(tabs)
 */
export default function Index() {
  const hasSeenOnboarding = useAppStore((s) => s.hasSeenOnboarding);
  const isAuthenticated   = useAppStore((s) => s.isAuthenticated);

  if (!hasSeenOnboarding) return <Redirect href="/(guest)/onboarding" />;
  if (!isAuthenticated)   return <Redirect href="/(guest)/auth" />;
  return <Redirect href="/(tabs)" />;
}
