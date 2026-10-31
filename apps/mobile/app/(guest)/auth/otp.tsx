import { useTheme } from '@shopify/restyle';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  useCommitPendingAuth,
  useSendEmailOtp,
  useVerifyEmailOtp,
} from '@/features/auth/hooks';
import { usePendingAuthStore } from '@/features/auth/pending-store';
import { ApiError, authSession } from '@/lib/api';

import type { Theme } from '@/theme';
import { OtpInput } from '@/components/auth/OtpInput';
import { Box, Button, Text } from '@/components/ui';

const RESEND_SECONDS = 60;

export default function OtpScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const { identifier = '' } = useLocalSearchParams<{
    identifier: string;
    flow: 'login' | 'register';
  }>();

  const clearPending  = usePendingAuthStore((s) => s.clear);
  const commitPending = useCommitPendingAuth();
  const sendOtp       = useSendEmailOtp();
  const verifyOtp     = useVerifyEmailOtp();

  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [countdown, setCountdown] = useState(RESEND_SECONDS);

  const verifying = verifyOtp.isPending;
  const canResend = countdown <= 0 && !sendOtp.isPending;

  // Deep-linked here with no pending auth → back to login. Mount-only: a
  // successful verify clears the pending store, which must not bounce us.
  useEffect(() => {
    if (!usePendingAuthStore.getState().pending) router.replace('/(guest)/auth/login');
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  const handleResend = async () => {
    if (!canResend) return;
    try {
      await sendOtp.mutateAsync();
      setCode('');
      setError(false);
      setCountdown(RESEND_SECONDS);
    } catch (err) {
      Alert.alert('Could not resend code', err instanceof ApiError ? err.message : 'Please try again.');
    }
  };

  const handleVerify = useCallback(
    async (val?: string) => {
      const otp = val ?? code;
      if (otp.length < 6 || verifying) return;

      try {
        await verifyOtp.mutateAsync({ code: otp });
      } catch (err) {
        if (err instanceof ApiError && err.status === 400) {
          setError(true);
        } else {
          Alert.alert('Verification failed', err instanceof ApiError ? err.message : 'Please try again.');
        }
        return;
      }

      const ok = await commitPending();
      router.replace(ok ? '/(tabs)' : '/(guest)/auth/login');
    },
    [code, verifying, verifyOtp, commitPending],
  );

  const handleChange = (val: string) => {
    setCode(val);
    if (error) setError(false);
  };

  // Tokens were written to the session so the OTP calls carry a bearer;
  // drop them too so an unverified session is not resumed on next launch.
  const handleBack = async () => {
    clearPending();
    await authSession.clear();
    router.back();
  };

  const maskedIdentifier = identifier.replace(/(.{2}).+(@.+)/, '$1•••$2');

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
        <Box gap="xs" marginBottom="3xl">
          <Text variant="h1">Check your email</Text>
          <Text variant="body" color="textSecondary">
            We sent a 6-digit code to{'\n'}
            <Text variant="bodyMedium">{maskedIdentifier}</Text>
          </Text>
        </Box>

        <Box marginBottom="2xl">
          <OtpInput
            value={code}
            onChange={handleChange}
            onFilled={handleVerify}
            error={error}
          />
          {error && (
            <Text variant="caption" color="error" textAlign="center" marginTop="m">
              Incorrect or expired code. Please try again.
            </Text>
          )}
        </Box>

        <Button
          label={verifying ? 'Verifying…' : 'Verify'}
          variant="primary"
          disabled={code.length < 6 || verifying}
          onPress={() => handleVerify()}
        />

        <Box flexDirection="row" justifyContent="center" gap="xs" marginTop="2xl">
          <Text variant="caption" color="textSecondary">
            Didn&apos;t receive it?{' '}
          </Text>
          {countdown > 0 ? (
            <Text variant="caption" color="textTertiary">
              Resend in {countdown}s
            </Text>
          ) : (
            <Text
              variant="caption"
              style={[styles.resendLink, { color: colors.textPrimary }]}
              onPress={handleResend}
            >
              {sendOtp.isPending ? 'Sending…' : 'Resend code'}
            </Text>
          )}
        </Box>

        <Box alignItems="center" marginTop="m">
          <Text
            variant="caption"
            color="textSecondary"
            style={styles.changeLink}
            onPress={handleBack}
          >
            Change email
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
