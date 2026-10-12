import { router } from 'expo-router';
import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLoginWithOAuth } from '@privy-io/expo';

import { SocialButton } from '@/components/auth/SocialButton';
import { Box, Button, Text } from '@/components/ui';
import { usePrivySession } from '@/features/auth';

export default function AuthLandingScreen() {
  const insets = useSafeAreaInsets();

  // Mounting this hook here means the moment Privy reports a user
  // (after OAuth completes), we exchange for a backend session and route to /(tabs).
  usePrivySession();

  const oauth = useLoginWithOAuth();
  const oauthBusy = oauth.state.status === 'loading';

  const handleOAuth = async (provider: 'apple' | 'google') => {
    try {
      await oauth.login({ provider });
      // On success Privy populates `usePrivy().user` → usePrivySession exchanges → app-store flips.
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Sign in failed', msg);
    }
  };

  return (
    <Box
      flex={1}
      backgroundColor="bgPrimary"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <Box flex={1} alignItems="center" justifyContent="center" gap="m">
        <Box
          width={72}
          height={72}
          borderRadius="xl"
          backgroundColor="brand"
          alignItems="center"
          justifyContent="center"
        >
          <Text variant="h1" color="textInverse">M</Text>
        </Box>
        <Text variant="h2">MCBuse</Text>
        <Text variant="body" color="textSecondary" textAlign="center" paddingHorizontal="4xl">
          The fastest way to send and receive money.
        </Text>
      </Box>

      <Box paddingHorizontal="2xl" gap="m" paddingBottom="2xl">
        <SocialButton
          provider="apple"
          onPress={() => handleOAuth('apple')}
          disabled={oauthBusy}
        />
        <SocialButton
          provider="google"
          onPress={() => handleOAuth('google')}
          disabled={oauthBusy}
        />

        <Box flexDirection="row" alignItems="center" gap="m" marginVertical="s">
          <Box flex={1} height={StyleSheet.hairlineWidth} backgroundColor="borderDefault" />
          <Text variant="caption" color="textTertiary">or</Text>
          <Box flex={1} height={StyleSheet.hairlineWidth} backgroundColor="borderDefault" />
        </Box>

        <Button
          label="Continue with Email"
          variant="secondary"
          onPress={() => router.push('/(guest)/auth/login')}
          disabled={oauthBusy}
        />
      </Box>
    </Box>
  );
}
