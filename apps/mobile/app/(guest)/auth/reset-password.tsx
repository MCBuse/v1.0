import { zodResolver } from '@hookform/resolvers/zod';
import { useTheme } from '@shopify/restyle';
import { router, useLocalSearchParams } from 'expo-router';
import { Eye, EyeSlash } from 'iconsax-react-native';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '@/lib/api';
import type { ResetPasswordFormValues } from '@/lib/validation/auth';
import { resetPasswordSchema } from '@/lib/validation/auth';

import { useForgotPassword, useResetPassword } from '@/features/auth/hooks';

import type { Theme } from '@/theme';
import { OtpInput } from '@/components/auth/OtpInput';
import { Box, Button, Input, Text } from '@/components/ui';

const RESEND_SECONDS = 60;

export default function ResetPasswordScreen() {
  const { colors } = useTheme<Theme>();
  const insets     = useSafeAreaInsets();

  const { identifier = '', channel = 'email' } = useLocalSearchParams<{
    identifier: string;
    channel:    'email' | 'phone';
  }>();

  const forgot = useForgotPassword();
  const reset  = useResetPassword();

  const [showPassword, setShowPassword] = useState(false);
  const [countdown, setCountdown]       = useState(RESEND_SECONDS);
  const [canResend, setCanResend]       = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { code: '', newPassword: '', confirm: '' },
    mode: 'onBlur',
  });

  // Countdown timer for the resend button
  React.useEffect(() => {
    if (countdown <= 0) { setCanResend(true); return; }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  // If the user lands here without an identifier, send them back.
  React.useEffect(() => {
    if (!identifier) router.replace('/(guest)/auth/forgot-password');
  }, [identifier]);

  const handleResend = async () => {
    if (!canResend || forgot.isPending) return;
    try {
      await forgot.mutateAsync(
        channel === 'email' ? { email: identifier } : { phone: identifier },
      );
      setCountdown(RESEND_SECONDS);
      setCanResend(false);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      Alert.alert('Could not resend code', message);
    }
  };

  const onSubmit = async (data: ResetPasswordFormValues) => {
    try {
      await reset.mutateAsync({
        ...(channel === 'email' ? { email: identifier } : { phone: identifier }),
        code:        data.code,
        newPassword: data.newPassword,
      });

      Alert.alert(
        'Password updated',
        'You can now sign in with your new password.',
        [{ text: 'Sign in', onPress: () => router.replace('/(guest)/auth/login') }],
      );
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      Alert.alert('Could not reset password', message);
    }
  };

  const isEmail = channel === 'email';
  const masked  = isEmail
    ? identifier.replace(/(.{2}).+(@.+)/, '$1•••$2')
    : identifier.replace(/(\+?\d{1,3})\d+(\d{4})/, '$1•••••$2');

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
        <Box gap="xs" marginBottom="2xl">
          <Text variant="h1">Set a new password</Text>
          <Text variant="body" color="textSecondary">
            Enter the 6-digit code we sent to{'\n'}
            <Text variant="bodyMedium">{masked}</Text>
          </Text>
        </Box>

        <Box marginBottom="2xl">
          <Controller
            control={control}
            name="code"
            render={({ field }) => (
              <OtpInput
                value={field.value}
                onChange={field.onChange}
                error={Boolean(errors.code)}
              />
            )}
          />
          {errors.code?.message && (
            <Text variant="caption" color="error" textAlign="center" marginTop="m">
              {errors.code.message}
            </Text>
          )}
        </Box>

        <Box gap="m" marginBottom="2xl">
          <Controller
            control={control}
            name="newPassword"
            render={({ field }) => (
              <Input
                label="New password"
                placeholder="Min. 8 characters"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                secureTextEntry={!showPassword}
                returnKeyType="next"
                error={errors.newPassword?.message}
                suffix={
                  <Pressable onPress={() => setShowPassword((v) => !v)}>
                    {showPassword
                      ? <EyeSlash size={20} color={colors.textTertiary} variant="Linear" />
                      : <Eye     size={20} color={colors.textTertiary} variant="Linear" />
                    }
                  </Pressable>
                }
              />
            )}
          />

          <Controller
            control={control}
            name="confirm"
            render={({ field }) => (
              <Input
                label="Confirm password"
                placeholder="Repeat password"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleSubmit(onSubmit)}
                error={errors.confirm?.message}
              />
            )}
          />
        </Box>

        <Button
          label={reset.isPending ? 'Updating…' : 'Update password'}
          variant="primary"
          disabled={reset.isPending}
          onPress={handleSubmit(onSubmit)}
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
              {forgot.isPending ? 'Sending…' : 'Resend code'}
            </Text>
          ) : (
            <Text variant="caption" color="textTertiary">
              Resend in {countdown}s
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
  resendLink: {
    fontWeight:         '600',
    textDecorationLine: 'underline',
  },
});
