import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLoginWithEmail } from '@privy-io/expo';

import { usePrivySession } from '@/features/auth';
import { Box, Button, Input, Text } from '@/components/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const insets = useSafeAreaInsets();

  const { sendCode, state } = useLoginWithEmail();
  const {
    status: sessionStatus,
    error: sessionError,
    retry: retryPrivySession,
    hasPrivyUser,
  } = usePrivySession();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();

  const sending = state.status === 'sending-code';
  const finishingSession =
    sessionStatus === 'creating-wallet' || sessionStatus === 'exchanging';
  const validEmail = EMAIL_RE.test(email.trim());

  useEffect(() => {
    if (sessionStatus === 'success') {
      router.replace('/(tabs)');
    }
  }, [sessionStatus]);

  const handleSend = async () => {
    if (hasPrivyUser) {
      await retryPrivySession();
      return;
    }

    if (!validEmail) {
      setEmailError('Enter a valid email address');
      return;
    }
    setEmailError(undefined);
    try {
      await sendCode({ email: email.trim() });
      router.push({
        pathname: '/(guest)/auth/otp',
        params: { identifier: email.trim(), flow: 'login' },
      });
    } catch (e) {
      Alert.alert('Could not send code', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Box gap="xs" marginBottom="3xl">
          <Text variant="h1">Welcome to MCBuse</Text>
          <Text variant="body" color="textSecondary">
            We&apos;ll send a 6-digit code to your email.
          </Text>
        </Box>

        <Box gap="m">
          <Input
            label="Email address"
            placeholder="you@example.com"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (emailError) setEmailError(undefined);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            error={emailError}
          />
        </Box>

        <Box marginTop="3xl">
          <Button
            label={
              finishingSession ? 'Finishing sign in…' :
                sending ? 'Sending code…' :
                  hasPrivyUser ? 'Finish sign in' :
                    'Continue'
            }
            variant="primary"
            disabled={finishingSession || sending || (!hasPrivyUser && !validEmail)}
            onPress={handleSend}
          />
          {hasPrivyUser && sessionError && (
            <Text variant="caption" color="error" textAlign="center" marginTop="m">
              {sessionError}
            </Text>
          )}
        </Box>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:   { flex: 1, backgroundColor: 'transparent' },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 8 },
});
