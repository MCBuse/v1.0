import { useTheme } from '@shopify/restyle';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCommitPendingAuth } from '@/features/auth/hooks';
import { usePendingAuthStore } from '@/features/auth/pending-store';

import type { Theme } from '@/theme';
import { OtpInput } from '@/components/auth/OtpInput';
import { Box, Button, Text } from '@/components/ui';

const RESEND_SECONDS = 60;
const DEV_OTP        = '123456';

export default function OtpScreen() {
  const { colors } = useTheme<Theme>();
  const insets     = useSafeAreaInsets();
  const { identifier = '' } = useLocalSearchParams<{
    identifier: string;
    flow:       'login' | 'register';
  }>();

  const pending       = usePendingAuthStore((s) => s.pending);
  const clearPending  = usePendingAuthStore((s) => s.clear);
  const commitPending = useCommitPendingAuth();

  const [code, setCode]           = useState('');
  const [error, setError]         = useState(false);
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [canResend, setCanResend] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // If user deep-links straight into OTP with no pending auth, bounce them back.
  useEffect(() => {
    if (!pending) router.replace('/(guest)/auth/login');
  }, [pending]);

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
    // TODO: trigger resend once backend OTP delivery is live (hardcoded 123456 for now)
  };

  const handleVerify = useCallback(
    async (val?: string) => {
      const otp = val ?? code;
      if (otp.length < 6 || verifying) return;

      if (otp !== DEV_OTP) {
        setError(true);
        return;
      }

      setVerifying(true);
      const ok = await commitPending();
      setVerifying(false);

      if (!ok) {
        router.replace('/(guest)/auth/login');
        return;
      }

      router.replace('/(tabs)');
    },
    [code, verifying, commitPending],
  );

  const handleChange = (val: string) => {
    setCode(val);
    if (error) setError(false);
  };

  const handleBack = () => {
    clearPending();
    router.back();
  };

  const isEmail          = identifier.includes('@');
  const maskedIdentifier = isEmail
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
          <Text variant="h1">Check your {isEmail ? 'email' : 'messages'}</Text>
          <Text variant="body" color="textSecondary">
            We sent a 6-digit code to{'\n'}
            <Text variant="bodyMedium">{maskedIdentifier}</Text>
          </Text>
          <Text variant="caption" color="textTertiary" marginTop="s">
            Dev mode — use code {DEV_OTP}.
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
          label={verifying ? 'Verifying…' : 'Verify'}
          variant="primary"
          disabled={code.length < 6 || verifying}
          onPress={() => handleVerify()}
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
            onPress={handleBack}
          >
            Change {isEmail ? 'email' : 'phone number'}
          </Text>
        </Box>
      </Box>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  resendLink: {
    fontWeight:         '600',
    textDecorationLine: 'underline',
  },
  changeLink: {
    textDecorationLine: 'underline',
  },
});
