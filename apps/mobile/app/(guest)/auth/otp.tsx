import { useTheme } from '@shopify/restyle';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Theme } from '@/theme';
import { OtpInput } from '@/components/auth/OtpInput';
import { Box, Button, Text } from '@/components/ui';
import { useAppStore } from '@/store/app-store';

const RESEND_SECONDS = 60;

export default function OtpScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const { identifier = '', flow = 'login' } = useLocalSearchParams<{
    identifier: string;
    flow: 'login' | 'register';
  }>();

  const setIsAuthenticated = useAppStore((s) => s.setIsAuthenticated);

  const [code, setCode]           = useState('');
  const [error, setError]         = useState(false);
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [canResend, setCanResend] = useState(false);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) { setCanResend(true); return; }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  const handleResend = () => {
    if (!canResend) return;
    setCode('');
    setError(false);
    setCountdown(RESEND_SECONDS);
    setCanResend(false);
    // TODO: trigger resend API call
  };

  const handleVerify = useCallback((val?: string) => {
    const otp = val ?? code;
    if (otp.length < 6) return;
    // Dummy auth — any 6-digit code succeeds
    setIsAuthenticated(true);
    router.replace('/(tabs)');
  }, [code, setIsAuthenticated]);

  const handleChange = (val: string) => {
    setCode(val);
    if (error) setError(false);
  };

  // Mask the identifier for display
  const maskedIdentifier = identifier.includes('@')
    ? identifier.replace(/(.{2}).+(@.+)/, '$1•••$2')
    : identifier.replace(/(\+?\d{1,3})\d+(\d{4})/, '$1•••••$2');

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Box
        flex={1}
        backgroundColor="bgPrimary"
        paddingHorizontal="2xl"
        style={{ paddingBottom: insets.bottom + 24 }}
      >
        {/* Header */}
        <Box gap="xs" marginBottom="3xl">
          <Text variant="h1">Check your {identifier.includes('@') ? 'email' : 'messages'}</Text>
          <Text variant="body" color="textSecondary">
            We sent a 6-digit code to{'\n'}
            <Text variant="bodyMedium">{maskedIdentifier}</Text>
          </Text>
        </Box>

        {/* OTP boxes */}
        <Box marginBottom="2xl">
          <OtpInput
            value={code}
            onChange={handleChange}
            onFilled={handleVerify}
            error={error}
          />
          {error && (
            <Text variant="caption" color="error" textAlign="center" marginTop="m">
              Incorrect code. Please try again.
            </Text>
          )}
        </Box>

        {/* Verify button */}
        <Button
          label="Verify"
          variant="primary"
          disabled={code.length < 6}
          onPress={handleVerify}
        />

        {/* Resend */}
        <Box flexDirection="row" justifyContent="center" gap="xs" marginTop="2xl">
          <Text variant="caption" color="textSecondary">
            Didn&apos;t receive it?{' '}
          </Text>
          {canResend ? (
            <Text
              variant="caption"
              style={[styles.resendLink, { color: colors.textPrimary }]}
              onPress={handleResend}
            >
              Resend code
            </Text>
          ) : (
            <Text variant="caption" color="textTertiary">
              Resend in {countdown}s
            </Text>
          )}
        </Box>

        {/* Change contact */}
        <Box alignItems="center" marginTop="m">
          <Text
            variant="caption"
            color="textSecondary"
            style={styles.changeLink}
            onPress={() => router.back()}
          >
            Change {identifier.includes('@') ? 'email' : 'phone number'}
          </Text>
        </Box>
      </Box>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  resendLink: {
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  changeLink: {
    textDecorationLine: 'underline',
  },
});
