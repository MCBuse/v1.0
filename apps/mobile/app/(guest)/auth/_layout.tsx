import { useTheme } from '@shopify/restyle';
import { Stack } from 'expo-router';

import type { Theme } from '@/theme';

export default function AuthLayout() {
  const { colors } = useTheme<Theme>();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgPrimary },
        headerShadowVisible: false,
        headerBackTitle: '',
        headerTintColor: colors.textPrimary,
        headerTitle: '',
        contentStyle: { backgroundColor: colors.bgPrimary },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login"    options={{ headerShown: true }} />
      <Stack.Screen name="register" options={{ headerShown: true }} />
      <Stack.Screen name="otp"      options={{ headerShown: true }} />
      <Stack.Screen name="forgot-password" options={{ headerShown: true }} />
      <Stack.Screen name="reset-password"  options={{ headerShown: true }} />
    </Stack>
  );
}
