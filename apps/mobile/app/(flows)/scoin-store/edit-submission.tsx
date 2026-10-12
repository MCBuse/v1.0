import { useTheme } from '@shopify/restyle';
import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'iconsax-react-native';
import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';

import { Box, Button, Input, Text } from '@/components/ui';
import {
  useSubmission,
  useUpdateSubmission,
} from '@/features/scoin-store';
import { t } from '@/lib/i18n';
import type { Theme } from '@/theme';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  ticker: z.string().min(1, 'Ticker is required').max(10),
  contract: z.string().min(1, 'Contract address is required'),
  reserve: z.string().optional(),
  attestation: z.string().url('Must be a valid URL').optional().or(z.literal('')),
});

type FormValues = z.infer<typeof schema>;

export default function EditSubmissionScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const submission = useSubmission(id ?? '');
  const update = useUpdateSubmission(id ?? '');
  const data = submission.data;

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: data
      ? {
          name: data.name,
          ticker: data.ticker,
          contract: data.contractAddress,
          reserve: data.reserveDisclosure ?? '',
          attestation: data.attestationUrl ?? '',
        }
      : undefined,
  });

  async function onSubmit(values: FormValues) {
    try {
      await update.mutateAsync({
        name: values.name,
        ticker: values.ticker,
        contract: values.contract,
        reserve: values.reserve,
        attestation: values.attestation || undefined,
      });
      Alert.alert('Updated', 'Submission updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert('Error', 'Could not update. Please try again.');
    }
  }

  if (submission.isLoading) {
    return (
      <Box flex={1} backgroundColor="bgPrimary" justifyContent="center" alignItems="center">
        <ActivityIndicator color={colors.textPrimary} />
      </Box>
    );
  }

  return (
    <Box flex={1} backgroundColor="bgPrimary">
      <Box
        flexDirection="row"
        alignItems="center"
        paddingHorizontal="l"
        gap="m"
        style={{ paddingTop: insets.top + 8, paddingBottom: 12 }}
      >
        <Pressable onPress={() => router.back()}>
          <ArrowLeft size={24} color={colors.textPrimary} variant="Linear" />
        </Pressable>
        <Text variant="h3" style={{ flex: 1 }}>
          {t('issuer.editSubmission')}
        </Text>
      </Box>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingBottom: insets.bottom + 24,
            gap: 16,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label={t('issuer.form.name')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.name?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="ticker"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label={t('issuer.form.ticker')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.ticker?.message}
                autoCapitalize="characters"
              />
            )}
          />

          <Controller
            control={control}
            name="contract"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label={t('issuer.form.contractAddress')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.contract?.message}
                autoCapitalize="none"
              />
            )}
          />

          <Controller
            control={control}
            name="reserve"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label={t('issuer.form.reserveDisclosure')}
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.reserve?.message}
                multiline
              />
            )}
          />

          <Controller
            control={control}
            name="attestation"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label={t('issuer.form.attestationUrl')}
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.attestation?.message}
                autoCapitalize="none"
                keyboardType="url"
              />
            )}
          />

          <Box marginTop="m">
            <Button
              label="Save changes"
              onPress={handleSubmit(onSubmit)}
              loading={update.isPending}
              size="lg"
            />
          </Box>
        </ScrollView>
      </KeyboardAvoidingView>
    </Box>
  );
}
