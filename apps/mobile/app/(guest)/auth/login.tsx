import { zodResolver } from '@hookform/resolvers/zod';
import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LoginFormValues } from '@/lib/validation/auth';
import { loginSchema } from '@/lib/validation/auth';
import type { Theme } from '@/theme';
import { Box, Button, Input, Text } from '@/components/ui';
import { Icon } from '@/components/ui';

type Mode = 'email' | 'phone';

export default function LoginScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const [showPassword, setShowPassword] = useState(false);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isValid },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { mode: 'email', identifier: '', password: '' },
    mode: 'onBlur',
  });

  const mode = watch('mode');

  const switchMode = (m: Mode) => {
    setValue('mode', m, { shouldValidate: false });
    setValue('identifier', '', { shouldValidate: false });
  };

  const onSubmit = (data: LoginFormValues) => {
    router.push({
      pathname: '/(guest)/auth/otp',
      params: { identifier: data.identifier, flow: 'login' },
    });
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
            name="identifier"
            render={({ field }) => (
              <Input
                label={mode === 'email' ? 'Email address' : 'Phone number'}
                placeholder={mode === 'email' ? 'you@example.com' : '+1 555 000 0000'}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                keyboardType={mode === 'email' ? 'email-address' : 'phone-pad'}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                error={errors.identifier?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field }) => (
              <Input
                label="Password"
                placeholder="Min. 6 characters"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleSubmit(onSubmit)}
                error={errors.password?.message}
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
            )}
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

        <Button
          label="Sign in"
          variant="primary"
          onPress={handleSubmit(onSubmit)}
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
  flex:   { flex: 1, backgroundColor: 'transparent' },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 8 },
  toggle: {
    flex:              1,
    height:            34,
    borderRadius:      9999,
    alignItems:        'center',
    justifyContent:    'center',
  },
  forgotLink: {
    fontWeight:          '500',
    textDecorationLine:  'underline',
  },
  switchLink: {
    fontWeight:          '600',
    textDecorationLine:  'underline',
  },
});
