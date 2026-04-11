import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Theme } from '@/theme';
import { Box, Button, Input, Text } from '@/components/ui';
import { Icon } from '@/components/ui';

type Mode = 'email' | 'phone';

export default function RegisterScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();

  const [mode, setMode]               = useState<Mode>('email');
  const [fullName, setFullName]       = useState('');
  const [identifier, setIdentifier]   = useState('');
  const [password, setPassword]       = useState('');
  const [confirm, setConfirm]         = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const isEmail = mode === 'email';
  const passwordsMatch = password === confirm;
  const canSubmit =
    fullName.trim().length > 0 &&
    identifier.trim().length > 0 &&
    password.length >= 6 &&
    passwordsMatch;

  const handleSubmit = () => {
    if (!canSubmit) return;
    router.push({
      pathname: '/(guest)/auth/otp',
      params: { identifier, flow: 'register' },
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Box gap="xs" marginBottom="3xl">
          <Text variant="h1">Create account</Text>
          <Text variant="body" color="textSecondary">
            Join MCBuse — it only takes a minute.
          </Text>
        </Box>

        {/* Mode toggle */}
        <Box
          flexDirection="row"
          backgroundColor="bgSecondary"
          borderRadius="full"
          padding="xs"
          marginBottom="2xl"
        >
          {(['email', 'phone'] as Mode[]).map((m) => (
            <Pressable
              key={m}
              onPress={() => { setMode(m); setIdentifier(''); }}
              style={[
                styles.toggle,
                {
                  backgroundColor:
                    mode === m ? colors.bgPrimary : colors.transparent,
                },
              ]}
            >
              <Text
                variant="captionMedium"
                style={{
                  color: mode === m ? colors.textPrimary : colors.textSecondary,
                  fontWeight: mode === m ? '600' : '400',
                }}
              >
                {m === 'email' ? 'Email' : 'Phone'}
              </Text>
            </Pressable>
          ))}
        </Box>

        {/* Fields */}
        <Box gap="m">
          <Input
            label="Full name"
            placeholder="Your name"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            returnKeyType="next"
          />

          <Input
            label={isEmail ? 'Email address' : 'Phone number'}
            placeholder={isEmail ? 'you@example.com' : '+1 555 000 0000'}
            value={identifier}
            onChangeText={setIdentifier}
            keyboardType={isEmail ? 'email-address' : 'phone-pad'}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />

          <Input
            label="Password"
            placeholder="Min. 6 characters"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            returnKeyType="next"
            suffix={
              <Pressable onPress={() => setShowPassword((v) => !v)}>
                <Icon
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={20}
                  color={colors.textTertiary}
                />
              </Pressable>
            }
          />

          <Input
            label="Confirm password"
            placeholder="Repeat password"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry={!showPassword}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            error={
              confirm.length > 0 && !passwordsMatch
                ? 'Passwords do not match'
                : undefined
            }
          />
        </Box>

        {/* Terms note */}
        <Box marginTop="l" marginBottom="3xl">
          <Text variant="caption" color="textTertiary" textAlign="center">
            By continuing you agree to our{' '}
            <Text
              variant="caption"
              style={[styles.termsLink, { color: colors.textPrimary }]}
              onPress={() => { /* TODO: open terms */ }}
            >
              Terms of Service
            </Text>{' '}
            and{' '}
            <Text
              variant="caption"
              style={[styles.termsLink, { color: colors.textPrimary }]}
              onPress={() => { /* TODO: open privacy */ }}
            >
              Privacy Policy
            </Text>.
          </Text>
        </Box>

        <Button
          label="Create account"
          variant="primary"
          disabled={!canSubmit}
          onPress={handleSubmit}
        />

        {/* Switch to login */}
        <Box flexDirection="row" justifyContent="center" gap="xs" marginTop="2xl">
          <Text variant="caption" color="textSecondary">
            Already have an account?
          </Text>
          <Text
            variant="caption"
            style={[styles.switchLink, { color: colors.textPrimary }]}
            onPress={() => router.replace('/(guest)/auth/login')}
          >
            Sign in
          </Text>
        </Box>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: 'transparent' },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  toggle: {
    flex: 1,
    height: 34,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  termsLink: {
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  switchLink: {
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
