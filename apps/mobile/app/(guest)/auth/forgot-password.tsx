import { zodResolver } from '@hookform/resolvers/zod';
import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import React from 'react';
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
import type { ForgotPasswordFormValues } from '@/lib/validation/auth';
import { forgotPasswordSchema } from '@/lib/validation/auth';

import { useForgotPassword } from '@/features/auth/hooks';

import type { Theme } from '@/theme';
import { Box, Button, Input, PhoneInput, Text } from '@/components/ui';

type Mode = 'email' | 'phone';

export default function ForgotPasswordScreen() {
  const { colors } = useTheme<Theme>();
  const insets     = useSafeAreaInsets();

  const forgot = useForgotPassword();

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { mode: 'email', identifier: '' },
    mode: 'onBlur',
  });

  const mode = watch('mode');

  const switchMode = (m: Mode) => {
    setValue('mode',       m,  { shouldValidate: false });
    setValue('identifier', '', { shouldValidate: false });
  };

  const onSubmit = async (data: ForgotPasswordFormValues) => {
    try {
      await forgot.mutateAsync(
        data.mode === 'email'
          ? { email: data.identifier }
          : { phone: data.identifier },
      );

      router.push({
        pathname: '/(guest)/auth/reset-password',
        params:   { identifier: data.identifier, channel: data.mode },
      });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      Alert.alert('Could not send code', message);
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
          <Text variant="h1">Reset your password</Text>
          <Text variant="body" color="textSecondary">
            We&apos;ll send a 6-digit code to your{' '}
            {mode === 'email' ? 'email' : 'phone'} so you can set a new password.
          </Text>
        </Box>

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
              onPress={() => switchMode(m)}
              style={[
                styles.toggle,
                { backgroundColor: mode === m ? colors.bgPrimary : colors.transparent },
              ]}
            >
              <Text
                variant="captionMedium"
                style={{
                  color:      mode === m ? colors.textPrimary : colors.textSecondary,
                  fontWeight: mode === m ? '600' : '400',
                }}
              >
                {m === 'email' ? 'Email' : 'Phone'}
              </Text>
            </Pressable>
          ))}
        </Box>

        <Box gap="m" marginBottom="3xl">
          <Controller
            control={control}
            name="identifier"
            render={({ field }) =>
              mode === 'email' ? (
                <Input
                  label="Email address"
                  placeholder="you@example.com"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit(onSubmit)}
                  error={errors.identifier?.message}
                />
              ) : (
                <PhoneInput
                  label="Phone number"
                  onChange={(meta) => field.onChange(meta.e164)}
                  error={errors.identifier?.message}
                />
              )
            }
          />
        </Box>

        <Button
          label={forgot.isPending ? 'Sending code…' : 'Send reset code'}
          variant="primary"
          disabled={forgot.isPending}
          onPress={handleSubmit(onSubmit)}
        />

        <Box flexDirection="row" justifyContent="center" gap="xs" marginTop="2xl">
          <Text variant="caption" color="textSecondary">
            Remembered it?
          </Text>
          <Text
            variant="caption"
            style={[styles.switchLink, { color: colors.textPrimary }]}
            onPress={() => router.replace('/(guest)/auth/login')}
          >
            Back to sign in
          </Text>
        </Box>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:   { flex: 1, backgroundColor: 'transparent' },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 8 },
  toggle: {
    flex:           1,
    height:         34,
    borderRadius:   9999,
    alignItems:     'center',
    justifyContent: 'center',
  },
  switchLink: {
    fontWeight:         '600',
    textDecorationLine: 'underline',
  },
});
