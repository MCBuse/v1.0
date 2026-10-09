import { useTheme } from '@shopify/restyle';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLoginWithEmail } from '@privy-io/expo';

import { usePrivySession } from '@/features/auth';

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

  const { sendCode, loginWithCode, state } = useLoginWithEmail();
  const {
    status: sessionStatus,
    error: sessionError,
    retry: retryPrivySession,
    hasPrivyUser,
  } = usePrivySession();

  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [canResend, setCanResend] = useState(false);
  const [submittingCode, setSubmittingCode] = useState(false);

  const verifying = state.status === 'submitting-code' || submittingCode;
  const exchanging = sessionStatus === 'creating-wallet' || sessionStatus === 'exchanging';
  const canSubmit = hasPrivyUser || code.length >= 6;

  useEffect(() => {
    if (countdown <= 0) { setCanResend(true); return; }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  useEffect(() => {
    if (sessionStatus === 'success') {
      router.replace('/(tabs)');
    }
  }, [sessionStatus]);

  const handleResend = async () => {
    if (!canResend || !identifier) return;
    try {
      if (hasPrivyUser) {
        await retryPrivySession();
        return;
      }
      await sendCode({ email: identifier });
      setCode('');
      setError(false);
      setCountdown(RESEND_SECONDS);
      setCanResend(false);
    } catch {
      // surface via state.status === 'error' below
    }
  };

  const handleVerify = useCallback(
    async (val?: string) => {
      const otp = val ?? code;
      if (verifying || exchanging) return;

      setSubmittingCode(true);
      setError(false);
      try {
        if (hasPrivyUser) {
          await retryPrivySession();
          return;
        }
        if (otp.length < 6) return;
        await loginWithCode({ code: otp, email: identifier });
        setCode('');
        // Privy now has a user → usePrivySession exchanges → effect above navigates.
      } catch (e) {
        console.log(e)
        setError(true);
      } finally {
        setSubmittingCode(false);
      }
    },
    [
      code,
      verifying,
      exchanging,
      hasPrivyUser,
      retryPrivySession,
      loginWithCode,
      identifier,
    ],
  );

  const handleChange = (val: string) => {
    setCode(val);
    if (error) setError(false);
  };

  const maskedIdentifier = identifier.includes('@')
    ? identifier.replace(/(.{2}).+(@.+)/, '$1•••$2')
    : identifier;

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
              Incorrect code. Please try again.
            </Text>
          )}
          {sessionError && !error && (
            <Text variant="caption" color="error" textAlign="center" marginTop="m">
              {sessionError}
            </Text>
          )}
        </Box>

        <Button
          label={
            exchanging ? 'Setting up your wallet…' :
              verifying ? 'Verifying…' :
                hasPrivyUser ? 'Finish sign in' :
                  'Verify'
          }
          variant="primary"
          disabled={!canSubmit || verifying || exchanging}
          onPress={() => handleVerify()}
        />

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

        <Box alignItems="center" marginTop="m">
          <Text
            variant="caption"
            color="textSecondary"
            style={styles.changeLink}
            onPress={() => router.back()}
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
