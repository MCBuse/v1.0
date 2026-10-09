import { useTheme } from '@shopify/restyle';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Edit2 } from 'iconsax-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button, ComplianceBadge, Text } from '@/components/ui';
import { ComplianceTimeline } from '@/components/ui/ComplianceTimeline';
import {
  useSubmission,
  useSubmitForReview,
} from '@/features/scoin-store';
import { t } from '@/lib/i18n';
import { truncateAddress } from '@/lib/currency';
import type { Theme } from '@/theme';

export default function SubmissionDetailScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const submission = useSubmission(id ?? '');
  const submitForReview = useSubmitForReview(id ?? '');

  const data = submission.data;
  const canEdit = data?.status === 'draft' || data?.status === 'needs_changes';
  const canSubmit = canEdit;

  function handleSubmitForReview() {
    Alert.alert(
      'Submit for review',
      'This will submit your stablecoin for compliance review. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: async () => {
            try {
              await submitForReview.mutateAsync();
              Alert.alert('Submitted', 'Your stablecoin is now under review.');
            } catch {
              Alert.alert('Error', 'Could not submit. Please try again.');
            }
          },
        },
      ],
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
          Submission
        </Text>
        {canEdit && (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(flows)/scoin-store/edit-submission',
                params: { id: id ?? '' },
              } as never)
            }
          >
            <Edit2 size={22} color={colors.textPrimary} variant="Linear" />
          </Pressable>
        )}
      </Box>

      {submission.isLoading && (
        <Box flex={1} justifyContent="center" alignItems="center">
          <ActivityIndicator color={colors.textPrimary} />
        </Box>
      )}

      {submission.error && (
        <Box flex={1} justifyContent="center" alignItems="center" paddingHorizontal="2xl">
          <Text variant="body" color="textTertiary" style={{ textAlign: 'center' }}>
            Could not load submission.
          </Text>
          <Box marginTop="l">
            <Button
              label={t('common.retry')}
              variant="secondary"
              onPress={() => submission.reload()}
            />
          </Box>
        </Box>
      )}

      {data && (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingBottom: insets.bottom + 24,
            gap: 20,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Box alignItems="center" gap="s" paddingVertical="m">
            <Text variant="h2">
              {data.name} ({data.ticker})
            </Text>
            <ComplianceBadge status={data.status} size="md" />
          </Box>

          {/* Details */}
          <Box backgroundColor="bgSecondary" borderRadius="xl" padding="l" gap="m">
            <InfoRow label="Network" value={data.network} capitalize />
            <InfoRow
              label="Contract"
              value={truncateAddress(data.contractAddress, 8)}
              mono
            />
            {data.reserveDisclosure && (
              <InfoRow label="Reserve" value={data.reserveDisclosure} />
            )}
            {data.attestationUrl && (
              <InfoRow label="Attestation" value={data.attestationUrl} />
            )}
            <InfoRow label="Version" value={`v${data.version}`} />
          </Box>

          {/* Timeline */}
          <Box backgroundColor="bgSecondary" borderRadius="xl" padding="l" gap="m">
            <Text variant="bodyMedium">Review timeline</Text>
            <ComplianceTimeline events={data.reviewEvents ?? []} />
          </Box>

          {/* Actions */}
          {canSubmit && (
            <Button
              label={t('issuer.submitForReview')}
              onPress={handleSubmitForReview}
              loading={submitForReview.isPending}
              size="lg"
            />
          )}
        </ScrollView>
      )}
    </Box>
  );
}

function InfoRow({
  label,
  value,
  mono,
  capitalize: cap,
}: {
  label: string;
  value: string;
  mono?: boolean;
  capitalize?: boolean;
}) {
  return (
    <Box flexDirection="row" justifyContent="space-between">
      <Text variant="caption" color="textTertiary">
        {label}
      </Text>
      <Text
        variant="caption"
        style={[
          mono && styles.monoText,
          cap && styles.capitalize,
        ]}
      >
        {value}
      </Text>
    </Box>
  );
}

const styles = StyleSheet.create({
  monoText: { fontFamily: 'IBMPlexSans_400Regular', letterSpacing: 0.5 },
  capitalize: { textTransform: 'capitalize' },
});
