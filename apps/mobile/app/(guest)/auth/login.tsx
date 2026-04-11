import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Theme } from '@/theme';
import { Box, Button, Divider, Input, Text } from '@/components/ui';
import { Icon } from '@/components/ui';

type Mode = 'email' | 'phone';

export default function LoginScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();

  const [mode, setMode]           = useState<Mode>('email');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword]   = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const isEmail = mode === 'email';
  const canSubmit = identifier.trim().length > 0 && password.length >= 6;

  const handleSubmit = () => {
    if (!canSubmit) return;
    // Navigate to OTP — pass identifier so OTP screen knows where to send code
    router.push({
      pathname: '/(guest)/auth/otp',
      params: { identifier, flow: 'login' },
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
          <Text variant="h1">Welcome back</Text>
          <Text variant="body" color="textSecondary">
            Sign in to your MCBuse account.
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
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
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
        </Box>

        {/* Forgot password */}
        <Box alignItems="flex-end" marginTop="m" marginBottom="3xl">
          <Text
            variant="caption"
            color="textSecondary"
            style={styles.forgotLink}
            onPress={() => { /* TODO: forgot password flow */ }}
          >
            Forgot password?
          </Text>
        </Box>

        {/* Submit */}
        <Button
          label="Sign in"
          variant="primary"
          disabled={!canSubmit}
          onPress={handleSubmit}
        />

        {/* Switch to register */}
        <Box flexDirection="row" justifyContent="center" gap="xs" marginTop="2xl">
          <Text variant="caption" color="textSecondary">
            Don't have an account?
          </Text>
          <Text
            variant="caption"
            style={[styles.switchLink, { color: colors.textPrimary }]}
            onPress={() => router.replace('/(guest)/auth/register')}
          >
            Create one
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
  forgotLink: {
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  switchLink: {
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
