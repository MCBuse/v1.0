import { useTheme } from '@shopify/restyle';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCommitPendingAuth, useSendPhoneOtp, useVerifyPhoneOtp } from '@/features/auth/hooks';
import { usePendingAuthStore } from '@/features/auth/pending-store';
import { authSession } from '@/lib/api';

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

  const pending = usePendingAuthStore((s) => s.pending);
  const clearPending = usePendingAuthStore((s) => s.clear);
  const commitPending = useCommitPendingAuth();
  const sendOtp = useSendPhoneOtp();
  const verifyOtp = useVerifyPhoneOtp();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [canResend, setCanResend] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const otpSent = useRef(false);

  const phone = pending?.identifier ?? identifier;

  useEffect(() => {
    if (!pending) {
      router.replace('/(guest)/auth/login');
      return;
    }
    if (otpSent.current) return;
    otpSent.current = true;
    sendOtp.mutateAsync({ phone }).catch(() => {
      Alert.alert('Could not send code', 'Please try again or go back.');
    });
  }, [pending, phone, sendOtp]);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) { setCanResend(true); return; }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  const handleResend = async () => {
    if (!canResend || sendOtp.isPending) return;
    setCode('');
    setError(null);
    setCountdown(RESEND_SECONDS);
    setCanResend(false);
    try {
      await sendOtp.mutateAsync({ phone });
    } catch {
      Alert.alert('Could not resend code', 'Please try again.');
    }
  };

  const handleVerify = useCallback(
    async (val?: string) => {
      const otp = val ?? code;
      if (otp.length < 6 || verifying) return;

      setVerifying(true);
      setError(null);

      try {
        await verifyOtp.mutateAsync({ phone, code: otp });
      } catch {
        setError('Invalid or expired code. Please try again.');
        setVerifying(false);
        return;
      }

      const ok = await commitPending();
      setVerifying(false);

      if (!ok) {
        router.replace('/(guest)/auth/login');
        return;
      }

      router.replace('/(tabs)');
    },
    [code, verifying, commitPending, phone, verifyOtp],
  );

  const handleChange = (val: string) => {
    setCode(val);
    if (error) setError(null);
  };

  const handleBack = async () => {
    await authSession.clear();
    clearPending();
    router.back();
  };

  const isEmail = identifier.includes('@');
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
            Check your messages for the verification code.
          </Text>
        </Box>

        {/* OTP boxes */}
        <Box marginBottom="2xl">
          <OtpInput
            value={code}
            onChange={handleChange}
            onFilled={handleVerify}
            error={Boolean(error)}
          />
          {error && (
            <Text variant="caption" color="error" textAlign="center" marginTop="m">
              {error}
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
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  changeLink: {
    textDecorationLine: 'underline',
  },
});
