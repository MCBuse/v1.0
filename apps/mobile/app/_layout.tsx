import { ThemeProvider as RestyleProvider } from '@shopify/restyle';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
} from '@expo-google-fonts/ibm-plex-sans';
import { PrivyProvider } from '@privy-io/expo';
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

// Only import reanimated on native platforms to avoid SSR issues
if (Platform.OS !== 'web') {
  require('react-native-reanimated');
}

import { ConnectivityIndicator } from '@/components/ui/ConnectivityIndicator';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ApiProvider } from '@/lib/api';
import { theme, darkTheme } from '@/theme';
import { useAppStore } from '@/store/app-store';

// Hold the splash until fonts are ready
SplashScreen.preventAutoHideAsync();

const privyAppId = Constants.expoConfig?.extra?.privyAppId as string;
const privyClientId = Constants.expoConfig?.extra?.privyClientId as string;

function RootNavigator({ isDark }: { isDark: boolean }) {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);

  return (
    <Stack screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: isDark ? '#000' : '#fff' }
    }}>
      {/* index.tsx handles the boot redirect */}
      <Stack.Screen name="index" />
      <Stack.Screen name="(guest)" />
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(tabs)" />
        {/* Transaction flows — presented as modals over the tab bar */}
        <Stack.Screen name="(flows)" options={{ presentation: 'modal' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen name="receive" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [fontsLoaded] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  // Keep splash visible while fonts load
  if (!fontsLoaded) return null;

  return (
    <PrivyProvider appId={privyAppId} clientId={privyClientId}>
      <RestyleProvider theme={isDark ? darkTheme : theme}>
        <ApiProvider>
          <ConnectivityIndicator />
          <RootNavigator isDark={isDark} />
          <StatusBar style={isDark ? 'light' : 'dark'} />
        </ApiProvider>
      </RestyleProvider>
    </PrivyProvider>
  );
}
