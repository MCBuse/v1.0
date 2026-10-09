import { useTheme } from '@shopify/restyle';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { ArrowLeft } from 'iconsax-react-native';
import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';

import { Box, Button, Input, Text } from '@/components/ui';
import { useCreateSubmission } from '@/features/scoin-store';
import { t } from '@/lib/i18n';
import type { Theme } from '@/theme';

const schema = z.object({
  issuer: z.string().min(1, 'Issuer organization slug is required'),
  name: z.string().min(1, 'Stablecoin name is required'),
  ticker: z
    .string()
    .min(1, 'Ticker is required')
    .max(10, 'Ticker too long')
    .transform((v) => v.toUpperCase()),
  network: z.string().min(1, 'Network is required'),
  contract: z.string().min(1, 'Contract address is required'),
  reserve: z.string().min(1, 'Reserve disclosure is required'),
  attestation: z.string().url('Must be a valid URL'),
});

type FormValues = z.infer<typeof schema>;

const NETWORKS = ['solana', 'ethereum', 'base', 'polygon', 'other'];

export default function CreateSubmissionScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const createSubmission = useCreateSubmission();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      issuer: '',
      name: '',
      ticker: '',
      network: 'solana',
      contract: '',
      reserve: '',
      attestation: '',
    },
  });

  async function onSubmit(values: FormValues) {
    try {
      await createSubmission.mutateAsync(values);
      Alert.alert('Success', 'Stablecoin submission created as draft.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert('Error', 'Could not create submission. Please try again.');
    }
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
          {t('issuer.createSubmission')}
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
            name="issuer"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Organization slug"
                placeholder="e.g. my-issuer-org"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.issuer?.message}
                autoCapitalize="none"
              />
            )}
          />

          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label={t('issuer.form.name')}
                placeholder="e.g. Cedi Stablecoin"
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
                placeholder="e.g. cGHS"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.ticker?.message}
                autoCapitalize="characters"
              />
            )}
          />

          <Box gap="xs">
            <Text variant="caption" color="textSecondary">
              {t('issuer.form.network')}
            </Text>
            <Controller
              control={control}
              name="network"
              render={({ field: { onChange, value } }) => (
                <Box flexDirection="row" gap="s" style={styles.wrap}>
                  {NETWORKS.map((n) => (
                    <Pressable
                      key={n}
                      onPress={() => onChange(n)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor:
                            value === n ? colors.textPrimary : colors.bgSecondary,
                        },
                      ]}
                    >
                      <Text
                        variant="caption"
                        style={{
                          color: value === n ? colors.bgPrimary : colors.textSecondary,
                          textTransform: 'capitalize',
                        }}
                      >
                        {n}
                      </Text>
                    </Pressable>
                  ))}
                </Box>
              )}
            />
          </Box>

          <Controller
            control={control}
            name="contract"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label={t('issuer.form.contractAddress')}
                placeholder="Token contract address"
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
                placeholder="Describe reserve backing"
                value={value}
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
                placeholder="https://..."
                value={value}
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
              label="Create draft"
              onPress={handleSubmit(onSubmit)}
              loading={createSubmission.isPending}
              size="lg"
            />
          </Box>
        </ScrollView>
      </KeyboardAvoidingView>
    </Box>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
  },
  wrap: { flexWrap: 'wrap' },
});
