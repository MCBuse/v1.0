import { zodResolver } from '@hookform/resolvers/zod';
import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
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
import type { RegisterFormValues } from '@/lib/validation/auth';
import { registerSchema } from '@/lib/validation/auth';
import { Eye, EyeSlash } from 'iconsax-react-native';

import { useSignup } from '@/features/auth/hooks';
import { usePendingAuthStore } from '@/features/auth/pending-store';

import type { Theme } from '@/theme';
import { Box, Button, Input, PhoneInput, Text } from '@/components/ui';

type Mode = 'email' | 'phone';

function splitName(full: string): { firstName: string; lastName: string } {
  const trimmed = full.trim().replace(/\s+/g, ' ');
  const parts   = trimmed.split(' ');
  if (parts.length === 1) return { firstName: parts[0] ?? '', lastName: parts[0] ?? '' };
  return {
    firstName: parts[0]!,
    lastName:  parts.slice(1).join(' '),
  };
}

export default function RegisterScreen() {
  const { colors } = useTheme<Theme>();
  const insets     = useSafeAreaInsets();
  const [showPassword, setShowPassword] = useState(false);

  const setPending = usePendingAuthStore((s) => s.set);
  const signup     = useSignup();

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      mode:       'email',
      fullName:   '',
      identifier: '',
      password:   '',
      confirm:    '',
    },
    mode: 'onBlur',
  });

  const mode = watch('mode');

  const switchMode = (m: Mode) => {
    setValue('mode',       m,  { shouldValidate: false });
    setValue('identifier', '', { shouldValidate: false });
  };

  const onSubmit = async (data: RegisterFormValues) => {
    const { firstName, lastName } = splitName(data.fullName);

    try {
      const tokens = await signup.mutateAsync({
        firstName,
        lastName,
        password: data.password,
        ...(data.mode === 'email'
          ? { email: data.identifier }
          : { phone: data.identifier }),
      });

      setPending({
        tokens,
        identifier: data.identifier,
        channel:    data.mode,
        flow:       'register',
      });

      router.push({
        pathname: '/(guest)/auth/otp',
        params:   { identifier: data.identifier, flow: 'register' },
      });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      Alert.alert('Sign up failed', message);
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

        {/* Fields */}
        <Box gap="m">
          <Controller
            control={control}
            name="fullName"
            render={({ field }) => (
              <Input
                label="Full name"
                placeholder="Your name"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                autoCapitalize="words"
                returnKeyType="next"
                error={errors.fullName?.message}
              />
            )}
          />

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
                  returnKeyType="next"
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

          <Controller
            control={control}
            name="password"
            render={({ field }) => (
              <Input
                label="Password"
                placeholder="Min. 8 characters"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                secureTextEntry={!showPassword}
                returnKeyType="next"
                error={errors.password?.message}
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

        {/* Terms */}
        <Box marginTop="l" marginBottom="3xl">
          <Text variant="caption" color="textTertiary" textAlign="center">
            By continuing you agree to our{' '}
            <Text
              variant="caption"
              style={[styles.link, { color: colors.textPrimary }]}
              onPress={() => { /* TODO: open terms */ }}
            >
              Terms of Service
            </Text>{' '}
            and{' '}
            <Text
              variant="caption"
              style={[styles.link, { color: colors.textPrimary }]}
              onPress={() => { /* TODO: open privacy */ }}
            >
              Privacy Policy
            </Text>.
          </Text>
        </Box>

        <Button
          label={signup.isPending ? 'Creating account…' : 'Create account'}
          variant="primary"
          disabled={signup.isPending}
          onPress={handleSubmit(onSubmit)}
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
  flex:   { flex: 1, backgroundColor: 'transparent' },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 8 },
  toggle: {
    flex:           1,
    height:         34,
    borderRadius:   9999,
    alignItems:     'center',
    justifyContent: 'center',
  },
  link:       { fontWeight: '500', textDecorationLine: 'underline' },
  switchLink: { fontWeight: '600', textDecorationLine: 'underline' },
});
