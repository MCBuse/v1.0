import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Theme } from '@/theme';
import { SocialButton } from '@/components/auth/SocialButton';
import { Box, Button, Divider, Text } from '@/components/ui';

export default function AuthLandingScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();

  return (
    <Box
      flex={1}
      backgroundColor="bgPrimary"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      {/* Logo area */}
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

      {/* Auth actions */}
      <Box paddingHorizontal="2xl" gap="m" paddingBottom="2xl">
        {/* Social buttons */}
        <SocialButton
          provider="apple"
          onPress={() => { /* TODO: Apple auth */ }}
        />
        <SocialButton
          provider="google"
          onPress={() => { /* TODO: Google auth */ }}
        />
        <SocialButton
          provider="facebook"
          onPress={() => { /* TODO: Facebook auth */ }}
        />

        {/* Divider */}
        <Box flexDirection="row" alignItems="center" gap="m" marginVertical="s">
          <Box flex={1} height={StyleSheet.hairlineWidth} backgroundColor="borderDefault" />
          <Text variant="caption" color="textTertiary">or</Text>
          <Box flex={1} height={StyleSheet.hairlineWidth} backgroundColor="borderDefault" />
        </Box>

        {/* Email / Phone */}
        <Button
          label="Continue with Email or Phone"
          variant="secondary"
          onPress={() => router.push('/(guest)/auth/login')}
        />

        {/* Sign up link */}
        <Box flexDirection="row" justifyContent="center" gap="xs" paddingTop="s">
          <Text variant="caption" color="textSecondary">Don't have an account?</Text>
          <Text
            variant="caption"
            color="textPrimary"
            style={styles.signUpLink}
            onPress={() => router.push('/(guest)/auth/register')}
          >
            Sign up
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

const styles = StyleSheet.create({
  signUpLink: {
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
