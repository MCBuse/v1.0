import { zodResolver } from '@hookform/resolvers/zod';
import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
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

import { ApiError, authSession } from '@/lib/api';
import type { RegisterFormValues } from '@/lib/validation/auth';
import { registerSchema } from '@/lib/validation/auth';
import { Eye, EyeSlash } from 'iconsax-react-native';

import { useCompleteAuth, useSignup } from '@/features/auth/hooks';
import { usePendingAuthStore } from '@/features/auth/pending-store';
import {
  isUsernameFormatValid,
  normalizeUsernameInput,
  useUsernameAvailability,
} from '@/features/users';

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
  const [usernameForCheck, setUsernameForCheck] = useState('');

  const completeAuth = useCompleteAuth();
  const signup       = useSignup();
  const setPending   = usePendingAuthStore((s) => s.set);

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
      username:   '',
      identifier: '',
      password:   '',
      confirm:    '',
    },
    mode: 'onBlur',
  });

  const mode = watch('mode');
  const username = watch('username');
  const normalizedUsername = normalizeUsernameInput(username);
  const usernameCheck = useUsernameAvailability(usernameForCheck, usernameForCheck.length > 0);

  useEffect(() => {
    if (!isUsernameFormatValid(normalizedUsername)) {
      setUsernameForCheck('');
      return;
    }

    const timer = setTimeout(() => setUsernameForCheck(normalizedUsername), 350);
    return () => clearTimeout(timer);
  }, [normalizedUsername]);

  const switchMode = (m: Mode) => {
    setValue('mode',       m,  { shouldValidate: false });
    setValue('identifier', '', { shouldValidate: false });
  };

  const onSubmit = async (data: RegisterFormValues) => {
    const { firstName, lastName } = splitName(data.fullName);
    const cleanUsername = normalizeUsernameInput(data.username);

    if (usernameCheck.data && usernameCheck.data.username === cleanUsername && !usernameCheck.data.available) {
      Alert.alert('Username unavailable', 'Choose one of the suggested usernames or try another.');
      return;
    }

    try {
      const tokens = await signup.mutateAsync({
        firstName,
        lastName,
        username: cleanUsername,
        password: data.password,
        ...(data.mode === 'email'
          ? { email: data.identifier }
          : { phone: data.identifier }),
      });

      if (data.mode === 'phone') {
        await authSession.set(tokens);
        setPending({ tokens, identifier: data.identifier, channel: 'phone', flow: 'register' });
        router.push({ pathname: '/(guest)/auth/otp', params: { identifier: data.identifier, flow: 'register' } });
      } else {
        await completeAuth(tokens);
        router.replace('/(tabs)');
      }
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
            name="username"
            render={({ field }) => {
              const availability = usernameCheck.data;
              const checked = availability?.username === normalizedUsername;
              const taken = checked && !availability.available;
              const available = checked && availability.available;

              return (
                <Box gap="s">
                  <Input
                    label="Username"
                    prefix="@"
                    placeholder="fred123"
                    value={field.value}
                    onChangeText={(value) => field.onChange(normalizeUsernameInput(value))}
                    onBlur={field.onBlur}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    returnKeyType="next"
                    error={errors.username?.message || (taken ? 'That username is taken' : undefined)}
                    hint={
                      available
                        ? 'Username available'
                        : 'Lowercase letters, numbers, and underscores'
                    }
                  />
                  {taken && availability.suggestions.length > 0 && (
                    <Box flexDirection="row" flexWrap="wrap" gap="s">
                      {availability.suggestions.map((suggestion) => (
                        <Pressable
                          key={suggestion}
                          onPress={() => setValue('username', suggestion, { shouldValidate: true })}
                          style={[
                            styles.suggestionChip,
                            { backgroundColor: colors.bgSecondary, borderColor: colors.borderDefault },
                          ]}
                        >
                          <Text variant="captionMedium">@{suggestion}</Text>
                        </Pressable>
                      ))}
                    </Box>
                  )}
                </Box>
              );
            }}
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
  suggestionChip: {
    borderWidth:        1,
    borderRadius:       999,
    paddingHorizontal: 12,
    paddingVertical:    7,
  },
});
