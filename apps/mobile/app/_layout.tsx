import { ThemeProvider as RestyleProvider } from '@shopify/restyle';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
} from '@expo-google-fonts/ibm-plex-sans';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { ApiProvider } from '@/lib/api';
import { theme, darkTheme } from '@/theme';

// Hold the splash until fonts are ready
SplashScreen.preventAutoHideAsync();

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
    <RestyleProvider theme={isDark ? darkTheme : theme}>
      <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
        <ApiProvider>
          <Stack>
            {/* index.tsx handles the boot redirect */}
            <Stack.Screen name="index"   options={{ headerShown: false }} />
            <Stack.Screen name="(guest)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)"  options={{ headerShown: false }} />
            <Stack.Screen name="modal"   options={{ presentation: 'modal', title: 'Modal' }} />
            {/* Transaction flows — presented as modals over the tab bar */}
            <Stack.Screen name="receive" options={{ presentation: 'modal',           headerShown: false }} />
            <Stack.Screen name="topup"   options={{ presentation: 'modal',           headerShown: false }} />
            <Stack.Screen name="scan"    options={{ presentation: 'fullScreenModal', headerShown: false }} />
          </Stack>
          <StatusBar style={isDark ? 'light' : 'dark'} />
        </ApiProvider>
      </ThemeProvider>
    </RestyleProvider>
  );
}
